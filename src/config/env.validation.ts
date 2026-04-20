import { z } from 'zod';

/**
 * Helper for optional URL fields that should accept empty strings as undefined.
 * Useful for optional env vars where the variable exists but is empty.
 */
const optionalUrl = () =>
    z
        .string()
        .url()
        .optional()
        .or(z.literal('').transform(() => undefined));

/**
 * Zod schema for validating environment variables.
 * Fails fast on app startup if any required variable is missing or invalid.
 */
export const envSchema = z.object({
    // ========================================
    // Application
    // ========================================
    NODE_ENV: z
        .enum(['development', 'test', 'staging', 'production'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api/v1'),
    APP_URL: z.string().url().default('http://localhost:3000'),

    // ========================================
    // Database
    // ========================================
    DATABASE_URL: z.string().url(),

    // ========================================
    // Redis
    // ========================================
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).default(0),

    // ========================================
    // JWT
    // ========================================
    JWT_SECRET: z
        .string()
        .min(32, 'JWT_SECRET must be at least 32 characters long'),
    JWT_ACCESS_EXPIRES: z.string().default('15m'),
    JWT_REFRESH_EXPIRES: z.string().default('30d'),

    // ========================================
    // OTP
    // ========================================
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_EXPIRES_SECONDS: z.coerce.number().int().positive().default(120),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

    // ========================================
    // SMS (Kavenegar)
    // ========================================
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_SENDER: z.string().optional(),

    // ========================================
    // Payment (Zarinpal)
    // ========================================
    ZARINPAL_MERCHANT_ID: z.string().optional(),
    ZARINPAL_CALLBACK_URL: optionalUrl(),

    // ========================================
    // Object Storage (S3/MinIO)
    // ========================================
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string(),
    S3_SECRET_KEY: z.string(),
    S3_BUCKET: z.string(),
    S3_REGION: z.string().default('us-east-1'),
    S3_USE_SSL: z
        .string()
        .default('false')
        .transform((v) => v === 'true'),

    // ========================================
    // AI Service
    // ========================================
    AI_SERVICE_URL: optionalUrl(),
    AI_SERVICE_API_KEY: z.string().optional(),

    // ========================================
    // Commission & Tax
    // ========================================
    DEFAULT_COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.06),
    TAX_RATE: z.coerce.number().min(0).max(1).default(0.09),

    // ========================================
    // Maps
    // ========================================
    NESHAN_API_KEY: z.string().optional(),

    // ========================================
    // Monitoring
    // ========================================
    SENTRY_DSN: optionalUrl(),
    LOG_LEVEL: z
        .enum(['error', 'warn', 'info', 'debug', 'verbose'])
        .default('info'),

    // ========================================
    // Rate Limiting
    // ========================================
    THROTTLE_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

/**
 * Inferred TypeScript type from the schema.
 * Use this for type-safe access to env variables.
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validation function used by NestJS ConfigModule.
 * Throws a detailed error if validation fails.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
    const result = envSchema.safeParse(config);

    if (!result.success) {
        const errors = result.error.issues
            .map((err) => `  ❌ ${err.path.join('.')}: ${err.message}`)
            .join('\n');

        throw new Error(
            `\n\n🚨 Environment variable validation failed:\n${errors}\n\nPlease check your .env file.\n`,
        );
    }

    return result.data;
}