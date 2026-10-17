import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Config } from './config';
import { Store } from './store';

export type AuthRequest = Request & { owner: string };
export const COOKIE = 'ui_session';
const hash = (value: string) => createHash('sha256').update(value).digest();
const equal = (a: unknown, b: string): boolean => {
  if (typeof a !== 'string' || a.length === 0) return false;
  const supplied = Buffer.from(a, 'utf8');
  const expected = Buffer.from(b, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

@Injectable()
export class Sessions {
  private attempts = 0;
  private window = Date.now();
  constructor(private readonly config: Config, private readonly store: Store) {}

  checkOrigin(req: Request) {
    if (req.get('origin') !== this.config.uiOrigin) throw new ForbiddenException('Origin not allowed');
  }

  create(code: unknown) {
    const now = Date.now();
    if (now - this.window >= 60000) { this.window = now; this.attempts = 0; }
    if (++this.attempts > 20) throw new HttpException('Too many login attempts', 429);
    if (!equal(code, this.config.uiCode)) throw new UnauthorizedException();
    this.store.prune();
    if (this.store.sessionCount() >= 1000) throw new ServiceUnavailableException('Session capacity exhausted');
    const token = randomBytes(32).toString('hex');
    const expires = now + this.config.sessionTtl;
    this.store.sessionPut(hash(token).toString('hex'), expires);
    return { token, expires };
  }

  authenticate(req: Request): string {
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const id = hash(token).toString('hex');
    const expires = this.store.sessionGet(id);
    if (!expires || expires <= Date.now()) {
      this.store.sessionDelete(id);
      throw new UnauthorizedException();
    }
    return id;
  }

  revoke(id: string) { this.store.sessionDelete(id); }
}

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

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: Sessions) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET', 'HEAD'].includes(req.method)) this.sessions.checkOrigin(req);
    req.owner = this.sessions.authenticate(req);
    return true;
  }
}
