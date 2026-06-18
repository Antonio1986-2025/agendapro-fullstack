# 🚀 Deploy na VPS - Guia Completo

## 📋 Pré-requisitos

- ✅ Acesso SSH à VPS
- ✅ Git instalado na VPS
- ✅ Node.js 18+ instalado
- ✅ PostgreSQL/Supabase configurado
- ✅ Chave OpenAI válida

---

## 🎯 Método 1: Deploy Automático (RECOMENDADO)

### **Passo 1: Fazer Upload do Script**

Na sua VPS, dentro da pasta do projeto:

```bash
# Conectar na VPS
ssh seu-usuario@seu-ip-vps

# Ir para pasta do projeto
cd /caminho/do/agendapro-fullstack

# Baixar o script de deploy
curl -O https://raw.githubusercontent.com/Antonio1986-2025/agendapro-fullstack/main/deploy-vps.sh

# Dar permissão de execução
chmod +x deploy-vps.sh

# Executar
./deploy-vps.sh
```

**O script faz automaticamente:**
- ✅ Backup do código anterior
- ✅ Pull do GitHub
- ✅ Instala dependências
- ✅ Roda migrations
- ✅ Reinicia servidor (PM2/Docker/systemd)
- ✅ Mostra logs

---

## 🔧 Método 2: Deploy Manual

### **Opção A: Com PM2 (Mais Usado)**

```bash
# 1. Conectar SSH
ssh usuario@ip-vps

# 2. Ir para projeto
cd /caminho/do/projeto

# 3. Fazer backup
cp server/services/ai.js server/services/ai.js.backup

# 4. Puxar código novo
git pull origin main

# 5. Ver o que mudou
git log --oneline -3

# 6. Instalar dependências (se houver novas)
npm install --production

# 7. Reiniciar
pm2 restart all

# 8. Ver logs
pm2 logs --lines 50
```

### **Opção B: Com Docker Compose**

```bash
# 1. Conectar SSH
ssh usuario@ip-vps

# 2. Ir para projeto
cd /caminho/do/projeto

# 3. Puxar código
git pull origin main

# 4. Rebuild
docker-compose down
docker-compose up -d --build

# 5. Ver logs
docker-compose logs -f app
```

### **Opção C: Deploy do Zero**

```bash
# 1. Conectar na VPS
ssh usuario@ip-vps

# 2. Clonar repo
git clone https://github.com/Antonio1986-2025/agendapro-fullstack.git
cd agendapro-fullstack

# 3. Criar .env
nano .env
# Cole suas configurações (veja exemplo abaixo)

# 4. Instalar
npm install --production

# 5. Migrations
npm run migrate

# 6. Seed (opcional - dados demo)
npm run seed

# 7. Iniciar com PM2
npm install -g pm2
pm2 start npm --name "agendapro" -- start
pm2 save
pm2 startup
```

---

## 🔐 Configurar .env na VPS

Edite o arquivo `.env`:

```bash
nano .env
```

Cole estas configurações:

```env
# ===== Supabase Database =====
DATABASE_URL=postgresql://postgres.yavvktjanvbejsrramnc:Aaa30269041%23@aws-1-us-east-1.pooler.supabase.com:6543/postgres
DB_SSL=true
SUPABASE_URL=https://yavvktjanvbejsrramnc.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdnZrdGphbnZiZWpzcnJhbW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTMzNDYsImV4cCI6MjA5NzI4OTM0Nn0.kosbz5B2l9of_9zqS4JFHAtz_4UUk-rCq9MNxzw2nwI
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdnZrdGphbnZiZWpzcnJhbW5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTcxMzM0NiwiZXhwIjoyMDk3Mjg5MzQ2fQ.kza59hJ17dfBh1JSMebOiiREQt6zfcdpLZwLPLWkXsI

# ===== OpenAI (CRÍTICO!) =====
# IMPORTANTE: Substitua pela sua chave real da OpenAI
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE

# ===== Servidor =====
PORT=3000
NODE_ENV=production
AUTO_MIGRATE=true
TZ=America/Sao_Paulo

# ===== JWT =====
JWT_SECRET=troque-por-algo-aleatorio-seguro-123456
JWT_EXPIRATION=7d
```

