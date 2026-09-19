#!/usr/bin/env bash
# PHASE 3 — STEP 3: اختبارات API فعلية (عام · إداري · ملفات · تحقق · rollback)
set -u
API="https://panel.fahd-car.cloud/alwled-api/api/v1"
UP="/srv/alwled/uploads/slider"
PASS=0; FAIL=0
ok(){ echo "✓ $1 ${2:-}"; PASS=$((PASS+1)); }
no(){ echo "✗ $1 :: ${2:-}"; FAIL=$((FAIL+1)); }
code(){ curl -s -o /tmp/body.$$ -w '%{http_code}' "$@"; }

# ---- token (OWNER من .env) ----
PHONE=$(grep -oP '(?<=SEED_OWNER_PHONE=).*' /root/alwled/.env | tr -d '"' | tr -d "'")
PASSW=$(grep -oP '(?<=SEED_OWNER_PASSWORD=).*' /root/alwled/.env | tr -d '"' | tr -d "'")
TOK=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASSW\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.data?.accessToken||j.data?.tokens?.accessToken||j.accessToken||'')}catch(e){console.log('')}})")
[ -n "$TOK" ] && ok "تسجيل دخول إداري (OWNER)" || no "تسجيل دخول إداري" "لا توكن"
A=(-H "Authorization: Bearer $TOK")

# ---- صور اختبار ----
node -e "const s=require('/root/alwled/node_modules/sharp');(async()=>{await s({create:{width:1920,height:640,channels:3,background:{r:20,g:90,b:160}}}).jpeg().toFile('/tmp/d1.jpg');await s({create:{width:1080,height:900,channels:3,background:{r:250,g:191,b:23}}}).jpeg().toFile('/tmp/m1.jpg');await s({create:{width:800,height:400,channels:3,background:{r:10,g:10,b:10}}}).jpeg().toFile('/tmp/d2.jpg');})()"
printf 'not an image' > /tmp/fake.jpg

echo "--- ADMIN AUTH / PERMISSIONS ---"
[ "$(code "$API/slider/admin")" = "401" ] && ok "admin بلا توثيق ⇒ 401" || no "admin بلا توثيق" "$(cat /tmp/body.$$)"
[ "$(code "${A[@]}" "$API/slider/admin")" = "200" ] && ok "admin مع توثيق ⇒ 200" || no "admin مع توثيق" "$(cat /tmp/body.$$)"
[ "$(code "$API/slider")" = "200" ] && ok "public GET ⇒ 200" || no "public GET" ""

echo "--- CREATE ---"
C1=$(curl -s "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d1.jpg" -F "altText=اختبار شريحة أولى" -F "sortOrder=5" -F "isEnabled=true")
ID1=$(echo "$C1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log('')}})")
[ -n "$ID1" ] && ok "إنشاء سطح مكتب فقط ⇒ id=$ID1" || no "إنشاء سطح مكتب فقط" "$C1"
D1=$(echo "$C1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.desktopImageUrl)}catch(e){console.log('')}})")
[ -f "$UP/$(basename "$D1")" ] && ok "الأصل المُدار مخزّن في uploads/slider" "$(basename "$D1")" || no "الأصل المُدار" "$D1"

C2=$(curl -s "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d2.jpg" -F "mobile=@/tmp/m1.jpg" -F "altText=شريحة بجوال" -F "sortOrder=9")
ID2=$(echo "$C2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.log('')}})")
M2=$(echo "$C2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.mobileImageUrl||'')}catch(e){console.log('')}})")
[ -n "$ID2" ] && [ -n "$M2" ] && ok "إنشاء سطح مكتب + جوال" || no "إنشاء سطح مكتب + جوال" "$C2"

echo "--- PUBLIC ORDERING / ENABLED ONLY ---"
PUB=$(curl -s "$API/slider")
ORD=$(echo "$PUB" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d).data;console.log(j.map(x=>x.id).join(','))})")
[ "$ORD" = "$ID1,$ID2" ] && ok "الترتيب sortOrder ASC ثم id ASC" "$ORD" || no "الترتيب" "$ORD"

