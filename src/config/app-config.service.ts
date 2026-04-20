import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.validation';

/**
 * Type-safe wrapper around NestJS ConfigService.
 * Use this instead of ConfigService directly throughout the app.
 *
 * @example
 * constructor(private readonly config: AppConfigService) {}
 * const port = this.config.port; // number ← type-safe
 */
@Injectable()
export class AppConfigService {
    constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

    // ========================================
    // Application
    // ========================================
    get nodeEnv(): string {
        return this.configService.get('NODE_ENV', { infer: true });
    }

    get port(): number {
        return this.configService.get('PORT', { infer: true });
    }

    get apiPrefix(): string {
        return this.configService.get('API_PREFIX', { infer: true });
    }

    get appUrl(): string {
        return this.configService.get('APP_URL', { infer: true });
    }

    get isProduction(): boolean {
        return this.nodeEnv === 'production';
    }

    get isDevelopment(): boolean {
        return this.nodeEnv === 'development';
    }

    // ========================================
    // Database
    // ========================================
    get databaseUrl(): string {
        return this.configService.get('DATABASE_URL', { infer: true });
    }

    // ========================================
    // Redis
    // ========================================
    get redisHost(): string {
        return this.configService.get('REDIS_HOST', { infer: true });
    }

    get redisPort(): number {
        return this.configService.get('REDIS_PORT', { infer: true });
    }

    get redisPassword(): string | undefined {
        return this.configService.get('REDIS_PASSWORD', { infer: true });
    }

    get redisDb(): number {
        return this.configService.get('REDIS_DB', { infer: true });
    }

    // ========================================
    // JWT
    // ========================================
    get jwtSecret(): string {
        return this.configService.get('JWT_SECRET', { infer: true });
    }

    get jwtAccessExpires(): string {
        return this.configService.get('JWT_ACCESS_EXPIRES', { infer: true });
    }

    get jwtRefreshExpires(): string {
        return this.configService.get('JWT_REFRESH_EXPIRES', { infer: true });
    }

    // ========================================
    // OTP
    // ========================================
    get otpLength(): number {
        return this.configService.get('OTP_LENGTH', { infer: true });
    }

    get otpExpiresSeconds(): number {
        return this.configService.get('OTP_EXPIRES_SECONDS', { infer: true });
    }

    get otpMaxAttempts(): number {
        return this.configService.get('OTP_MAX_ATTEMPTS', { infer: true });
    }

    // ========================================
    // SMS
    // ========================================
    get kavenegarApiKey(): string | undefined {
        return this.configService.get('KAVENEGAR_API_KEY', { infer: true });
    }

    get kavenegarSender(): string | undefined {
        return this.configService.get('KAVENEGAR_SENDER', { infer: true });
    }

    // ========================================
    // Payment
    // ========================================
    get zarinpalMerchantId(): string | undefined {
        return this.configService.get('ZARINPAL_MERCHANT_ID', { infer: true });
    }

    get zarinpalCallbackUrl(): string | undefined {
        return this.configService.get('ZARINPAL_CALLBACK_URL', { infer: true });
    }

    // ========================================
    // Storage (S3/MinIO)
    // ========================================
    get s3Endpoint(): string {
        return this.configService.get('S3_ENDPOINT', { infer: true });
    }

    get s3AccessKey(): string {
        return this.configService.get('S3_ACCESS_KEY', { infer: true });
    }

    get s3SecretKey(): string {
        return this.configService.get('S3_SECRET_KEY', { infer: true });
    }

    get s3Bucket(): string {
        return this.configService.get('S3_BUCKET', { infer: true });
    }

    get s3Region(): string {
        return this.configService.get('S3_REGION', { infer: true });
    }

    get s3UseSsl(): boolean {
        return this.configService.get('S3_USE_SSL', { infer: true });
    }

    // ========================================
    // AI Service
    // ========================================
    get aiServiceUrl(): string | undefined {
        return this.configService.get('AI_SERVICE_URL', { infer: true });
    }

    get aiServiceApiKey(): string | undefined {
        return this.configService.get('AI_SERVICE_API_KEY', { infer: true });
    }

    // ========================================
    // Commission & Tax
    // ========================================
    get defaultCommissionRate(): number {
        return this.configService.get('DEFAULT_COMMISSION_RATE', { infer: true });
    }

    get taxRate(): number {
        return this.configService.get('TAX_RATE', { infer: true });
    }

    // ========================================
    // Maps
    // ========================================
    get neshanApiKey(): string | undefined {
        return this.configService.get('NESHAN_API_KEY', { infer: true });
    }

    // ========================================
    // Monitoring
    // ========================================
    get sentryDsn(): string | undefined {
        return this.configService.get('SENTRY_DSN', { infer: true });
    }

    get logLevel(): string {
        return this.configService.get('LOG_LEVEL', { infer: true });
    }

    // ========================================
    // Rate Limiting
    // ========================================
    get throttleTtl(): number {
        return this.configService.get('THROTTLE_TTL', { infer: true });
    }

    get throttleLimit(): number {
        return this.configService.get('THROTTLE_LIMIT', { infer: true });
    }
}