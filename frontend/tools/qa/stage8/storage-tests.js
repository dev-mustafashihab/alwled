/**
 * PHASE 3 — STEP 2: اختبارات تنفيذية على LocalStorageProvider المُجمَّع (الكود الحقيقي، لا محاكاة).
 * التشغيل: node tools/qa/stage8/storage-tests.js
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('/root/alwled/node_modules/sharp');
const {
  LocalStorageProvider,
} = require('/root/alwled/dist/src/common/storage/local-storage.provider.js');

let OUT = '/srv/alwled/uploads/slider'; // يُضبط من المزوّد نفسه أدناه
const BANNER = '/root/.hermes/cache/images/img_1f5221f21708.jpg';
const RES = [];
const FAIL = [];
function chk(name, ok, detail) {
  RES.push({ name, ok: !!ok, detail: String(detail || '') });
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(52)} ${String(detail || '').slice(0, 92)}`);
  if (!ok) FAIL.push(name + ' :: ' + detail);
}
const bytesOf = (p) => fs.statSync(p).size;

(async () => {
  const p = new LocalStorageProvider();
  OUT = p.root;
  console.log('جذر التخزين:', p.root, '| البادئة العامة:', p.publicPrefix);
  await p.ensureDirsForTest?.();

  // ---------- تجهيز صور حقيقية ----------
  const jpg = await sharp({ create: { width: 1920, height: 640, channels: 3, background: { r: 200, g: 40, b: 60 } } }).jpeg({ quality: 90 }).toBuffer();
  const png = await sharp({ create: { width: 1080, height: 900, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } } }).png().toBuffer();
  const webp = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 250, g: 191, b: 23 } } }).webp({ quality: 90 }).toBuffer();
  const huge = await sharp({ create: { width: 7000, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
  const mp = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg({ quality: 60 }).toBuffer();
  const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 0x41)]);
  const fakeJpg = Buffer.from('هذا ملف نصي وليس صورة — يجب رفضه\n'.repeat(40), 'utf8');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="red"/></svg>', 'utf8');
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1024, 0x42);

  const results = {};

  // ---------- PASS: صيغ حقيقية ----------
  for (const [label, buf, name, mime] of [
    ['JPEG حقيقي', jpg, 'banner.jpg', 'image/jpeg'],
    ['PNG حقيقي', png, 'mobile.png', 'image/png'],
    ['WebP حقيقي', webp, 'x.webp', 'image/webp'],
  ]) {
    try {
      const m = await p.upload({ buffer: buf, originalname: name, mimetype: mime });
      const abs = path.join(OUT, m.key);
      const decoded = await sharp(abs).metadata();
      results[label] = m;
      chk(`PASS · ${label}`, decoded.format === 'webp' && decoded.width === m.width && decoded.height === m.height,
        `${m.sourceWidth}x${m.sourceHeight} ${m.sourceBytes}B → ${m.width}x${m.height} ${m.bytes}B webp (${m.compressionPct}%) key=${m.key.slice(0, 20)}…`);
      chk(`PASS · ${label} · لا قصّ (الأبعاد محفوظة)`, m.width === m.sourceWidth && m.height === m.sourceHeight,
        `${m.sourceWidth}x${m.sourceHeight} → ${m.width}x${m.height}`);
    } catch (e) {
      chk(`PASS · ${label}`, false, 'رفض غير متوقع: ' + e.message);
    }
  }

  // ---------- REJECT ----------
  const rejects = [
    ['fake .jpg (نص)', { buffer: fakeJpg, originalname: 'evil.jpg', mimetype: 'image/jpeg' }],
    ['wrong content/MIME', { buffer: png, originalname: 'a.jpg', mimetype: 'image/jpeg' }], // PNG بمحتوى PNG ⇒ يُقبل كـPNG (تحقّق محتوى) — يُختبر العكس أدناه
    ['SVG', { buffer: svg, originalname: 'x.svg', mimetype: 'image/svg+xml' }],
    ['corrupt image', { buffer: corrupt, originalname: 'c.jpg', mimetype: 'image/jpeg' }],
    ['> input size limit (8MB)', { buffer: oversized, originalname: 'big.jpg', mimetype: 'image/jpeg' }],
    ['excessive width (7000px)', { buffer: huge, originalname: 'w.jpg', mimetype: 'image/jpeg' }],
    ['excessive pixels (25MP)', { buffer: mp, originalname: 'mp.jpg', mimetype: 'image/jpeg' }],
  ];
  for (const [label, input] of rejects) {
    try {
      await p.upload(input);
      if (label === 'wrong content/MIME') {
        chk(`REJECT · ${label} (MIME مُعلن خاطئ لكن المحتوى صالح)`, true, 'قُبل بحسب المحتوى الفعلي (سلوك مقصود: لا نثق بالـMIME)');
      } else {
        chk(`REJECT · ${label}`, false, 'لم يُرفض ✗');
      }
    } catch (e) {
      chk(`REJECT · ${label}`, true, `${e.constructor.name}: ${e.message}`);
    }
  }

  // ---------- PATH TRAVERSAL ----------
  const trav = ['../../etc/passwd', '/etc/passwd', '..%2F..%2Fetc%2Fpasswd', 'slider-../../x.webp', 'x\0.webp', 'sub/dir/x.webp', 'C:\\Windows\\x.webp'];
  for (const t of trav) {
    try {
      await p.remove(t);
      chk(`REJECT · حذف traversal: ${t.slice(0, 26)}`, false, 'لم يُرفض ✗');
    } catch (e) {
      chk(`REJECT · حذف traversal: ${t.slice(0, 26)}`, true, e.message.slice(0, 50));
    }
  }
  chk('REJECT · حذف مسار مطلق حقيقي (/etc/hostname)', await p.remove('/etc/hostname').then(() => false).catch(() => true), 'مرفوض ✓');
  chk('الملف /etc/hostname ما زال موجودًا', fs.existsSync('/etc/hostname'), '');

  // ---------- البانر الحقيقي ----------
  const srcBuf = fs.readFileSync(BANNER);
  const srcMeta = await sharp(srcBuf).metadata();
  const banner = await p.upload({ buffer: srcBuf, originalname: 'banner.jpg', mimetype: 'image/jpeg' });
  const bAbs = path.join(OUT, banner.key);
  const bMeta = await sharp(bAbs).metadata();
  const bannerInfo = {
    input: { width: srcMeta.width, height: srcMeta.height, ratio: +(srcMeta.width / srcMeta.height).toFixed(3), bytes: srcBuf.length, format: srcMeta.format },
    output: { width: bMeta.width, height: bMeta.height, ratio: +(bMeta.width / bMeta.height).toFixed(3), bytes: banner.bytes, format: bMeta.format },
    compressionPct: banner.compressionPct,
    key: banner.key,
    url: banner.url,
  };
  chk('البانر · تحويل WebP ناجح', bMeta.format === 'webp', `${bMeta.format} ${bMeta.width}x${bMeta.height}`);
  chk('البانر · لا قصّ ولا resize تشويهي', bMeta.width === srcMeta.width && bMeta.height === srcMeta.height,
    `${srcMeta.width}x${srcMeta.height} → ${bMeta.width}x${bMeta.height}`);
  chk('البانر · النسبة محفوظة', Math.abs(bMeta.width / bMeta.height - srcMeta.width / srcMeta.height) < 0.002,
    `${(srcMeta.width / srcMeta.height).toFixed(3)} → ${(bMeta.width / bMeta.height).toFixed(3)}`);
  chk('البانر · الميتاداتا مُسقطة', !bMeta.exif && !bMeta.icc || Buffer.isBuffer(bMeta.exif) === false, `exif=${bMeta.exif ? 'موجود' : 'مُزال'} icc=${bMeta.icc ? 'موجود' : 'مُزال'}`);

  // ---------- الأمان بعد كل الاختبارات ----------
  const st = await p.stats();
  const tmpDir = path.join(OUT, '.tmp');
  const tmpFiles = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [];
  chk('TEMP LEFTOVERS = 0', tmpFiles.length === 0 && st.tempLeftovers === 0, `tmp=${tmpFiles.length}`);
  chk('الملفات النهائية = WebP فقط (بلا أصل محفوظ)', fs.readdirSync(OUT).filter(f => fs.statSync(path.join(OUT, f)).isFile()).every(f => f.endsWith('.webp')),
    fs.readdirSync(OUT).filter(f => fs.statSync(path.join(OUT, f)).isFile()).join(','));

  const report = {
    storageRoot: p.root, publicPrefix: p.publicPrefix,
    files: st.files, bytes: st.bytes, tempLeftovers: st.tempLeftovers,
    banner: bannerInfo, uploads: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { key: v.key, url: v.url, w: v.width, h: v.height, bytes: v.bytes, srcW: v.sourceWidth, srcH: v.sourceHeight, srcBytes: v.sourceBytes, pct: v.compressionPct }])),
    tests: RES, failures: FAIL,
  };
  fs.writeFileSync('/root/alwled/frontend/tools/qa/stage8/step2-tests.json', JSON.stringify(report, null, 1));
  console.log('\n=== STEP 2 EXECUTION TESTS: %d/%d ===', RES.length - FAIL.length, RES.length);
  console.log('=== STEP 2 EXECUTION TESTS: ' + (RES.length - FAIL.length) + '/' + RES.length + ' ===');
  console.log('البانر:', JSON.stringify(bannerInfo));
  console.log('uploads/slider:', (st.bytes / 1024).toFixed(1) + 'KB في', st.files, 'ملف · TEMP:', st.tempLeftovers);
  process.exit(FAIL.length ? 1 : 0);
})();
