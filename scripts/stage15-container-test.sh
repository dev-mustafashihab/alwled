#!/usr/bin/env bash
# Stage 15 — اختبار حاوية الإنتاج فعلياً: إقلاع · health/live/ready · رفض أسرار placeholder · إطفاء لطيف (SIGTERM)
set -u
cd /root/alwled || exit 1
NAME=alwled-api-test
PORT=3200
LOG=/tmp/stage15-container.log
: > "$LOG"

echo "=== NEGATIVE: production with a placeholder secret must refuse to start ===" | tee -a "$LOG"
docker rm -f "${NAME}-neg" >/dev/null 2>&1
docker run --rm --name "${NAME}-neg" --network host \
  --env-file .env -e NODE_ENV=production -e PORT=$((PORT+1)) -e JWT_SECRET=change-me \
  alwled-api:stage15 > /tmp/stage15-neg.log 2>&1
echo "negative exit=$? (expect non-zero)" | tee -a "$LOG"
grep -m2 -iE "placeholder|Refusing to start|required env" /tmp/stage15-neg.log | tee -a "$LOG"

echo "=== START container (production, real env from .env) ===" | tee -a "$LOG"
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" --network host --env-file .env \
  -e NODE_ENV=production -e PORT="$PORT" \
  --restart no alwled-api:stage15 >> "$LOG" 2>&1
sleep 12
docker ps --filter "name=$NAME" --format 'STATUS: {{.Status}}' | tee -a "$LOG"

echo "=== readiness / liveness from the host ===" | tee -a "$LOG"
for path in health health/live health/ready; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/v1/${path}")
  echo "  ${path} -> ${code}" | tee -a "$LOG"
done
echo "--- ready body ---" | tee -a "$LOG"
curl -s "http://127.0.0.1:${PORT}/api/v1/health/ready" | tee -a "$LOG"; echo | tee -a "$LOG"
echo "--- swagger policy in production (must be disabled) ---" | tee -a "$LOG"
echo "  /api/docs -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/docs)" | tee -a "$LOG"

echo "=== no .env / secrets inside the image ===" | tee -a "$LOG"
echo "  .env in image: $(docker run --rm --entrypoint sh alwled-api:stage15 -c 'ls -a /app | grep -c "^\.env$" || true')" | tee -a "$LOG"
echo "  running as user: $(docker run --rm --entrypoint id alwled-api:stage15)" | tee -a "$LOG"

echo "=== app-level smoke inside the container (public catalog) ===" | tee -a "$LOG"
echo "  /products -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/v1/products?page=1\&limit=1)" | tee -a "$LOG"
echo "  /cart (no token) -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/api/v1/cart)" | tee -a "$LOG"

echo "=== GRACEFUL SHUTDOWN (SIGTERM, 30s grace) ===" | tee -a "$LOG"
docker stop -t 30 "$NAME" >> "$LOG" 2>&1
echo "  exit code: $(docker inspect -f '{{.State.ExitCode}}' "$NAME")" | tee -a "$LOG"
echo "  docker logs tail:" | tee -a "$LOG"
docker logs --tail 6 "$NAME" 2>&1 | sed 's/^/    /' | tee -a "$LOG"
docker rm -f "$NAME" >/dev/null 2>&1
echo "=== CONTAINER TEST DONE ===" | tee -a "$LOG"
