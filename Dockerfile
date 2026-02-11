FROM node:20-alpine

# Criar usuário não-root para segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copiar package.json e instalar dependências (camada cacheada)
COPY package.json package-lock.json* ./
RUN npm install --production && npm cache clean --force

# Copiar código do backend
COPY server.js ./
COPY core/ ./core/

# Copiar frontend (HTML + JS + imagens)
COPY *.html ./
COPY *.js ./
COPY *.png ./

# Copiar Netlify functions (usadas como fallback)
COPY functions/ ./functions/

# Criar diretório de dados persistentes
RUN mkdir -p /app/.crm-data && chown -R appuser:appgroup /app

# Porta do servidor
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/whatsapp/status || exit 1

# Rodar como usuário não-root
USER appuser

# Iniciar
CMD ["node", "server.js"]