Salve: `Ctrl+O` + Enter, Saia: `Ctrl+X`

---

## ✅ Verificar se Funcionou

### **1. Verificar Servidor Rodando**

```bash
# Com PM2
pm2 status
pm2 logs

# Com Docker
docker-compose ps
docker-compose logs app

# Manual
ps aux | grep node
```

### **2. Testar API**

```bash
# Teste de health
curl http://localhost:3000/api/health

# Deve retornar: {"status":"online",...}
```

### **3. Testar Agente IA**

```bash
# Na VPS, dentro da pasta do projeto
node test-ai.js
```

Se passar todos os testes, está funcionando! ✅

### **4. Acessar via Navegador**

```
http://seu-dominio.com:3000
ou
http://seu-ip-vps:3000
```

---

## 🔧 Troubleshooting

### **Problema 1: OpenAI não conecta**

```bash
# Verificar se a chave está no .env
cat .env | grep OPENAI_API_KEY

# Se não estiver, adicione
echo 'OPENAI_API_KEY=sk-proj-...' >> .env

# Reinicie
pm2 restart all
```

### **Problema 2: Porta 3000 em uso**

```bash
# Ver quem está usando
sudo lsof -i :3000

# Matar processo
kill -9 <PID>

# Ou mudar porta no .env
echo 'PORT=3001' >> .env
```

### **Problema 3: Erro de permissão**

```bash
# Dar permissão para pasta
sudo chown -R $USER:$USER /caminho/do/projeto

# Ou rodar com sudo (não recomendado)
sudo pm2 start npm -- start
```

### **Problema 4: Git pull não funciona**

```bash
# Verificar status
git status

# Se tiver conflitos, resete
git reset --hard origin/main

# Puxe novamente
git pull origin main
```

---

## 📊 Monitoramento

### **Ver Logs em Tempo Real**

```bash
# PM2
pm2 logs --lines 100

# Docker
docker-compose logs -f app

# Arquivo direto
tail -f logs/app.log
```

### **Verificar Uso de Recursos**

```bash
# PM2
pm2 monit

# Docker
docker stats

# Sistema
htop
```

---

## 🔄 Rollback (Se algo der errado)

```bash
# 1. Ver commits
git log --oneline -5

# 2. Voltar para commit anterior
git reset --hard <commit-hash-anterior>

# Exemplo:
git reset --hard 57fab92

# 3. Reiniciar
pm2 restart all
```

---

## 📱 Ativar Agente IA (Após Deploy)

1. Acesse: `http://seu-dominio:3000`
2. Login
3. **Configurações** → **WhatsApp**
4. Conecte WhatsApp (QR Code)
5. Marque **"Agente IA Ativado"**
6. (Opcional) Personalize o prompt
7. **Salvar**

---

## ✅ Checklist Final

- [ ] Código atualizado (`git pull`)
- [ ] `.env` com `OPENAI_API_KEY`
- [ ] Dependências instaladas (`npm install`)
- [ ] Servidor reiniciado
- [ ] Teste passou (`node test-ai.js`)
- [ ] API respondendo (`curl /api/health`)
- [ ] WhatsApp conectado
- [ ] Agente IA ativado
- [ ] Teste real com mensagem WhatsApp

---

## 🆘 Suporte Rápido

**Se estiver com dificuldades:**

1. Envie os logs:
   ```bash
   pm2 logs --lines 50 > logs-erro.txt
   ```

2. Verifique se OpenAI está configurada:
   ```bash
   node test-ai.js
   ```

3. Teste manual:
   ```bash
   npm start
   # Ver erros no console
   ```

---

## 🎯 Deploy Completo = 5 minutos!

Com o script automático, o deploy completo leva apenas **5 minutos**! 🚀

**Comandos rápidos:**

```bash
ssh user@vps
cd /caminho/projeto
git pull origin main
pm2 restart all
pm2 logs
```

**Pronto!** ✅
