import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, originalUrl, ip } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          console.log(
            `[HTTP] ${methodMap(method)} ${originalUrl} ${res.statusCode} ${Date.now() - now}ms ${ip ?? ''}`,
          );
        },
        error: (err) => {
          console.error(`[HTTP-ERR] ${methodMap(method)} ${originalUrl} ${Date.now() - now}ms ${err?.message ?? ''}`);
        },
      }),
    );
  }
}

const methodMap = (m: string) => m;
