import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import { AuthService, type AuthTokensResponse, type PublicUserView } from './auth.service';
import {
  ForgotPasswordDto,
  GoogleAuthQueryDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and send a verification email' })
  register(@Body() dto: RegisterDto): Promise<PublicUserView> {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair' })
  login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<AuthTokensResponse> {
    return this.authService.login(dto, { ipAddress, userAgent: request.headers['user-agent'] });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token (reuse revokes the whole family)' })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<AuthTokensResponse> {
    return this.authService.refresh(dto.refreshToken, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session or every session' })
  logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logout(dto.refreshToken, user.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link (always returns 200)' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string; devToken?: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Consume a reset token and revoke all sessions' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Activate an account with an email verification token' })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the verification email when still pending' })
  resendVerification(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string; devToken?: string }> {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/start')
  @ApiOperation({ summary: 'Begin Google sign-in and receive the authorization URL' })
  googleStart(@Query('redirectUri') redirectUri?: string): Promise<{ authorizationUrl: string }> {
    return this.authService.startGoogleLogin(redirectUri);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('google/exchange')
  @ApiOperation({ summary: 'Complete Google sign-in with an authorization code' })
  googleExchange(
    @Body() dto: GoogleAuthQueryDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ): Promise<AuthTokensResponse> {
    return this.authService.completeGoogleLogin(dto, {
      ipAddress,
      userAgent: request.headers['user-agent'],
    });
  }
}
