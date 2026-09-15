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
      map((data) =>
        typeof data === 'object' && data && 'success' in (data as object)
          ? (data as ApiResponse<T>)
          : { success: true, message: 'Success', data } as ApiResponse<T>,
      ),
    );
  }
}
