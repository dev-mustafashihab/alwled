import { readFileSync } from 'fs';
import { join } from 'path';
import { LogCustomerVerificationProvider } from './log-verification.provider';
import { VerificationProviderRegistry } from './verification-provider.registry';
import { VerificationProvider } from '../interfaces/verification-provider.interface';

describe('verification providers', () => {
  const source = () => readFileSync(join(__dirname, 'log-verification.provider.ts'), 'utf8');

  describe('LogCustomerVerificationProvider', () => {
    const provider = new LogCustomerVerificationProvider();
    const request = { verificationId: 'cv1', userId: 'u1', attempt: 1 };

    it('is named LOG', () => {
      expect(provider.name).toBe('LOG');
    });

    it('never reports VERIFIED — starting can only yield PENDING', async () => {
      const started = await provider.startVerification(request);
      expect(started.status).toBe('PENDING');
      const polled = await provider.getVerificationStatus(started.providerReference as string);
      expect(polled.status).toBe('PENDING');
    });

    it('issues its own opaque reference and echoes it on cancel', async () => {
      const started = await provider.startVerification({ ...request, attempt: 3 });
      expect(started.providerReference).toBe('LOG-cv1-A3');
      const cancelled = await provider.cancelVerification(started.providerReference as string);
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.providerReference).toBe('LOG-cv1-A3');
    });

    it('declares no outbound integration whatsoever', () => {
      const code = source();
      for (const forbidden of [
        'axios', 'HttpService', '@nestjs/axios', 'fetch(', 'https.request', 'http.request',
        'nodemailer', 'twilio', 'API_KEY', 'SECRET', 'process.env',
      ]) {
        expect(`${forbidden}: ${code.includes(forbidden)}`).toBe(`${forbidden}: false`);
      }
    });
  });

  describe('VerificationProviderRegistry', () => {
    const log = new LogCustomerVerificationProvider();

    const build = (providers: VerificationProvider[]) => new VerificationProviderRegistry(providers);

    afterEach(() => {
      delete process.env.VERIFICATION_PROVIDER;
    });

    it('resolves LOG by default and reports it as non-external', () => {
      const registry = build([log]);
      expect(registry.name).toBe('LOG');
      expect(registry.isExternal).toBe(false);
      expect(registry.provider).toBe(log);
    });

    it('fails loudly instead of falling back when the configured provider is unknown', () => {
      process.env.VERIFICATION_PROVIDER = 'SOMEBODY_REAL';
      expect(() => build([log])).toThrow(/غير معروف/);
    });

    it('fails loudly when nothing is registered at all', () => {
      expect(() => build([])).toThrow(/غير معروف/);
    });
  });
});
