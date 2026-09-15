export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  jwt: { secret: string; expiresIn: string; refreshExpiresIn: string };
}

const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
};

export const appConfig = (): AppConfig => ({
  port: parseInt(required('PORT', '3000'), 10),
  nodeEnv: (required('NODE_ENV', 'development') as AppConfig['nodeEnv']),
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: required('JWT_EXPIRES_IN', '15m'),
    refreshExpiresIn: required('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
});

const _config = appConfig();
export default _config;
