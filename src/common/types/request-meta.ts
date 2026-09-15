/** Standard request metadata attached to audit entries. */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const requestMeta = (req: { ip?: string; headers?: Record<string, unknown> }): RequestMeta => ({
  ip: req.ip,
  userAgent: (req.headers?.['user-agent'] as string) ?? undefined,
});
