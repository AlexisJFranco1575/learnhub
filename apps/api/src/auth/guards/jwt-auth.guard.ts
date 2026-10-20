import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}