import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Config } from './config';

export type AuthRequest = Request & { owner: string };
const equal = (a: unknown, b: string): boolean => {
  if (typeof a !== 'string' || a.length === 0) return false;
  const supplied = Buffer.from(a, 'utf8');
  const expected = Buffer.from(b, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: Config) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!equal(req.headers['x-api-key'], this.config.apiKey)) throw new UnauthorizedException();
    req.owner = 'api';
    return true;
  }
}
