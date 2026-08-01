import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

export const REQUEST_ID_HEADER = 'x-request-id';

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

interface HttpResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const incomingId = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incomingId === 'string' && incomingId.length > 0 ? incomingId : randomUUID();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}
