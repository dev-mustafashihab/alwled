# Alwled API — production image (multi-stage, non-root, production deps only)
#
# ملاحظات:
#  - لا يُنسخ أي ملف أسرار: لا .env ولا مفاتيح. كل القيم تأتي من environment وقت التشغيل.
#  - لا تُنسخ مخرجات QA/لقطات/اختبارات: انظر .dockerignore.

# ---------------------------------------------------------------- builder
# صورة Debian (glibc + openssl 3): المسار المدعوم رسمياً لمحرّك Prisma، بلا تعارض musl/openssl
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=development
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# deterministic install (يطابق package-lock.json حرفياً)
# --ignore-scripts: postinstall يشغّل "prisma generate" قبل نسخ مجلد prisma؛ نولّده صراحةً بعد النسخ
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Prisma client يُولَّد داخل الـbuilder ثم يُنقل إلى صورة التشغيل
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------- runtime
# runtime Debian/glibc — يجب أن يطابق منصّة محرّك Prisma المُولَّد (glibc + openssl 3)
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    # مسار محرّك Prisma صريحاً: يمنع كشف المنصّة عند التشغيل من اختيار هدف غير موجود في الصورة
    PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# production dependencies فقط. --ignore-scripts: لأن postinstall يشغّل prisma CLI الموجود ضمن devDependencies،
# والعميل المُولَّد يُنسخ جاهزاً من الـbuilder بالأسفل.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# الواجهة الثابتة (لوحة الإدارة + متجر الزبون) — يقدّمها reverse proxy من هذه الصورة
COPY frontend ./frontend
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# تشغيل كمستخدم غير جذري (مستخدم node المضمّن في الصورة الرسمية)
USER node

EXPOSE 3100

# readiness (يلمس قاعدة البيانات) — liveness المنفصل على /api/v1/health/live
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# SIGTERM/SIGINT: Nest مُفعّل عليه enableShutdownHooks فيغلق Prisma وينهي الطلبات الجارية بلطف
CMD ["node", "dist/src/main.js"]
