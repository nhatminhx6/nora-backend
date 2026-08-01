import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse } from './api-response';

interface RequestWithContext {
  requestId?: string;
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        error: null,
        message: 'Request completed successfully',
        timestamp: new Date().toISOString(),
        requestId: request.requestId ?? 'unknown',
      })),
    );
  }
}
