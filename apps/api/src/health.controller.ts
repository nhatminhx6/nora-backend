import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@nora/database';

interface HealthResponse {
  status: 'ok';
  service: 'api';
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }

  @Get('data-pipeline')
  async getDataPipelineHealth() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [runs, pendingLocalizations, rejectedEvents] = await Promise.all([
      this.prisma.pipelineRun.groupBy({
        by: ['pipeline', 'status'],
        where: { startedAt: { gte: since } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      this.prisma.insight.count({
        where: {
          userInsights: { some: {} },
          OR: [
            { localizations: { none: { locale: 'vi' } } },
            { localizations: { none: { locale: 'en' } } },
          ],
        },
      }),
      this.prisma.event.count({
        where: { status: 'REJECTED', updatedAt: { gte: since } },
      }),
    ]);
    return {
      windowHours: 24,
      pendingLocalizations,
      rejectedEvents,
      runs: runs.map((run) => ({
        pipeline: run.pipeline,
        status: run.status,
        count: run._count._all,
        averageDurationMs: Math.round(run._avg.durationMs ?? 0),
      })),
    };
  }
}
