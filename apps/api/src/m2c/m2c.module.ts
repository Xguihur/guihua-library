import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { ChallengeService } from './challenge.service';
import { githubUsername } from './digest';
import { GITHUB_CLIENT } from './github-client';
import { HttpGitHubClient } from './http-github-client';
import { IdentityService } from './identity.service';
import { MailService } from './mail.service';
import { OAuthController } from './oauth.controller';
import { GITHUB_USERNAME, OAuthService } from './oauth.service';
import { ReauthService } from './reauth.service';

/** M2c §6: GitHub login/link/reauth, login methods and email-verified password. */
@Module({
  controllers: [AccountController, OAuthController],
  providers: [
    HttpGitHubClient,
    { provide: GITHUB_CLIENT, useExisting: HttpGitHubClient },
    { provide: GITHUB_USERNAME, useValue: githubUsername },
    OAuthService,
    ReauthService,
    ChallengeService,
    MailService,
    IdentityService,
  ],
  exports: [OAuthService, ReauthService, ChallengeService, MailService, IdentityService],
})
export class M2cModule {}
