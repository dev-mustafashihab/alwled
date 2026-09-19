import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getRequestId, safeLogPath } from '../middleware/request-id.middleware';

/**
 * سطر سجل واحد لكل طلب: timestamp · level · requestId · method · path · status · duration.
 * لا يُسجَّل أي جسم طلب، ولا ترويسة Authorization، ولا توكنات، ولا محتوى إثبات دفع.
 * المسار يُنظَّف من المعاملات الحساسة (token/password/code/…) قبل الكتابة.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = String(req.method || 'GET');
    const path = safeLogPath(String(req.originalUrl || req.url || '/'));
    const requestId = getRequestId(req);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(`${method} ${path} ${res.statusCode} ${Date.now() - startedAt}ms rid=${requestId}`);
        },
        error: (err) => {
          const status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
          this.logger.warn(`${method} ${path} ${status} ${Date.now() - startedAt}ms rid=${requestId}`);
        },
      }),
    );
  }
}
