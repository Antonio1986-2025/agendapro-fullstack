# 🚀 Configuração Evolution API

Guia completo para instalar e configurar a Evolution API no EasyPanel para gerenciar WhatsApp de múltiplas barbearias.

---

## 📋 O Que É Evolution API

Evolution API é um servidor centralizado que gerencia conexões WhatsApp. Cada barbearia tem sua própria "instância" isolada, sem conflitos.

### Arquitetura

```
┌──────────────────┐
│  Seu AgendaPro   │ ◄─── Webhook (recebe mensagens)
│  (Node.js)       │ ────► HTTP/REST (envia mensagens)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Evolution API   │ ◄─── Servidor WhatsApp
│  (Docker)        │      (gerencia todas instâncias)
└────────┬─────────┘
         │
         ▼
   ┌─────────┐
   │WhatsApp │
   │  Cloud  │
   └─────────┘
```

---

## 🚀 Instalação no EasyPanel

### **Passo 1: Criar novo serviço**

1. Acesse o EasyPanel
2. Clique em **"Create Service"**
3. Selecione **"App"**
4. Configure:

```
Name: evolution-api
Source: Docker Image
Image: atendai/evolution-api:latest
Port: 8080
```

### **Passo 2: Variáveis de Ambiente**

Adicione estas variáveis:

```env
# Servidor
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://evolution.seu-dominio.com

# Autenticação (CHAVE GLOBAL - guarde bem!)
AUTHENTICATION_API_KEY=GERE-UMA-CHAVE-FORTE-AQUI

# CORS
CORS_ORIGIN=*
CORS_METHODS=POST,GET,PUT,DELETE
CORS_CREDENTIALS=true

# Logger
LOG_LEVEL=ERROR
LOG_COLOR=true
LOG_BAILEYS=error

# Database (PostgreSQL - use o mesmo Supabase ou crie outro)
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://user:senha@host:5432/evolution
DATABASE_CONNECTION_CLIENT_NAME=evolution-api

# Cache (Redis - opcional mas recomendado)
CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true

# Instâncias
DEL_INSTANCE=false
DEL_TEMP_INSTANCES=true

# QR Code
QRCODE_LIMIT=30
QRCODE_COLOR=#175197

# Webhook global (opcional - cada instância pode ter webhook próprio)
WEBHOOK_GLOBAL_ENABLED=false

# Eventos do Webhook
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true

# Telemetria
TELEMETRY=false
TELEMETRY_URL=
```

### **Passo 3: Gerar API Key Forte**

Use este comando para gerar uma chave segura:

```bash
openssl rand -base64 32
```

Ou use um gerador online: https://generate-random.org/api-key-generator

Cole a chave gerada em `AUTHENTICATION_API_KEY`.

### **Passo 4: Configurar Domínio**

