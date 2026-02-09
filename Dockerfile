FROM node:20-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package.json ./
RUN npm install --production

# Copiar o restante dos arquivos
COPY . .

# Porta do servidor
EXPOSE 3000

# Iniciar
CMD ["node", "server.js"]