echo "--- UPDATE / ENABLE / DISABLE ---"
curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"isEnabled":false,"altText":"معطّلة مؤقتًا"}' >/dev/null
N=$(curl -s "$API/slider" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.length))")
[ "$N" = "1" ] && ok "المعطّلة لا تظهر في العام" "public=$N" || no "المعطّلة لا تظهر" "public=$N"
curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"isEnabled":true}' >/dev/null
N2=$(curl -s "$API/slider" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.length))")
[ "$N2" = "2" ] && ok "إعادة التفعيل ⇒ تظهر" || no "إعادة التفعيل" "$N2"

echo "--- REORDER (transactional) ---"
curl -s "${A[@]}" -X PATCH "$API/slider/admin/reorder" -H 'Content-Type: application/json' -d "{\"ids\":[$ID2,$ID1]}" >/dev/null
ORD2=$(curl -s "$API/slider" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.map(x=>x.id).join(',')))")
[ "$ORD2" = "$ID2,$ID1" ] && ok "إعادة الترتيب دفعة واحدة" "$ORD2" || no "إعادة الترتيب" "$ORD2"
DC=$(code "${A[@]}" -X PATCH "$API/slider/admin/reorder" -H 'Content-Type: application/json' -d "{\"ids\":[$ID1,$ID1]}")
[ "$DC" = "400" ] && ok "معرّفات مكرّرة ⇒ 400" || no "معرّفات مكرّرة" "$DC"
DC2=$(code "${A[@]}" -X PATCH "$API/slider/admin/reorder" -H 'Content-Type: application/json' -d '{"ids":[999999]}')
[ "$DC2" = "400" ] && ok "معرّف غير موجود ⇒ 400" || no "معرّف غير موجود" "$DC2"

echo "--- IMAGE REPLACE (old kept until DB success) ---"
OLD="$D1"
R=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID1" -F "desktop=@/tmp/d2.jpg")
NEW=$(echo "$R" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.desktopImageUrl)}catch(e){console.log('')}})")
[ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && ok "استبدال سطح المكتب" "$(basename "$NEW")" || no "استبدال سطح المكتب" "$R"
[ ! -f "$UP/$(basename "$OLD")" ] && ok "القديم حُذف بعد نجاح القاعدة" || no "حذف القديم" "$OLD"
[ -f "$UP/$(basename "$NEW")" ] && ok "الجديد موجود" || no "الجديد موجود" "$NEW"

echo "--- MOBILE KEEP / REPLACE / REMOVE ---"
K=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"altText":"keep"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.mobileImageUrl||'')}catch(e){console.log('')}})")
[ "$K" = "$M2" ] && ok "KEEP: صورة الجوال محفوظة" || no "KEEP" "$K"
MR=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -F "mobile=@/tmp/m1.jpg" -F "mobileMode=replace" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.mobileImageUrl||'')}catch(e){console.log('')}})")
[ -n "$MR" ] && [ "$MR" != "$M2" ] && ok "REPLACE: صورة جوال جديدة" || no "REPLACE" "$MR"
[ ! -f "$UP/$(basename "$M2")" ] && ok "صورة الجوال القديمة نُظّفت" || no "تنظيف الجوال القديم" "$M2"
RM=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"mobileMode":"remove"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(String(JSON.parse(d).data.mobileImageUrl))}catch(e){console.log('err')}})")
[ "$RM" = "null" ] && ok "REMOVE: صورة الجوال = null" || no "REMOVE" "$RM"
[ ! -f "$UP/$(basename "$MR")" ] && ok "ملف الجوال المُزال نُظّف" || no "تنظيف ملف الجوال" "$MR"

