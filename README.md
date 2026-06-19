# AgendaPro Fullstack 💈🤖

Sistema SaaS multi-tenant completo de agendamento para barbearias com **Agente IA Inteligente**.

Backend Node.js + PostgreSQL + frontend integrado + **OpenAI GPT-4o-mini** para atendimento automatizado via WhatsApp.

## ✨ Funcionalidades Principais

### 🤖 **NOVO: Agente IA com OpenAI**
- **Atendimento 24/7** via WhatsApp com processamento de linguagem natural
- **9 ferramentas automatizadas**: listar serviços, verificar disponibilidade, criar agendamentos, cancelar, reagendar
- **Contexto persistente**: mantém histórico de conversas por cliente
- **Respostas humanizadas** com emojis e formatação amigável
- **Personalização total** do comportamento via prompt customizado

### 📅 Gestão de Agendamentos
- Agendamentos persistentes no banco de dados
- Página pública para clientes agendarem (`/agendar.html?b=slug`)
- Horários especiais (noturno +50%) configuráveis por profissional
- Conflito de horários prevenido automaticamente

### 👥 Gestão de Negócio
- Multi-tenant (dados isolados por barbearia)
- Gestão de profissionais, serviços e clientes
- Sistema de comandas digitais
- Controle de caixa e financeiro
- Controle de estoque
- Sistema de comissões
- Dashboard com métricas em tempo real

### 📱 Integração WhatsApp
- **Baileys** (conexão direta, sem API paga)
- Confirmação automática para clientes
- Notificação para barbeiros
- **IA responde automaticamente** mensagens dos clientes

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco | PostgreSQL (Supabase) |
| IA | OpenAI GPT-4o-mini |
| WhatsApp | @whiskeysockets/baileys |
| Auth | JWT + bcrypt |
| Frontend | HTML/CSS/JS (mobile-first) |
| Deploy | Docker / PM2 / Node direto |

## 🚀 Rodar Localmente

### Opção 1: Com Docker (recomendado)
```bash
docker compose up --build
docker compose exec app node server/db/seed.js   # dados demo

# Acesse http://localhost:3000
# Login demo: demo@agendapro.com / 123456
```

### Opção 2: Sem Docker
```bash
npm install
cp .env.example .env   # ajuste DATABASE_URL e OPENAI_API_KEY
npm run seed
npm start

# Acesse http://localhost:3000
```

### ⚙️ Configuração Obrigatória

Edite o arquivo `.env`:

```env
# Database
DATABASE_URL=postgresql://...
DB_SSL=true

# OpenAI (OBRIGATÓRIO para IA funcionar)
OPENAI_API_KEY=sk-proj-...

# JWT
JWT_SECRET=seu-secret-aleatorio
```

## 🤖 Ativar Agente IA

1. Acesse o painel: `http://localhost:3000`
2. Login com suas credenciais
3. Vá em **Configurações** → **WhatsApp**
4. Clique em **Conectar WhatsApp** e escaneie o QR Code
5. Ative **"Agente IA"**
6. (Opcional) Personalize o prompt do sistema
7. **Salvar**

Pronto! O agente responderá automaticamente mensagens via WhatsApp 24/7! 🎉

## 🧪 Testar Agente IA

```bash
node test-ai.js
```

Isso testa:
- ✅ Conexão com OpenAI
- ✅ Processamento de mensagens
- ✅ Execução de ferramentas (tools)
- ✅ Salvamento de histórico

## 📖 Documentação Completa

- **[AGENTE-IA.md](./AGENTE-IA.md)** - Documentação técnica do agente (9 ferramentas, fluxo, debugging)
- **[QUICK-START-AI.md](./QUICK-START-AI.md)** - Ativação rápida em 5 minutos
- **[PROMPTS-EXEMPLOS.md](./PROMPTS-EXEMPLOS.md)** - 15+ exemplos de personalização
- **[DEPLOY-VPS.md](./DEPLOY-VPS.md)** - Deploy completo na VPS
- **[COMANDOS-VPS-RAPIDO.txt](./COMANDOS-VPS-RAPIDO.txt)** - Comandos para copiar/colar

## 📁 Estrutura do Projeto

