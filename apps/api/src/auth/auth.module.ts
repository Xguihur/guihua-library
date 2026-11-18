import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PASSWORD_HASHER, scryptPasswordHasher } from '../common/password';
import { AuthenticatedGuard, SessionGuard } from './session.guard';
import { RateLimiterService, RATE_CLOCK_TOKEN, RATE_LIMITER_TOKEN, SystemRateClock } from './rate-limiter.service';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: RATE_CLOCK_TOKEN, useClass: SystemRateClock },
    { provide: PASSWORD_HASHER, useValue: scryptPasswordHasher },
    RateLimiterService,
    { provide: RATE_LIMITER_TOKEN, useExisting: RateLimiterService },
    SessionService,
    SessionGuard,
    AuthenticatedGuard,
  ],
  exports: [
    RateLimiterService,
    RATE_LIMITER_TOKEN,
    RATE_CLOCK_TOKEN,
    PASSWORD_HASHER,
    SessionService,
    SessionGuard,
    AuthenticatedGuard,
  ],
})
export class AuthModule {}
