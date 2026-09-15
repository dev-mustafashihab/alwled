import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/** High-entropy opaque token (used for password reset + verification links/codes). */
export const generateOpaqueToken = (bytes = 48): string =>
  randomBytes(bytes).toString('base64url');

/** Numeric OTP of fixed length (for SMS/WhatsApp channels). */
export const generateNumericCode = (length = 6): string => {
  const max = 10 ** length;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return String(n).padStart(length, '0');
};

/** Fast deterministic digest — safe for high-entropy tokens (never for passwords). */
export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** Constant-time comparison of two digests. */
export const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};
