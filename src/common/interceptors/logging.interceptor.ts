import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const duration = Date.now() - startTime;
          const { statusCode } = response;

          this.logger.log(
            `${method} ${url} ${statusCode} - ${duration}ms | ${ip} | ${userAgent}`,
          );
        },
        error: () => {
          const duration = Date.now() - startTime;
          this.logger.error(`${method} ${url} ERROR - ${duration}ms | ${ip}`);
        },
      }),
    );
  }
}
