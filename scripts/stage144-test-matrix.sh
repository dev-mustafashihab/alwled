#!/usr/bin/env bash
# Stage 14.4 — تشغيل مصفوفة الاختبارات الفعلية وتخزين المخرجات الخام (لا أرقام متوقعة).
set -u
mkdir -p /tmp/stage144-tests
cd /root/alwled || exit 1

echo "=== build ==="
if npm run build > /tmp/stage144-tests/build.txt 2>&1; then echo "BUILD_OK"; else echo "BUILD_FAIL"; fi

echo "=== tsc ==="
if npx tsc --noEmit > /tmp/stage144-tests/tsc.txt 2>&1; then echo "TSC_OK"; else echo "TSC_FAIL"; fi

echo "=== prisma ==="
{
  npx prisma validate
  npx prisma migrate status
} > /tmp/stage144-tests/prisma.txt 2>&1
tail -2 /tmp/stage144-tests/prisma.txt

echo "=== unit ==="
npm test > /tmp/stage144-tests/unit.txt 2>&1
grep -E "Test Suites:|Tests:" /tmp/stage144-tests/unit.txt | tail -2

echo "=== e2e ==="
npm run test:e2e > /tmp/stage144-tests/e2e.txt 2>&1
grep -E "Test Suites:|Tests:" /tmp/stage144-tests/e2e.txt | tail -2

echo "=== frontend check ==="
(cd frontend && npm run frontend:check) > /tmp/stage144-tests/frontend-check.txt 2>&1
tail -1 /tmp/stage144-tests/frontend-check.txt

echo "=== frontend test ==="
(cd frontend && npm run frontend:test) > /tmp/stage144-tests/frontend-test.txt 2>&1
grep -E "Test Suites:|Tests:" /tmp/stage144-tests/frontend-test.txt | tail -2

echo "=== MATRIX DONE ==="
