FROM node:20-slim AS base
WORKDIR /app

# 1. تثبيت الحزم البرمجية التي تحتاجه بعض المكتبات (مثل ldap / winrm / prisma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. نسخ ملفات التعريف وتثبيت الـ dependencies
COPY package*.json ./
RUN npm install

# 3. نسخ مجلد Prisma وتوليد الـ Client
COPY prisma ./prisma/
RUN npx prisma generate

# 4. نسخ باقي الكود المصدر
COPY . .

EXPOSE 3000

# 5. التشغيل المباشر للـ Development mode مع المراقبة (Watch Mode)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:dev"]