import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtUser } from './auth.types';

interface AuthenticatedRequest {
  user: JwtUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

export function JwtAuthGuard(): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(AuthGuard('jwt')));
}