```
├── server/
│   ├── server.js              # Servidor principal
│   ├── config/
│   │   ├── database.js        # Pool PostgreSQL
│   │   └── supabase.js        # Cliente Supabase
│   ├── db/
│   │   ├── schema.sql         # Schema completo
│   │   ├── migrate.js         # Aplicação de migrations
│   │   └── seed.js            # Dados de demonstração
│   ├── middleware/
│   │   └── auth.js            # Validação JWT
│   ├── routes/                # 15 rotas de API
│   │   ├── ai.js              # 🤖 Rotas do agente IA
│   │   ├── agendamentos.js
│   │   ├── whatsapp.js
│   │   └── ...
│   └── services/
│       ├── ai.js              # 🤖 Lógica principal do agente IA
│       ├── whatsapp.js        # Envio de mensagens
│       └── baileys-provider.js # Conexão WhatsApp
├── public/                    # Frontend (HTML/CSS/JS)
│   ├── index.html             # Landing page
│   ├── login.html
│   ├── dashboard-mobile.html
│   ├── chat-mobile.html       # 🤖 Interface do chat IA
│   └── ...
├── test-ai.js                 # 🤖 Script de teste do agente
├── AGENTE-IA.md               # 🤖 Documentação completa
├── QUICK-START-AI.md          # 🤖 Guia rápido
├── PROMPTS-EXEMPLOS.md        # 🤖 Exemplos de prompts
├── DEPLOY-VPS.md              # Guia de deploy
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## 🎯 Funcionalidades do Agente IA

O assistente virtual responde automaticamente via WhatsApp e pode:

| Ação | Descrição |
|------|-----------|
| 📋 Listar Serviços | Mostra todos os serviços com preços e duração |
| 👥 Listar Profissionais | Exibe barbeiros disponíveis e especialidades |
| 📅 Verificar Disponibilidade | Consulta horários livres por data |
| 🔍 Buscar Cliente | Localiza cliente existente por telefone |
| ➕ Cadastrar Cliente | Registra novo cliente no sistema |
| ✅ Criar Agendamento | Agenda horário após confirmar detalhes |
| 📋 Listar Agendamentos | Mostra agendamentos futuros do cliente |
| ❌ Cancelar Agendamento | Cancela horário marcado |
| 🔄 Reagendar | Altera data/hora de agendamento existente |

### Exemplo de Conversa Real:

```
Cliente: Oi, bom dia!
IA: Olá! Bom dia! ☀️ Como posso ajudar você hoje?

Cliente: Quero agendar um corte
IA: Ótimo! Para qual data você gostaria de agendar?

Cliente: Amanhã às 14h
IA: [Verifica disponibilidade]
    Perfeito! Amanhã, sexta-feira, 19 de junho...
    Qual profissional você prefere?
    • Carlos (Cortes clássicos)
    • Pedro (Barbas e degradês)

Cliente: Carlos
IA: [Cria agendamento]
    ✅ Agendamento confirmado!
    
    ✂️ Serviço: Corte de Cabelo
    👤 Profissional: Carlos
    📅 Data: sexta-feira, 19 de junho
    🕐 Horário: 14:00
    💰 Valor: R$ 45,00
```

## 🚀 Deploy na VPS

### Deploy Rápido (5 minutos)

```bash
# 1. Conectar na VPS
ssh usuario@seu-ip-vps

# 2. Atualizar código
cd /caminho/do/projeto
git pull origin main

# 3. Adicionar chave OpenAI no .env
echo 'OPENAI_API_KEY=sk-proj-...' >> .env

# 4. Reiniciar
pm2 restart all

# 5. Testar
node test-ai.js
```

**Veja o guia completo:** [DEPLOY-VPS.md](./DEPLOY-VPS.md)

**Comandos prontos:** [COMANDOS-VPS-RAPIDO.txt](./COMANDOS-VPS-RAPIDO.txt)

## 📊 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/registrar` | Cria barbearia + dono |
| POST | `/api/auth/login` | Login |
| GET | `/api/dashboard` | Métricas |
| GET/POST | `/api/agendamentos` | Listar/criar agendamentos |
| GET/POST | `/api/profissionais` | Profissionais |
| GET/POST | `/api/servicos` | Serviços |
| GET/POST | `/api/clientes` | Clientes |
| GET/POST | `/api/publico/:slug/agendar` | Agendamento público |
| PUT | `/api/whatsapp/config` | Configurar WhatsApp |
| **GET** | **`/api/ai/conversas`** | 🤖 **Listar conversas IA** |
| **POST** | **`/api/ai/responder`** | 🤖 **Enviar mensagem via IA** |

## 🤝 Contribuindo

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT.

## 🆘 Suporte

**Problemas com o Agente IA?**
- Veja: [AGENTE-IA.md](./AGENTE-IA.md) → Seção "Debugging"
- Execute: `node test-ai.js`
- Verifique logs: `pm2 logs` ou `docker-compose logs -f app`

**Deploy com problemas?**
- Guia completo: [DEPLOY-VPS.md](./DEPLOY-VPS.md)
- Comandos rápidos: [COMANDOS-VPS-RAPIDO.txt](./COMANDOS-VPS-RAPIDO.txt)

## ⭐ Features em Destaque

- ✅ **Multi-tenant** completo com isolamento de dados
- ✅ **Agente IA 24/7** com OpenAI GPT-4o-mini
- ✅ **WhatsApp integrado** via Baileys (sem custos de API)
- ✅ **9 ferramentas automáticas** para gestão completa
- ✅ **Histórico de conversas** persistente
- ✅ **Respostas humanizadas** com contexto
- ✅ **Personalização total** via prompts
- ✅ **Sistema de comandas** digital
- ✅ **Controle financeiro** completo
- ✅ **Gestão de comissões** automatizada
- ✅ **Dashboard em tempo real**
- ✅ **Mobile-first** responsivo

---

**Desenvolvido com ❤️ para barbearias modernas** 💈🤖
