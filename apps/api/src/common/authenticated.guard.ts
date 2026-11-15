import { type CanActivate, Injectable } from '@nestjs/common';
import { unauthorizedError } from './api-exception';

/**
 * M1 has no authentication yet, so every write is rejected with 401 instead of
 * pretending a session exists. M2 replaces this with real session validation.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(): boolean {
    throw unauthorizedError();
  }
}
