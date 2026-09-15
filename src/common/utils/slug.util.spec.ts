import { generateSku, isCleanSlug, slugify, uniqueSlug } from './slug.util';

describe('slug.util', () => {
  it('normalizes latin text into url-safe slugs', () => {
    expect(slugify('LG No Frost Refrigerator 500L')).toBe('lg-no-frost-refrigerator-500l');
    expect(slugify('  Washing   Machine__9KG  ')).toBe('washing-machine-9kg');
    expect(slugify('TV 55" 4K')).toBe('tv-55-4k');
  });

  it('handles Arabic names deterministically', () => {
    expect(slugify('الثلاجات')).toBe('الثلاجات');
    expect(slugify('غسالة أطباق')).toBe('غساله-اطباق');
    expect(slugify('طاقة شمسية — أ')).toBe('طاقه-شمسيه-ا');
  });

  it('is stable and never empty for symbol-only input', () => {
    const empty = slugify('!!!');
    expect(empty.startsWith('item-')).toBe(true);
    expect(slugify('ABC-123')).toBe('abc-123');
  });

  it('isCleanSlug accepts normalized slugs only', () => {
    expect(isCleanSlug('demo-product-1')).toBe(true);
    expect(isCleanSlug('Demo Product')).toBe(false);
    expect(isCleanSlug('-leading')).toBe(false);
  });

  it('uniqueSlug appends a counter until free', async () => {
    const taken = new Set(['demo', 'demo-2']);
    const exists = async (c: string) => taken.has(c);
    expect(await uniqueSlug('demo', exists)).toBe('demo-3');
    expect(await uniqueSlug('fresh', exists)).toBe('fresh');
  });

  it('generateSku builds readable codes and falls back safely', () => {
    expect(generateSku(['ref', 'demo product'])).toBe('REF-DEMOPR');
    expect(generateSku([null, undefined], 'PRD')).toBe('PRD');
    expect(generateSku(['verylongsegmenthere', 'x']).length).toBeLessThanOrEqual(32);
  });
});
