# ============================================================================
# PanahFit CMS — چند‌مرحله‌ای: بیلد UI → ایمیج سبک با سرور Node (بدون devDeps)
# build:  docker build -t panahfit-cms .
# run:    docker run -d -p 8787:8787 -v panahfit-data:/app/data --env-file .env panahfit-cms
# ============================================================================
FROM node:22-alpine AS ui-build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache wget && addgroup -g 1001 app && adduser -u 1001 -G app -s /sbin/nologin -D app
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=data
COPY package*.json ./
COPY server ./server
COPY src/data ./src/data
COPY src/utils ./src/utils
COPY --from=ui-build /src/dist ./dist
RUN mkdir -p /app/data && chown -R app:app /app
USER app
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/api/health | grep -q '"ok":true'
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
