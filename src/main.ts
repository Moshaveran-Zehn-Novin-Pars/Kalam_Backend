import {NestFactory} from '@nestjs/core';
import {ValidationPipe} from '@nestjs/common';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import {WINSTON_MODULE_NEST_PROVIDER} from 'nest-winston';
import {AppModule} from './app.module';
import {AppConfigService} from './config';
import {GlobalExceptionFilter} from './common/filters/http-exception.filter';
import {TransformInterceptor} from './common/interceptors/transform.interceptor';
import {LoggingInterceptor} from './common/interceptors/logging.interceptor';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        // Disable default logger - Winston takes over
        bufferLogs: true,
    });

    // ----------------------------------------
    // Winston Logger (replaces NestJS default)
    // ----------------------------------------
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

    // ----------------------------------------
    // Global Exception Filter
    // ----------------------------------------
    app.useGlobalFilters(new GlobalExceptionFilter());

    // ----------------------------------------
    // Global Interceptors
    // ----------------------------------------
    app.useGlobalInterceptors(
        new LoggingInterceptor(),
        new TransformInterceptor(),
    );

    // ----------------------------------------
    // Config Service
    // ----------------------------------------
    const config = app.get(AppConfigService);

    // ----------------------------------------
    // Global API Prefix
    // ----------------------------------------
    app.setGlobalPrefix(config.apiPrefix);

    // ----------------------------------------
    // Global Validation Pipe
    // ----------------------------------------
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    // ----------------------------------------
    // CORS
    // ----------------------------------------
    app.enableCors({
        origin: config.isDevelopment ? '*' : [config.appUrl],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });

    // ----------------------------------------
    // Swagger (non-production only)
    // ----------------------------------------
    if (!config.isProduction) {
        const swaggerConfig = new DocumentBuilder()
            .setTitle('🥬 Kalam API')
            .setDescription(
                `
## Kalam Backend API

B2B wholesale marketplace for fruits and vegetables in Iran.

### Authentication
Most endpoints require a **Bearer JWT token**.
Use \`POST /api/v1/auth/send-otp\` → \`POST /api/v1/auth/verify-otp\` to get a token.

### Roles
- \`FARMER\` - Farmer / باغدار
- \`BUYER\` - Buyer (supermarket, restaurant, hotel) / خریدار
- \`DRIVER\` - Driver / راننده
- \`ADMIN\` - Platform admin / ادمین
- \`SUPPORT\` - Support agent / پشتیبانی
      `,
            )
            .setVersion('1.0')
            .setContact(
                'Kalam Team',
                'https://github.com/Moshaveran-Zehn-Novin-Pars',
                'dev@kalam.ir',
            )
            .addBearerAuth(
                {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    name: 'Authorization',
                    in: 'header',
                },
                'access-token',
            )
            .addTag('Auth', 'احراز هویت - OTP based authentication')
            .addTag('Users', 'مدیریت کاربران')
            .addTag('Farmers', 'پروفایل باغداران')
            .addTag('Buyers', 'پروفایل خریداران')
            .addTag('Products', 'محصولات و موجودی')
            .addTag('Categories', 'دسته‌بندی محصولات')
            .addTag('Cart', 'سبد خرید')
            .addTag('Orders', 'سفارشات')
            .addTag('Payments', 'پرداخت و کیف پول')
            .addTag('Deliveries', 'حمل و نقل')
            .addTag('Reviews', 'امتیازدهی')
            .addTag('Disputes', 'حل اختلاف')
            .addTag('Admin', 'پنل ادمین')
            .addTag('Health', 'وضعیت سرویس')
            .build();

        const document = SwaggerModule.createDocument(app, swaggerConfig);

        SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: {
                persistAuthorization: true,
                tagsSorter: 'alpha',
                operationsSorter: 'alpha',
            },
            customSiteTitle: 'Kalam API Docs',
        });

        console.log(`📚 Swagger docs: http://localhost:${config.port}/api/docs`);
    }

    // ----------------------------------------
    // Start Server
    // ----------------------------------------
    await app.listen(config.port);

    console.log(`
🥬 Kalam Backend is running!
🌍 URL:         ${config.appUrl}
📡 API Prefix:  /${config.apiPrefix}
🔧 Environment: ${config.nodeEnv}
  `);
}

bootstrap();