No EasyPanel, configure um domínio:
- `evolution.seu-dominio.com`
- Habilitar HTTPS (Let's Encrypt automático)

### **Passo 5: Deploy**

Clique em **"Deploy"** e aguarde a Evolution API subir.

---

## 🔧 Configurar AgendaPro para Usar Evolution

### **No EasyPanel, no serviço agendapro:**

Adicione/atualize estas variáveis de ambiente:

```env
# Evolution API
EVOLUTION_API_URL=https://evolution.seu-dominio.com
EVOLUTION_API_KEY=A-MESMA-CHAVE-DO-AUTHENTICATION_API_KEY

# URL pública do AgendaPro (para webhooks)
SISTEMA_URL=https://agendapro.seu-dominio.com
```

**IMPORTANTE:** A `EVOLUTION_API_KEY` deve ser **exatamente a mesma** que você configurou em `AUTHENTICATION_API_KEY` no Evolution.

### **Reinicie o agendapro:**

No EasyPanel, faça um deploy do agendapro para pegar as novas variáveis.

---

## ✅ Testar Configuração

### **1. Testar conexão com Evolution API**

Faça login no painel do AgendaPro e acesse:

```
GET /api/whatsapp/teste-evolution
```

Resposta esperada:
```json
{
  "ok": true,
  "versao": "2.x.x",
  "mensagem": "Welcome to the Evolution API"
}
```

### **2. Testar pelo Postman/curl**

```bash
curl -X GET https://evolution.seu-dominio.com \
  -H "apikey: SUA_CHAVE_GLOBAL"
```

---

## 📱 Como Funciona Para Cada Barbearia

### **1. Barbearia se cadastra no AgendaPro**

```
POST /api/auth/registrar
{
  "barbeariaNome": "Barbearia Top",
  "nome": "João",
  "email": "joao@email.com",
  "senha": "123456"
}
```

✅ **Automaticamente:**
- Cria barbearia no banco
- Cria usuário owner
- **Cria instância na Evolution API** (`barbearia-{id}`)
- Configura webhook para receber mensagens

### **2. Barbearia conecta WhatsApp**

No painel:
- Configurações → WhatsApp → **Conectar**
- Sistema chama `POST /api/whatsapp/conectar`
- Evolution API gera QR Code
- Barbearia escaneia com o celular
- ✅ Conectado!

### **3. Cliente envia mensagem**

```
Cliente WhatsApp: "Quero agendar"
       ↓
Evolution API recebe
       ↓
Webhook → AgendaPro
       ↓
IA processa
       ↓
Evolution API envia resposta
       ↓
Cliente recebe ✅
```

---

## 🔐 Segurança

### **Chaves de API:**

- **Global API Key** (`AUTHENTICATION_API_KEY`)
  - Acesso total à Evolution API
  - Use apenas no backend
  - **Nunca exponha no frontend**

- **Instance API Key**
  - Cada barbearia tem sua própria
  - Acesso apenas àquela instância
  - Gerada automaticamente pela Evolution

### **Webhook:**

O webhook recebe mensagens da Evolution API. Para segurança:
- Use HTTPS sempre
- Valide o `apikey` no header
- Restrinja origem se possível

---

## 🐛 Troubleshooting

### **Erro: "Cannot connect to Evolution API"**

**Causa:** Variável `EVOLUTION_API_URL` errada ou Evolution offline.

**Solução:**
```bash
# Verificar se Evolution está rodando
curl https://evolution.seu-dominio.com

# Verificar logs
docker logs evolution-api
```

### **Erro: "Unauthorized"**

**Causa:** `EVOLUTION_API_KEY` errada.

**Solução:**
- Verifique se `EVOLUTION_API_KEY` no agendapro é igual a `AUTHENTICATION_API_KEY` na Evolution.

### **Erro: "Instance not found"**

**Causa:** Instância foi deletada ou não foi criada.

**Solução:**
```bash
# Recriar instância
POST /api/whatsapp/conectar
```

### **Webhook não recebe mensagens**

**Causa:** URL do webhook inacessível ou bloqueada.

**Verificações:**
- `SISTEMA_URL` está correto?
- O servidor está acessível pela internet?
- Firewall bloqueando?

**Testar webhook:**
```bash
curl -X POST https://seu-sistema.com/api/whatsapp/webhook/evolution/SEU_ID \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
```

### **QR Code não aparece**

**Causa:** Instância em estado inválido.

**Solução:**
```bash
# Pelo painel da barbearia:
1. Desconectar
2. Aguardar 10 segundos
3. Conectar novamente
```

### **WhatsApp desconecta toda hora**

**Causa:** Conflito (outro dispositivo conectado).

**Solução:**
- No celular: Configurações → Aparelhos conectados → Desconectar todos
- Conectar novamente pelo painel

---

## 📊 Monitoramento

### **Painel da Evolution API**

Acesse: `https://evolution.seu-dominio.com/manager`

Mostra:
- Todas as instâncias
- Status de cada uma
- Mensagens em tempo real
- Configurações

### **Logs no EasyPanel**

```bash
# Logs Evolution
docker logs evolution-api -f

# Logs AgendaPro
docker logs agendapro -f
```

---

## 💰 Custos

### **Self-hosted (recomendado):**
- VPS: $5-20/mês
- Domínio: $10/ano
- **Total:** ~$70/ano

### **SaaS Evolution (alternativa):**
- $20-100/mês dependendo do volume
- Sem dor de cabeça com infra

---

## 🎯 Estrutura do Banco

O sistema adicionou estas colunas em `whatsapp_config`:

```sql
ALTER TABLE whatsapp_config ADD COLUMN evolution_instance_name VARCHAR(120);
ALTER TABLE whatsapp_config ADD COLUMN evolution_api_key VARCHAR(255);
ALTER TABLE whatsapp_config ADD COLUMN evolution_phone VARCHAR(30);
```

---

## 🔄 Migração de Baileys → Evolution

Se você já estava usando Baileys e quer migrar:

### **Para barbearias existentes:**

1. Acesse o painel de cada barbearia
2. **Desconectar** WhatsApp atual (Baileys)
3. Mudar provider para `evolution`:
   ```
   PUT /api/whatsapp/config
   { "provider": "evolution" }
   ```
4. **Conectar** novamente (cria instância Evolution)
5. Escanear QR Code

### **Para novas barbearias:**

✅ Já funciona automaticamente! Instância é criada no cadastro.

---

## 📚 Recursos Úteis

- **Documentação oficial:** https://doc.evolution-api.com
- **GitHub:** https://github.com/EvolutionAPI/evolution-api
- **Postman Collection:** Disponível na documentação
- **Discord:** https://discord.gg/evolution-api

---

## ✅ Checklist de Configuração

- [ ] Evolution API instalada no EasyPanel
- [ ] `AUTHENTICATION_API_KEY` configurada (chave forte)
- [ ] Domínio HTTPS configurado
- [ ] Banco de dados configurado
- [ ] No agendapro: `EVOLUTION_API_URL` configurado
- [ ] No agendapro: `EVOLUTION_API_KEY` igual à da Evolution
- [ ] No agendapro: `SISTEMA_URL` configurado (URL pública)
- [ ] Teste de conexão funcionando (`/api/whatsapp/teste-evolution`)
- [ ] Cadastro de barbearia cria instância automaticamente
- [ ] QR Code aparece ao conectar
- [ ] Mensagens são recebidas via webhook
- [ ] IA responde corretamente
- [ ] Cliente recebe respostas

---

## 🚀 Próximos Passos

Depois de configurar:

1. **Migrar barbearias existentes** para Evolution
2. **Testar fluxo completo** (cadastro → conectar → mensagem)
3. **Configurar monitoramento** (logs e alertas)
4. **Backup regular** do banco de dados
5. **Documentar** para sua equipe

---

**Status:** ✅ Pronto para usar  
**Versão:** 1.0  
**Última atualização:** 20/06/2026
