# One image for both Railway services: the web app (default CMD) and the daily refresh cron
# (start command `npm run refresh`). Dev dependencies stay installed because the refresh scripts run via tsx.
FROM node:24-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
# Railway sets PORT; bind on all interfaces
CMD ["sh", "-c", "exec npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
