import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // Health check responses (دارای status: 'ok' یا 'error')
        if (
          data &&
          typeof data === 'object' &&
          'status' in data &&
          (data.status === 'ok' ||
            data.status === 'error' ||
            data.status === 'shutting_down')
        ) {
          return data;
        }

        // Paginated responses
        if (
          data &&
          typeof data === 'object' &&
          'items' in data &&
          'meta' in data
        ) {
          return {
            success: true,
            data: (data as { items: T; meta: ApiResponse<T>['meta'] }).items,
            meta: (data as { items: T; meta: ApiResponse<T>['meta'] }).meta,
          };
        }

        // همه چیز دیگه
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
