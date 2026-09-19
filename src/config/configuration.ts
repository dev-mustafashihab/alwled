export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  jwt: { secret: string; refreshSecret: string; expiresIn: string; refreshExpiresIn: string };
}

const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-too',
  'replace-in-prod',
  'secret',
  'jwt-secret',
  'your-secret',
  'changeme',
]);

const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
};

/**
 * يحقّق المتغيّرات الحرجة ويفشل الـstartup برسالة واضحة عند النقص (خصوصاً في production).
 * لا يطبع أي قيمة سرية — يذكر الأسماء فقط.
 * ملاحظة: إعدادات شام كاش اختيارية بالتصميم: غيابها يعني `configured=false` ولا يمنع الإقلاع.
 */
function assertSecret(name: string, value: string | undefined, nodeEnv: string): void {
  if (!value) {
    if (nodeEnv === 'production') throw new Error(`Missing required env in production: ${name}`);
    return;
  }
  if (nodeEnv === 'production') {
    if (PLACEHOLDER_SECRETS.has(value.trim().toLowerCase())) {
      throw new Error(`Refusing to start in production with a placeholder secret: ${name}`);
    }
    if (value.trim().length < 32) {
      throw new Error(`Refusing to start in production: ${name} must be at least 32 characters`);
    }
  }
}

export const appConfig = (): AppConfig => {
  const nodeEnv = (required('NODE_ENV', 'development') as AppConfig['nodeEnv']);

  // في production: DATABASE_URL و JWTs إلزامية وقوية؛ في غيرها تعمل القيم الافتراضية للتطوير.
  const databaseUrl = nodeEnv === 'production' ? required('DATABASE_URL') : required('DATABASE_URL', 'postgresql://localhost:5432/alwled?schema=public');
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  assertSecret('JWT_SECRET', secret, nodeEnv);
  assertSecret('JWT_REFRESH_SECRET', refreshSecret, nodeEnv);

  return {
    port: parseInt(required('PORT', '3100'), 10),
    nodeEnv,
    databaseUrl,
    jwt: {
      secret: secret ?? 'dev-only-insecure-secret-change-me',
      refreshSecret: refreshSecret ?? 'dev-only-insecure-refresh-secret-change-me',
      expiresIn: required('JWT_EXPIRES_IN', '15m'),
      refreshExpiresIn: required('JWT_REFRESH_EXPIRES_IN', '7d'),
    },
  };
};

const config = appConfig();

/** ملخّص إقلاع آمن (أسماء فقط، بلا أي قيم سرية) — يُطبع مرة واحدة عند البدء. */
export function describeRuntime(): Record<string, string> {
  const shamCashConfigured = Boolean(
    (process.env.SHAMCASH_WALLET_NUMBER ?? '').trim() && (process.env.SHAMCASH_ACCOUNT_NAME ?? '').trim(),
  );
  return {
    nodeEnv: config.nodeEnv,
    port: String(config.port),
    trustProxy: (process.env.TRUST_PROXY ?? '').trim() || 'off',
    corsOrigins: (process.env.CORS_ORIGINS ?? '').trim() ? 'configured' : 'none (same-origin only)',
    swagger: config.nodeEnv !== 'production' || process.env.SWAGGER_ENABLED === 'true' ? 'enabled' : 'disabled',
    verificationProvider: process.env.VERIFICATION_PROVIDER ?? 'LOG',
    notificationProvider: process.env.NOTIFICATION_PROVIDER ?? 'IN_APP',
    shamCash: shamCashConfigured ? 'configured' : 'unconfigured (manual review still available)',
  };
}

export default config;
