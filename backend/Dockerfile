FROM node AS base
WORKDIR /app

# Native deps needed by some ldap/winrm packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
