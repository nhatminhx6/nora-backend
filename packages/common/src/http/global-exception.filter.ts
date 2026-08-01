import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiResponse } from './api-response';

interface RequestWithContext {
  method?: string;
  url?: string;
  requestId?: string;
}

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: ApiResponse<never>): void;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<HttpResponse>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.getPayload(exception);
    const message = this.getMessage(payload, status);
    const code = typeof payload.code === 'string' ? payload.code : this.defaultCode(status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method ?? 'UNKNOWN'} ${request.url ?? 'UNKNOWN'} failed`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      data: null,
      error: { code, ...(payload.details === undefined ? {} : { details: payload.details }) },
      message,
      timestamp: new Date().toISOString(),
      requestId: request.requestId ?? 'unknown',
    });
  }

  private getPayload(exception: unknown): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : (response as ErrorPayload);
  }

  private getMessage(payload: ErrorPayload, status: number): string {
    if (typeof payload.message === 'string') {
      return payload.message;
    }
    if (Array.isArray(payload.message)) {
      return 'Request validation failed';
    }
    return status >= 500 ? 'An unexpected error occurred' : 'Request failed';
  }

  private defaultCode(status: number): string {
    return status === HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`;
  }
}
