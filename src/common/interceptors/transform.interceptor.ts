import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../filters/http-exception.filter';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (typeof data === 'object' && data && 'success' in (data as object)) {
          return data as ApiResponse<T>;
        }
        const payload = data as { items?: unknown[]; meta?: unknown };
        // Paginated payloads keep `data.items` (stage 1/2 shape) and ALSO expose
        // `meta` at the top level, as required by the stage 3 API contract.
        if (payload && Array.isArray(payload.items) && payload.meta) {
          return {
            success: true,
            message: 'Success',
            data,
            meta: payload.meta,
          } as ApiResponse<T> & { meta: unknown };
        }
        return { success: true, message: 'Success', data } as ApiResponse<T>;
      }),
    );
  }
}
