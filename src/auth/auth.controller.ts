import {
  Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOperation, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VerificationChannel } from '@prisma/client';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto, RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto, VerifyAccountDto } from './dto/verification.dto';
import { CurrentUser, JwtPayload, Public } from '../common';
import { RATE_LIMITS } from '../common/constants';
import { SessionMeta } from './session.service';

const meta = (req: Request): SessionMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'] ?? undefined,
});

const sec = (window: number) => ({ default: { limit: 1000, ttl: window * 1000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: RATE_LIMITS.register.max, ttl: RATE_LIMITS.register.window * 1000 } })
  @ApiOperation({ summary: 'تسجيل زبون جديد (CUSTOMER فقط)' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الحساب وإرجاع التوكنات' })
  @ApiResponse({ status: 400, description: 'بيانات غير صحيحة أو كلمتا المرور غير متطابقتين' })
  @ApiResponse({ status: 409, description: 'البريد أو الهاتف مستخدم مسبقاً' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, meta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.login.max, ttl: RATE_LIMITS.login.window * 1000 } })
  @ApiOperation({ summary: 'تسجيل الدخول بالبريد أو الهاتف' })
  @ApiResponse({ status: 200, description: 'توكنات الدخول' })
  @ApiResponse({ status: 401, description: 'بيانات الدخول غير صحيحة (رسالة عامة)' })
  @ApiResponse({ status: 403, description: 'الحساب غير مفعّل' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, meta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.refresh.max, ttl: RATE_LIMITS.refresh.window * 1000 } })
  @ApiOperation({ summary: 'تدوير الجلسة: Refresh Token قديم ← جديد (rotation)' })
  @ApiResponse({ status: 401, description: 'جلسة غير صالحة أو منتهية' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل خروج الجلسة الحالية (إلغاء Refresh Token)' })
  logout(@Body() dto: LogoutDto, @Req() req: Request) {
    return this.auth.logout(dto.refreshToken, undefined, meta(req));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل الخروج من كل الأجهزة' })
  logoutAll(@CurrentUser('sub') userId: string, @Req() req: Request) {
    return this.auth.logoutAll(userId, meta(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'بيانات المستخدم الحالي (آمنة فقط)' })
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'الجلسات النشطة للمستخدم الحالي' })
  sessions(@CurrentUser('sub') userId: string) {
    return this.auth.listSessions(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير كلمة المرور ثم إلغاء كل الجلسات' })
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(userId, dto, meta(req));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.forgot.max, ttl: RATE_LIMITS.forgot.window * 1000 } })
  @ApiOperation({ summary: 'طلب إعادة تعيين كلمة المرور (رد عام دائماً)' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto, meta(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: RATE_LIMITS.reset.max, ttl: RATE_LIMITS.reset.window * 1000 } })
  @ApiOperation({ summary: 'تعيين كلمة مرور جديدة عبر رمز لمرة واحدة' })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, meta(req));
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({
    default: {
      limit: RATE_LIMITS.resendVerification.max,
      ttl: RATE_LIMITS.resendVerification.window * 1000,
    },
  })
  @ApiOperation({ summary: 'إعادة إرسال رمز التحقق (محدود بمعدل)' })
  resendVerification(
    @CurrentUser('sub') userId: string,
    @Body() dto: ResendVerificationDto,
    @Req() req: Request,
  ) {
    return this.auth.resendVerification(userId, dto.channel ?? VerificationChannel.OTP, meta(req));
  }

  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تأكيد الحساب برمز التحقق' })
  verifyAccount(
    @CurrentUser('sub') userId: string,
    @Body() dto: VerifyAccountDto,
    @Req() req: Request,
  ) {
    return this.auth.verifyAccount(userId, dto.token, meta(req));
  }
}
