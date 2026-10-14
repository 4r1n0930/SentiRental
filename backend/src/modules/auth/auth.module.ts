import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { CryptoService } from '../../common/utils/crypto.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: {
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, GoogleOAuthService, CryptoService],
  exports: [AuthService, TokenService, CryptoService],
})
export class AuthModule {}
