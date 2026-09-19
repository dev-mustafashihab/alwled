#!/usr/bin/env bash
# Stage 15 — التحقق من Docker runtime للصورة المبنية (بلا أي تعديل كود).
# يتحقق من: إقلاع الحاوية · تهيئة Prisma · الاستماع على المنفذ · health/live/ready · إطفاء لطيف (SIGTERM)
set -u
cd /root/alwled || exit 1
NAME=alwled-runtime-verify
PORT=3200
LOG=/tmp/stage15-runtime.log
: > "$LOG"

echo "=== IMAGE INSPECTION (built after the Prisma binaryTargets fix) ===" | tee -a "$LOG"
docker image inspect alwled-api:stage15 --format 'image created: {{.Created}}' | tee -a "$LOG"
docker run --rm --entrypoint sh alwled-api:stage15 -c "ls /app/node_modules/.prisma/client/ | grep -E 'so.node|schema.prisma'; echo '--- embedded generator config ---'; sed -n '1,8p' /app/node_modules/.prisma/client/schema.prisma" 2>&1 | tee -a "$LOG"

echo "=== START CONTAINER (production env from .env, host network) ===" | tee -a "$LOG"
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --network host --env-file .env \
  -e NODE_ENV=production -e PORT="$PORT" alwled-api:stage15 >> "$LOG" 2>&1
echo "  started: $(docker ps --filter name=$NAME --format '{{.Status}}')" | tee -a "$LOG"

echo "=== WAIT FOR READINESS (poll up to 60s) ===" | tee -a "$LOG"
ready=0
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/health/ready" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then ready=1; echo "  ready after ${i} polls" | tee -a "$LOG"; break; fi
  sleep 2
done
echo "  readiness achieved: $ready" | tee -a "$LOG"

echo "=== HEALTH ENDPOINTS ===" | tee -a "$LOG"
for path in health health/live health/ready; do
  code=$(curl -s -o /tmp/rt-body.json -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/${path}")
  echo "  /${path} -> ${code} : $(head -c 150 /tmp/rt-body.json)" | tee -a "$LOG"
done

echo "=== RUNTIME SECURITY / BOUNDARY CHECKS ===" | tee -a "$LOG"
echo "  process user: $(docker exec "$NAME" id 2>/dev/null | head -1)" | tee -a "$LOG"
echo "  .env inside image: $(docker exec "$NAME" sh -c 'ls -a /app | grep -c "^\.env$" || true')" | tee -a "$LOG"
echo "  swagger in production: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/docs) (expect 404)" | tee -a "$LOG"
echo "  public catalog: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/products?page=1&limit=1")" | tee -a "$LOG"
echo "  anonymous cart: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/v1/cart) (expect 401)" | tee -a "$LOG"
echo "  X-Request-Id: $(curl -s -D - -o /dev/null http://127.0.0.1:${PORT}/api/v1/health/live | grep -ci 'x-request-id') header(s)" | tee -a "$LOG"

echo "=== GRACEFUL SHUTDOWN (SIGTERM) ===" | tee -a "$LOG"
docker stop -t 30 "$NAME" >> "$LOG" 2>&1
echo "  exit code: $(docker inspect -f '{{.State.ExitCode}}' "$NAME")" | tee -a "$LOG"
docker logs --tail 8 "$NAME" 2>&1 | sed 's/^/    /' | tee -a "$LOG"
docker rm -f "$NAME" >/dev/null 2>&1
echo "=== RUNTIME VERIFY DONE ===" | tee -a "$LOG"
