# ===========================================
# AgendaPro Fullstack - Node.js + Express
# Serve a API + o frontend estatico
# ===========================================
FROM node:20-alpine

WORKDIR /app

# Instala dependencias primeiro (cache de layer)
COPY package*.json ./
RUN npm install --omit=dev

# Copia o restante do codigo
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=America/Sao_Paulo

EXPOSE 3000

CMD ["node", "server/server.js"]
