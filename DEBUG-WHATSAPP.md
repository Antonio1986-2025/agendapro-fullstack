# 🐛 Debug WhatsApp + Agente IA

## Problema: Números com formato estranho

### ❌ **Problema identificado:**
```
Números chegando assim:
- +226100013703379 (número esquisito)
- +182691383267537 (número esquisito)
- 556799654700 (correto - Brasil)
- 5567998691910 (correto - Brasil)
```

### ✅ **Solução aplicada:**

1. **Logs detalhados** em `baileys-provider.js`
2. **Normalização melhorada** de telefone
3. **Validação** de números mínimos (10 dígitos)
4. **Filtros** para números inválidos

---

## 🔍 Como Debugar Agora

### **1. Ver logs em tempo real na VPS**

```bash
# Conectar na VPS
ssh usuario@ip-vps

# Ver logs do PM2
pm2 logs --lines 100

# OU Docker
docker-compose logs -f app

# Procurar por estas linhas:
# 📱 ====== MENSAGEM RECEBIDA (BAILEYS) ======
# 🎯 ====== MENSAGEM PROCESSANDO (SERVER) ======
# 🤖 ====== PROCESSANDO MENSAGEM ======
```

### **2. Quando alguém enviar mensagem, você verá:**

```
📱 ====== MENSAGEM RECEBIDA (BAILEYS) ======
Raw message: {...}
fromMe: false
remoteJid: 5567998691910@s.whatsapp.net
📞 Telefone extraído: 5567998691910
💬 Texto: Olá, bom dia
🆔 RemoteJid: 5567998691910@s.whatsapp.net
✅ Mensagem válida, chamando onMessage handler

🎯 ====== MENSAGEM PROCESSANDO (SERVER) ======
📱 Telefone: 5567998691910
🆔 RemoteJid: 5567998691910@s.whatsapp.net
💬 Mensagem: Olá, bom dia
🏪 Barbearia: abc-123-def
🤖 IA habilitada: SIM
💾 Mensagem salva no banco
📚 Histórico: 0 mensagens
🤖 Chamando processarMensagem...

🤖 ====== PROCESSANDO MENSAGEM ======
📍 Barbearia: NAVALHA (abc-123)
💬 Mensagem: Olá, bom dia
📚 Histórico: 0 mensagens
✅ OpenAI cliente inicializado
📤 Enviando para OpenAI...
📥 Resposta recebida
✅ Resposta simples: Olá! Bom dia! ☀️ ...
```

---

## 🚨 Problemas Comuns

### **Problema 1: Números estranhos (+226...)**

**Possível causa:** Spam, mensagens de outros países, ou números de teste

**Solução aplicada:**
- Valida que número tem pelo menos 10 dígitos
- Remove caracteres não numéricos
- Aceita apenas números válidos

**Nos logs, você verá:**
```
⚠️  Telefone muito curto (9 dígitos): 226100013
⏭️  Ignorando mensagem
```

### **Problema 2: IA não responde**

**Checklist:**

1. ✅ WhatsApp conectado?
   ```bash
   # Ver status
   curl http://localhost:3000/api/health
   ```

2. ✅ IA está ativada?
   ```bash
   # Verificar no banco
   psql -c "SELECT ai_enabled FROM whatsapp_config;"
   ```

3. ✅ OpenAI_API_KEY configurada?
   ```bash
   cat .env | grep OPENAI_API_KEY
   ```

4. ✅ Logs mostram erro?
   ```bash
   pm2 logs --lines 50 --err
   ```

### **Problema 3: Mensagem recebida mas não processada**

**Nos logs, procure por:**

```bash
# Mensagem chegou no Baileys?
grep "MENSAGEM RECEBIDA" logs.txt

# Passou validação?
grep "Mensagem válida" logs.txt

# IA está habilitada?
grep "IA habilitada: SIM" logs.txt

# Chamou OpenAI?
grep "Enviando para OpenAI" logs.txt
```

---

## 🔧 Comandos Úteis na VPS

