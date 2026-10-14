import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleTokenSet {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface GoogleProfile {
  subject: string;
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly config: AppConfig;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.config = config;
  }

  async exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<GoogleTokenSet> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: this.config.google.clientId,
      client_secret: this.config.google.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });

    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      this.logger.error(`Google token exchange failed with status ${response.status}`);
      throw new UnauthorizedException('Could not complete Google sign-in');
    }

    const payload = (await response.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      throw new UnauthorizedException('Google did not return an access token');
    }

    return {
      accessToken: payload.access_token,
      idToken: payload.id_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<GoogleProfile> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Could not read Google profile');
    }

    const payload = (await response.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
    };

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Google profile is missing required claims');
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      givenName: payload.given_name ?? null,
      familyName: payload.family_name ?? null,
    };
  }
}
