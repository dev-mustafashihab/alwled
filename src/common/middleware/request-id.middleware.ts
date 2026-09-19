import { Request, Response, NextFunction } from 'express';

/**
 * Correlation id لكل طلب (للتشخيص فقط — ليس مصادقة ولا تصريحاً).
 * - يقبل ترويسة X-Request-Id القادمة من العميل **فقط** إذا كانت بصيغة آمنة ومحدودة الطول.
 * - وإلا يولّد معرّفاً جديداً.
 * - يُعاد دائماً في ترويسة الاستجابة، ويُستخدم في السجلات.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

/** يعيد معرّف الطلب إن وُجد (بلا أي بيانات حساسة). */
export function getRequestId(req: unknown): string {
  const value = (req as { requestId?: unknown } | null)?.requestId;
  return typeof value === 'string' ? value : '-';
}

/** يحذف قيم المعاملات الحساسة من سطر السجل (توكنات/أسرار قد تُرسل في query). */
const SENSITIVE_QUERY_KEYS = ['token', 'access_token', 'refreshToken', 'refresh_token', 'code', 'secret', 'password', 'key'];

export function safeLogPath(originalUrl: string): string {
  const [path, query] = String(originalUrl || '').split('?');
  if (!query) return path || '/';
  const sanitized = query
    .split('&')
    .map((pair) => {
      const [key] = pair.split('=');
      return SENSITIVE_QUERY_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))
        ? `${key}=[redacted]`
        : pair;
    })
    .join('&');
  return `${path}?${sanitized}`;
}
