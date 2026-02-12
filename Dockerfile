# ============================================================================
# STAGE 1: Build do Next.js (crm-whatsapp-pro)
# ============================================================================
FROM node:20-alpine AS nextjs-builder

WORKDIR /app/nextjs

# Copiar package.json do Next.js e instalar deps
COPY crm-whatsapp-pro/package.json crm-whatsapp-pro/package-lock.json* ./
RUN npm ci

# Copiar código-fonte do Next.js
COPY crm-whatsapp-pro/ ./

# Build com output standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================================
# STAGE 2: Runtime — Next.js (frontend :3000) + server.js (API :3001)
# ============================================================================
FROM node:20-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk add --no-cache supervisor wget

WORKDIR /app

# --- Backend API (server.js) ---
COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

COPY server.js ./
COPY core/ ./core/
COPY functions/ ./functions/

# --- Next.js standalone output ---
COPY --from=nextjs-builder /app/nextjs/.next/standalone ./nextjs/
COPY --from=nextjs-builder /app/nextjs/.next/static ./nextjs/.next/static
COPY --from=nextjs-builder /app/nextjs/public ./nextjs/public

# --- Supervisord config (roda os 2 processos) ---
RUN mkdir -p /etc/supervisor/conf.d /var/log/supervisor

COPY <<'EOF' /etc/supervisor/conf.d/app.ini
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log

[program:backend]
command=node /app/server.js
directory=/app
environment=PORT=3001,NODE_ENV=production
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nextjs]
command=node /app/nextjs/server.js
directory=/app/nextjs
environment=PORT=3000,HOSTNAME=0.0.0.0,NODE_ENV=production,CRM_API_URL=http://localhost:3001
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

# Criar diretório de dados persistentes
RUN mkdir -p /app/.crm-data && chown -R appuser:appgroup /app

# Porta do Next.js (frontend) — exposta para o Easypanel
EXPOSE 3000

# Health check no Next.js
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

# Iniciar com supervisord (2 processos)
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/app.ini"]