### **Ver últimas mensagens recebidas**

```bash
pm2 logs | grep "MENSAGEM RECEBIDA" -A 5
```

### **Ver se IA está respondendo**

```bash
pm2 logs | grep "Resposta gerada"
```

### **Ver erros**

```bash
pm2 logs --err --lines 50
```

### **Limpar logs e testar**

```bash
pm2 flush
# Agora envie mensagem WhatsApp
pm2 logs
```

---

## 📊 Diagnóstico Rápido

Execute isso na VPS:

```bash
# 1. Ver status do servidor
pm2 status

# 2. Ver últimas 30 linhas de log
pm2 logs --lines 30

# 3. Testar IA localmente
node test-ai.js

# 4. Ver configuração WhatsApp no banco
psql -d agendapro -c "SELECT barbearia_id, ai_enabled, session_status FROM whatsapp_config;"
```

---

## ✅ Checklist de Funcionamento

Quando alguém enviar mensagem, deve aparecer:

- [ ] `📱 MENSAGEM RECEBIDA (BAILEYS)` ✅
- [ ] `📞 Telefone extraído: 5567...` ✅
- [ ] `✅ Mensagem válida` ✅
- [ ] `🎯 MENSAGEM PROCESSANDO (SERVER)` ✅
- [ ] `🤖 IA habilitada: SIM` ✅
- [ ] `💾 Mensagem salva no banco` ✅
- [ ] `🤖 Chamando processarMensagem` ✅
- [ ] `📤 Enviando para OpenAI` ✅
- [ ] `📥 Resposta recebida` ✅
- [ ] `📤 Enviando resposta para...` ✅

Se algum não aparecer, **ali está o problema!**

---

## 🔄 Atualizar na VPS

```bash
# 1. Conectar
ssh usuario@ip-vps

# 2. Ir para projeto
cd /caminho/do/projeto

# 3. Puxar código novo (com logs)
git pull origin main

# 4. Reiniciar
pm2 restart all

# 5. Testar enviando mensagem WhatsApp

# 6. Ver logs em tempo real
pm2 logs
```

---

## 🎯 Teste Manual

```bash
# Na VPS
cd /caminho/do/projeto

# Testar IA isoladamente
node test-ai.js

# Se passar, problema é no WhatsApp
# Se falhar, problema é na OpenAI
```

---

## 📱 Números Válidos vs Inválidos

### ✅ **Aceitos:**
```
5567998691910     → ✅ Brasil (55) + DDD (67) + 9 dígitos
556799654700      → ✅ Brasil (55) + DDD (67) + 8 dígitos
67998691910       → ✅ Adiciona 55 automaticamente
6799654700        → ✅ Adiciona 55 automaticamente
```

### ❌ **Rejeitados:**
```
226100013703379   → ❌ Muito longo, não é Brasil
182691383267537   → ❌ Muito longo, não é Brasil
12345             → ❌ Muito curto (< 10 dígitos)
```

---

## 🆘 Se Ainda Não Funcionar

1. **Capture os logs completos:**
   ```bash
   pm2 logs --lines 200 > debug-logs.txt
   ```

2. **Envie mensagem teste**

3. **Veja o que apareceu:**
   ```bash
   cat debug-logs.txt | grep -A 10 "MENSAGEM RECEBIDA"
   ```

4. **Procure por erros:**
   ```bash
   cat debug-logs.txt | grep "❌"
   ```

5. **Me mande os logs** para eu analisar

---

## 🔐 Validação de Telefone

O código agora faz:

```javascript
// 1. Remove caracteres não numéricos
telefone = telefone.replace(/\D/g, '');

// 2. Valida mínimo 10 dígitos
if (telefone.length < 10) {
  console.log('Telefone inválido, ignorando');
  return;
}

// 3. Normaliza para formato padrão
if (telefone.length === 11) {
  telefone = '55' + telefone; // Adiciona código do país
}
```

---

**Agora está com logs super detalhados!** 🔍

**Envie mensagem WhatsApp e veja nos logs o que acontece!** 📱