echo "--- VALIDATION / SECURITY ---"
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "altText=بلا صورة")" = "400" ] && ok "إنشاء بلا صورة سطح مكتب ⇒ 400" || no "بلا صورة" ""
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/fake.jpg")" = "400" ] && ok "صورة تالفة ⇒ 400" || no "صورة تالفة" ""
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d1.jpg" -F "linkUrl=javascript:alert(1)")" = "400" ] && ok "javascript: ⇒ 400" || no "javascript:" ""
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d1.jpg" -F "linkUrl=data:text/html;base64,PHN2Zz4=")" = "400" ] && ok "data: ⇒ 400" || no "data:" ""
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d1.jpg" -F "linkUrl=file:///etc/passwd")" = "400" ] && ok "file: ⇒ 400" || no "file:" ""
[ "$(code "${A[@]}" -X POST "$API/slider/admin" -F "desktop=@/tmp/d1.jpg" -F "linkUrl=#/products")" = "201" ] && ok "مسار داخلي #/products ⇒ مقبول" || no "مسار داخلي" ""
# --- JSON PATCH (بلا ملفات) ---
[ "$(code "${A[@]}" -X PATCH "$API/slider/admin/999999" -H 'Content-Type: application/json' -d '{"altText":"نص صالح"}')" = "404" ] && ok "JSON: شريحة غير موجودة ⇒ 404" || no "JSON 404" ""
[ "$(code "${A[@]}" -X PATCH "$API/slider/admin/999999" -H 'Content-Type: application/json' -d '{"sortOrder":"abc"}')" = "400" ] && ok "JSON: DTO غير صالح ⇒ 400" || no "JSON DTO" ""
JT=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"altText":"نص عبر JSON","title":"عنوان","ctaLabel":"تسوّق"}')
JTOK=$(echo "$JT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d).data;console.log(j.altText+'|'+j.title+'|'+j.ctaLabel)}catch(e){console.log('')}})")
[ "$JTOK" = "نص عبر JSON|عنوان|تسوّق" ] && ok "JSON: تعديل نصي فقط" "$JTOK" || no "JSON نصي" "$JT"
JEN=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"isEnabled":false}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(String(JSON.parse(d).data.isEnabled))}catch(e){console.log('err')}})")
[ "$JEN" = "false" ] && ok "JSON: isEnabled فقط" || no "JSON isEnabled" "$JEN"
curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"isEnabled":true}' >/dev/null
JSO=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"sortOrder":7}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(String(JSON.parse(d).data.sortOrder))}catch(e){console.log('err')}})")
[ "$JSO" = "7" ] && ok "JSON: sortOrder فقط" || no "JSON sortOrder" "$JSO"
JRM=$(curl -s "${A[@]}" -X PATCH "$API/slider/admin/$ID2" -H 'Content-Type: application/json' -d '{"mobileMode":"remove"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(String(JSON.parse(d).data.mobileImageUrl))}catch(e){console.log('err')}})")
[ "$JRM" = "null" ] && ok "JSON: mobileMode=remove ⇒ null" || no "JSON remove" "$JRM"
[ "$(code "${A[@]}" -X PATCH "$API/slider/admin/abc" -H 'Content-Type: application/json' -d '{"altText":"نص صالح"}')" = "400" ] && ok "JSON: معرّف غير صالح ⇒ 400" || no "JSON معرّف" "" 
[ "$(code "${A[@]}" -X PATCH "$API/slider/admin/abc" -H 'Content-Type: application/json' -d '{}')" = "400" ] && ok "معرّف غير صالح ⇒ 400" || no "معرّف غير صالح" ""

echo "--- DELETE (safe) ---"
DEL=$(curl -s "${A[@]}" -X DELETE "$API/slider/admin/$ID1")
NEWF=$(basename "$NEW")
[ ! -f "$UP/$NEWF" ] && ok "ملف سطح المكتب نُظّف بعد حذف القاعدة" || no "تنظيف الملف عند الحذف" "$NEWF"
[ "$(code "${A[@]}" "$API/slider/admin/$ID1")" = "404" ] && ok "الشريحة المحذوفة ⇒ 404" || no "الشريحة المحذوفة" ""

echo "--- ROLLBACK: فشل القاعدة ينظّف الجديد ---"
BEFORE=$(ls "$UP"/*.webp 2>/dev/null | wc -l)
curl -s "${A[@]}" -X PATCH "$API/slider/admin/999999" -F "desktop=@/tmp/d1.jpg" >/dev/null
AFTER=$(ls "$UP"/*.webp 2>/dev/null | wc -l)
[ "$BEFORE" = "$AFTER" ] && ok "فشل القاعدة (404) ⇒ لا أصل يتيم" "$BEFORE=$AFTER" || no "أصل يتيم" "$BEFORE→$AFTER"

echo "--- TEMP ---"
TL=$(ls "$UP/.tmp" 2>/dev/null | wc -l)
[ "$TL" = "0" ] && ok "TEMP LEFTOVERS = 0" || no "TEMP" "$TL"

echo; echo "=== STEP 3 API TESTS: $PASS PASS / $FAIL FAIL ==="
rm -f /tmp/body.$$ /tmp/d1.jpg /tmp/d2.jpg /tmp/m1.jpg /tmp/fake.jpg
exit 0
