import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@nora/database';
import { ContentJobData, contentJobLogMetadata } from './content-job';
import { SourceFetchError } from './raw-source-payload.service';

const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key)/i;

@Injectable()
export class ContentPipelineTelemetryService {
  private readonly logger = new Logger(ContentPipelineTelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(data: ContentJobData, attempt: number, operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    const metadata = sanitizeLogMetadata(contentJobLogMetadata(data, attempt));
    const child = await this.prisma.pipelineRun.create({
      data: {
        pipeline: 'content-v2-job',
        status: 'RUNNING',
        sourceId: data.sourceId,
        metadata: { ...metadata, rootPipelineRunId: data.pipelineRunId },
      },
      select: { id: true },
    });
    this.write('start', { ...metadata, childPipelineRunId: child.id });
    try {
      const result = await operation();
      const durationMs = Date.now() - startedAt;
      await this.prisma.pipelineRun.update({
        where: { id: child.id },
        data: { status: 'SUCCEEDED', processedCount: 1, durationMs, completedAt: new Date() },
      });
      this.write('success', { ...metadata, childPipelineRunId: child.id, durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorCode = stableContentErrorCode(error);
      await this.prisma.pipelineRun.update({
        where: { id: child.id },
        data: {
          status: 'FAILED',
          rejectedCount: 1,
          errorCode,
          durationMs,
          completedAt: new Date(),
        },
      });
      this.write('failure', { ...metadata, childPipelineRunId: child.id, durationMs, errorCode });
      throw error;
    }
  }

  private write(event: 'start' | 'success' | 'failure', fields: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ event: `content_job_${event}`, ...sanitizeLogMetadata(fields) }),
    );
  }
}

export function stableContentErrorCode(error: unknown): string {
  if (error instanceof SourceFetchError) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(error.message)) return error.message;
  return 'CONTENT_JOB_FAILED';
}

export function sanitizeLogMetadata(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeLogValue(item),
    ]),
  );
}

function sanitizeLogValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return '[NULL]';
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (typeof value !== 'object') return String(value);
  return sanitizeLogMetadata(value as Record<string, unknown>);
}
