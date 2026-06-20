# 🆕 Instalação Limpa na VPS - Novo App

## ✅ Vantagens de Fazer Novo

- 🔄 Configuração limpa do zero
- ✅ Código mais recente do GitHub
- 🐛 Sem problemas de configuração antiga
- 🚀 Testar antes de apagar o antigo

---

## 🚀 Método 1: Script Automático (RECOMENDADO)

### **Copie e cole isso na VPS:**

```bash
# 1. Baixar script de instalação
cd ~
curl -O https://raw.githubusercontent.com/Antonio1986-2025/agendapro-fullstack/main/INSTALL-FRESH-VPS.sh

# 2. Dar permissão
chmod +x INSTALL-FRESH-VPS.sh

# 3. Executar
./INSTALL-FRESH-VPS.sh
```

O script vai perguntar:
- Nome da pasta (ex: `agendapro-new`)
- Porta (ex: `3001` - diferente da atual)
- Credenciais do banco
- Chave OpenAI
- Se quer dados demo

**Tempo:** 5-10 minutos ⚡

---

## 📝 Método 2: Manual (Passo a Passo)

### **1. Conectar na VPS**
```bash
ssh seu-usuario@seu-ip-vps
```

### **2. Criar nova pasta**
```bash
cd ~
mkdir agendapro-new
cd agendapro-new
```

### **3. Clonar repositório**
```bash
git clone https://github.com/Antonio1986-2025/agendapro-fullstack.git .
```

### **4. Criar arquivo .env**
```bash
nano .env
```

Cole isso (substitua os valores):
```env
# Banco
DATABASE_URL=postgresql://postgres.yavvktjanvbejsrramnc:Aaa30269041%23@aws-1-us-east-1.pooler.supabase.com:6543/postgres
DB_SSL=true
SUPABASE_URL=https://yavvktjanvbejsrramnc.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_KEY=sua-service-key

# OpenAI
OPENAI_API_KEY=sk-proj-SUA_CHAVE_OPENAI_AQUI

# Servidor
PORT=3001
NODE_ENV=production
AUTO_MIGRATE=true
TZ=America/Sao_Paulo

# JWT
JWT_SECRET=seu-secret-aleatorio-aqui
JWT_EXPIRATION=7d
```

Salvar: `Ctrl+O` + Enter, Sair: `Ctrl+X`

### **5. Instalar dependências**
```bash
npm install --production
```

### **6. Rodar migrations**
```bash
npm run migrate
```

### **7. (Opcional) Popular banco com dados demo**
```bash
npm run seed
```

### **8. Testar Agente IA**
```bash
node test-ai.js
```

Se passar todos os testes, está funcionando! ✅

### **9. Iniciar com PM2**
```bash
pm2 start npm --name "agendapro-new" -- start
pm2 save
```

### **10. Ver logs**
```bash
pm2 logs agendapro-new
```

---

## 🔧 Testar Novo App

### **Acessar pelo navegador:**
```
http://seu-ip-vps:3001
```

### **Login demo:**
```
Email: demo@agendapro.com
Senha: 123456
```

### **Testar IA:**
1. Vá em Configurações → WhatsApp
2. Conecte WhatsApp (QR Code)
3. Ative "Agente IA"
4. Envie mensagem WhatsApp
5. Veja logs: `pm2 logs agendapro-new`

---

## ⚖️ Comparar Antigo vs Novo

### **Ver ambos rodando:**
```bash
pm2 status
```

Você verá:
```
┌─────┬──────────────────┬─────────┬─────────┐
│ id  │ name             │ status  │ port    │
├─────┼──────────────────┼─────────┼─────────┤
│ 0   │ agendapro        │ online  │ 3000    │ ← Antigo
│ 1   │ agendapro-new    │ online  │ 3001    │ ← Novo
└─────┴──────────────────┴─────────┴─────────┘
```

### **Testar ambos:**
- Antigo: `http://seu-ip:3000`
- Novo: `http://seu-ip:3001`

---

## ✅ Se Novo Funcionar, Migrar

### **1. Parar app antigo**
```bash
pm2 stop agendapro
```

### **2. Mudar porta do novo para 3000**
```bash
cd ~/agendapro-new
nano .env
# Mudar: PORT=3000
pm2 restart agendapro-new
```

### **3. Renomear no PM2**
```bash
pm2 delete agendapro
pm2 restart agendapro-new --name agendapro
pm2 save
```

### **4. (Opcional) Apagar pasta antiga**
```bash
cd ~
rm -rf agendapro-old  # ou o nome da pasta antiga
```

---

## 🔄 Rollback (Se Algo Der Errado)

### **Voltar para app antigo:**
```bash
pm2 stop agendapro-new
pm2 restart agendapro
```

### **Apagar novo:**
```bash
pm2 delete agendapro-new
rm -rf ~/agendapro-new
```

---

## 📊 Checklist de Sucesso

- [ ] Código clonado do GitHub
- [ ] `.env` criado com todas as variáveis
- [ ] `npm install` sem erros
- [ ] `npm run migrate` executado
- [ ] `node test-ai.js` passou todos os testes
- [ ] PM2 iniciou sem erros
- [ ] Consegue acessar pelo navegador
- [ ] Login funciona
- [ ] WhatsApp conecta
- [ ] IA está ativada
- [ ] Mensagem WhatsApp funciona

---

## 🎯 Vantagens da Instalação Limpa

| Aspecto | App Antigo | App Novo |
|---------|------------|----------|
| **Código** | Desatualizado | ✅ Último commit |
| **Config** | Pode ter erros | ✅ Limpa |
| **Logs** | Detalhados | ✅ Super detalhados |
| **WhatsApp** | Problemas | ✅ Corrigido |
| **IA** | Não responde | ✅ Funcionando |
| **.env** | Pode faltar variáveis | ✅ Completo |

---

## 💡 Dicas

### **Durante instalação:**
- Use porta diferente (3001) para testar
- Não apague o antigo até ter certeza
- Teste tudo antes de migrar

### **Se der erro:**
- Veja logs: `pm2 logs agendapro-new --lines 100`
- Teste IA: `node test-ai.js`
- Verifique .env: `cat .env`

### **Depois de funcionar:**
- Migre para porta 3000
- Apague app antigo
- Configure firewall se necessário

---

## 🆘 Suporte Rápido

**Se algo não funcionar:**

1. **Ver logs:**
   ```bash
   pm2 logs agendapro-new --lines 50
   ```

2. **Testar IA isoladamente:**
   ```bash
   cd ~/agendapro-new
   node test-ai.js
   ```

3. **Verificar .env:**
   ```bash
   cat .env | grep OPENAI_API_KEY
   ```

4. **Reiniciar:**
   ```bash
   pm2 restart agendapro-new
   ```

---

## 🎉 Resultado Esperado

Após instalação limpa:

✅ App rodando em nova porta
✅ Código mais recente
✅ OpenAI conectada
✅ Logs super detalhados
✅ WhatsApp funcionando
✅ IA respondendo mensagens

**Tempo total:** 10-15 minutos

---

**Quer que eu te guie passo a passo?** 🚀

Escolha o método:
- **A)** Script automático (mais rápido)
- **B)** Manual passo a passo (mais controle)

Me diga e vamos começar!
