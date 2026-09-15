/**
 * Slug helper — Arabic-aware, URL safe, deterministic.
 * Used by categories, brands and products; admins may override the generated slug.
 */
export function slugify(input: string): string {
  const base = (input ?? '')
    .toString()
    .trim()
    .toLowerCase()
    // Arabic diacritics + tatweel
    .replace(/[\u064B-\u0652\u0640]/g, '')
    // Arabic letter forms that break URLs
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    // any character that is not a latin letter, digit, space/dash/underscore → dropped
    .replace(/[^a-z0-9\u0600-\u06FF\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `item-${Date.now().toString(36)}`;
}

/** Returns true when the value is already a clean slug (no normalization needed). */
export function isCleanSlug(value: string): boolean {
  return /^[a-z0-9\u0600-\u06FF]+(-[a-z0-9\u0600-\u06FF]+)*$/.test(value ?? '');
}

/**
 * Appends -2, -3 ... until the candidate is free.
 * `exists` must check the target table only (unique index stays the source of truth).
 */
export async function uniqueSlug(
  desired: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 25,
): Promise<string> {
  const base = slugify(desired);
  if (!(await exists(base))) return base;
  for (let i = 2; i <= maxAttempts; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** SKU helper: deterministic, human readable, expandable later. */
export function generateSku(parts: Array<string | number | null | undefined>, fallback = 'PRD'): string {
  const clean = parts
    .filter((p) => p !== null && p !== undefined && `${p}`.trim() !== '')
    .map((p) =>
      `${p}`
        .toString()
        .normalize('NFKD')
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 6),
    )
    .filter(Boolean);
  const body = (clean.length ? clean : [fallback]).join('-');
  return body.slice(0, 32);
}
