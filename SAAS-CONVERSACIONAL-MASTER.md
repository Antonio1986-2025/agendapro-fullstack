# 🚀 SAAS Conversacional - Master Template

**Arquivo de consulta para criar SaaS multi-tenant com Agente IA via WhatsApp**

> Documentação completa baseada em projeto real em produção (AgendaPro - Barbearia).
> Use este arquivo como referência para criar sistemas similares em outros nichos.

---

## 📚 Índice

### **Parte 1 — Fundamentos**
1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Multi-Tenancy (SaaS)](#3-multi-tenancy-saas)
4. [Banco de Dados (Schema Base)](#4-banco-de-dados-schema-base)

### **Parte 2 — Agente Conversacional**
5. [Slot Filling Pattern](#5-slot-filling-pattern)
6. [Tools do Agente](#6-tools-do-agente)
7. [System Prompt Dinâmico](#7-system-prompt-dinâmico)
8. [Integração WhatsApp via Evolution API](#8-integração-whatsapp-via-evolution-api)

### **Parte 3 — Nichos Específicos**
9. [💈 Barbearia](#9-barbearia)
10. [💅 Salão de Beleza](#10-salão-de-beleza)
11. [🏥 Clínica Médica](#11-clínica-médica)
12. [⚖️ Advocacia](#12-advocacia)
13. [👕 Loja de Roupas](#13-loja-de-roupas)
14. [🍕 Restaurante/Delivery](#14-restaurante-delivery)
15. [🏠 Imobiliária](#15-imobiliária)
16. [💪 Academia/Personal](#16-academia-personal)

### **Parte 4 — Operacional**
17. [Deploy (EasyPanel)](#17-deploy-easypanel)
18. [Lições Aprendidas](#18-lições-aprendidas)
19. [Checklist de Implementação](#19-checklist-de-implementação)
20. [Troubleshooting](#20-troubleshooting)

---

# PARTE 1 — FUNDAMENTOS

## 1. Visão Geral da Arquitetura

### 🎯 O Que É Esse Sistema?

Um SaaS conversacional **multi-tenant** que permite que **múltiplos negócios** (do mesmo nicho) usem o sistema, cada um com:
- ✅ Seus próprios dados isolados
- ✅ Sua própria conta WhatsApp
- ✅ Seu próprio agente IA
- ✅ Seu painel de gestão

O **agente IA atende clientes via WhatsApp 24/7**, executando ações reais no banco de dados (criar agendamentos, fazer pedidos, responder dúvidas).

### 🏗️ Diagrama de Alto Nível

```
┌─────────────────────────────────────────────────────┐
│         CLIENTES FINAIS (consumidores)              │
│  • Marcam agendamentos via WhatsApp                 │
│  • Fazem pedidos                                    │
│  • Tiram dúvidas                                    │
└─────────────────────┬───────────────────────────────┘
                      │ WhatsApp
                      ▼
┌─────────────────────────────────────────────────────┐
│           EVOLUTION API (Servidor WhatsApp)         │
│  • Cada negócio = 1 instância isolada               │
│  • Webhook → seu sistema                            │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP POST (webhook)
                      ▼
┌─────────────────────────────────────────────────────┐
│              SEU SISTEMA SAAS (Node.js)             │
│  ┌─────────────────────────────────────────┐        │
│  │  Webhook Handler                        │        │
│  │  ↓                                      │        │
│  │  Workflow State (Slot Filling)          │        │
│  │  ↓                                      │        │
│  │  Agente IA (OpenAI Function Calling)    │        │
│  │  ↓                                      │        │
│  │  Tools (CRUD na base)                   │        │
│  │  ↓                                      │        │
│  │  Resposta → Evolution → Cliente         │        │
│  └─────────────────────────────────────────┘        │
└─────────────────────┬───────────────────────────────┘
                      │ SQL
                      ▼
┌─────────────────────────────────────────────────────┐
│           POSTGRESQL (Supabase)                     │
│  • Multi-tenant: tenant_id em todas as queries      │
│  • Estado da conversa em JSONB                      │
│  • Idempotência via campo de controle               │
└─────────────────────────────────────────────────────┘
                      ▲
                      │
┌─────────────────────┴───────────────────────────────┐
│           DONO DO NEGÓCIO (admin)                   │
│  • Painel web (Express + HTML/JS)                   │
│  • Cadastra serviços, profissionais, etc.           │
│  • Vê agendamentos, comandas, financeiro            │
└─────────────────────────────────────────────────────┘
```

### 🎯 Camadas de Resiliência

```
1. Webhook detecta connection.update("close") → reconecta em 30s
2. Scheduler verifica todas instâncias a cada 5 min → reconecta offline
3. Boot do servidor → reconecta todas instâncias (5s após start)
4. Endpoint manual /api/whatsapp/reconectar → forçar reconexão
```

---

## 2. Stack Tecnológico

### 🛠️ Stack Recomendado (testado em produção)

```yaml
Backend:
  - Node.js 20+
  - Express 4.x
  - PostgreSQL 16 (via Supabase ou self-hosted)
  - OpenAI GPT-4o-mini (function calling)

Integração WhatsApp:
  - Evolution API v2.x (Docker)
  - Multi-instância (1 por tenant)

Frontend:
  - HTML/CSS/JS puro (mobile-first)
  - Sem framework pesado (mais simples = menos bugs)

Deploy:
  - EasyPanel (recomendado) ou Coolify
  - Docker para Evolution API
  - GitHub Actions para CI/CD

Outros:
  - JWT para autenticação
  - bcrypt para senhas
  - axios para HTTP calls
```

### 📦 package.json Base

```json
{
  "name": "saas-conversacional",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js",
    "migrate": "node server/db/migrate.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.108.2",
    "axios": "^1.6.2",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-async-errors": "^3.1.1",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "openai": "^6.x",
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### 🔑 .env Base

```env
# Banco de dados
DATABASE_URL=postgresql://user:pass@host:5432/db
DB_SSL=true

# Servidor
PORT=3000
NODE_ENV=production
TZ=America/Sao_Paulo
AUTO_MIGRATE=true

# Autenticação
JWT_SECRET=seu-secret-aleatorio-grande
JWT_EXPIRATION=7d

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Evolution API
EVOLUTION_API_URL=https://evolution.seu-dominio.com
EVOLUTION_API_KEY=chave-global-evolution
SISTEMA_URL=https://seu-saas.com

# Admin
ADMIN_KEY=chave-para-rotas-admin
```

### 🗂️ Estrutura de Pastas

```
projeto/
├── server/
│   ├── server.js                  # Entry point
│   ├── config/
│   │   ├── database.js            # Pool postgres
│   │   └── supabase.js            # Cliente supabase
│   ├── db/
│   │   ├── schema.sql             # Schema completo
│   │   ├── migrate.js             # Aplicador de migrations
│   │   └── seed.js                # Dados iniciais
│   ├── middleware/
│   │   └── auth.js                # JWT auth
│   ├── routes/
│   │   ├── auth.js                # Login/registro
│   │   ├── admin.js               # Rotas admin (reset, etc.)
│   │   ├── whatsapp.js            # Webhooks + config
│   │   └── [recurso].js           # Por recurso do nicho
│   └── services/
│       ├── ai.js                  # Agente IA principal
│       ├── workflow-state.js      # Slot Filling (estado)
│       ├── evolution-provider.js  # Evolution API client
│       ├── scheduler.js           # Cron jobs (reconexão, lembretes)
│       └── whatsapp.js            # Helper de envio
├── public/
│   ├── index.html                 # Landing/Dashboard
│   ├── login.html
│   └── [paginas].html
├── .env
├── .env.example
├── package.json
├── docker-compose.yml             # (opcional, para dev local)
└── README.md
```

---

## 3. Multi-Tenancy (SaaS)

### 🎯 Conceito

**Multi-tenancy** = vários clientes (tenants) usam a mesma aplicação, mas cada um vê apenas seus próprios dados.

### 📐 Padrão Adotado: **Shared Database, Shared Schema**

Todas as tabelas têm uma coluna `tenant_id` (no nosso caso: `barbearia_id`, `escritorio_id`, `clinica_id`, `loja_id`, etc.).

**Vantagens:**
- ✅ 1 só banco de dados (econômico)
- ✅ Migrations aplicam para todos
- ✅ Backup centralizado

**Cuidados:**
- ⚠️ TODAS as queries DEVEM filtrar por tenant_id
- ⚠️ Indexes em tenant_id para performance
- ⚠️ Validação rigorosa no código

### 🔒 Padrão de Tabela Multi-Tenant

```sql
-- Toda tabela de domínio tem essa estrutura:
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- TENANT_ID OBRIGATÓRIO (nome varia por nicho)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Campos do recurso
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(30) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- ÍNDICE em tenant_id é OBRIGATÓRIO
    UNIQUE (tenant_id, telefone)
);

CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
```

### 🔍 Padrão de Query Segura

```javascript
// ❌ ERRADO (vulnerável - retorna dados de outros tenants):
const { rows } = await query('SELECT * FROM clientes WHERE telefone = $1', [tel]);

// ✅ CORRETO (sempre filtra por tenant):
const { rows } = await query(
  'SELECT * FROM clientes WHERE tenant_id = $1 AND telefone = $2',
  [tenantId, tel]
);
```

### 🏗️ Como o Tenant É Identificado

#### **Para Webhooks (cliente final via WhatsApp):**
URL contém o tenant_id:
```
POST /api/whatsapp/webhook/evolution/:tenantId
```

#### **Para Rotas Autenticadas (dono do negócio):**
JWT contém `tenant_id`:
```javascript
// middleware/auth.js
export function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  req.tenantId = decoded.tenant_id;  // Disponível em todas as rotas
  next();
}
```

### 🎯 Cadastro Automático de Tenant

Quando um novo dono se cadastra:

```javascript
// routes/auth.js
router.post('/registrar', async (req, res) => {
  const { nomeNegocio, nome, email, senha } = req.body;
  
  await conn.query('BEGIN');
  
  // 1. Cria tenant
  const tenant = await conn.query(
    `INSERT INTO tenants (nome, slug, email) VALUES ($1, $2, $3) RETURNING id`,
    [nomeNegocio, slugify(nomeNegocio), email]
  );
  const tenantId = tenant.rows[0].id;
  
  // 2. Cria usuário owner
  const senhaHash = await bcrypt.hash(senha, 10);
  await conn.query(
    `INSERT INTO usuarios (tenant_id, nome, email, senha_hash, role)
     VALUES ($1, $2, $3, $4, 'owner')`,
    [tenantId, nome, email, senhaHash]
  );
  
  // 3. Cria configuração WhatsApp
  await conn.query(
    `INSERT INTO whatsapp_config (tenant_id, provider) VALUES ($1, 'evolution')`,
    [tenantId]
  );
  
  await conn.query('COMMIT');
  
  // 4. AUTOMATICAMENTE: Cria instância Evolution API
  if (process.env.EVOLUTION_API_URL) {
    try {
      const { criarInstancia } = await import('../services/evolution-provider.js');
      await criarInstancia(tenantId);
    } catch (err) {
      console.warn('Falha ao criar instância (cadastro continua):', err.message);
    }
  }
  
  // 5. Retorna token JWT
  const token = gerarToken({ id: usuarioId, tenant_id: tenantId });
  res.json({ token, tenant });
});
```

---

## 4. Banco de Dados (Schema Base)

### 📊 Tabelas Universais (todos os nichos)

```sql
-- ============================================================
-- TENANT: o negócio em si
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    telefone VARCHAR(30),
    email VARCHAR(255),
    endereco TEXT,
    plano VARCHAR(50) DEFAULT 'free',
    config JSONB DEFAULT '{}',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USUARIOS: pessoas que fazem login no painel
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'owner',  -- owner | admin | staff
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_usuarios_tenant ON usuarios(tenant_id);

-- ============================================================
-- CLIENTES: consumidores finais (quem usa o WhatsApp)
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    observacoes TEXT,
    total_visitas INTEGER DEFAULT 0,
    ultimo_atendimento TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, telefone)
);
CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);

-- ============================================================
-- WHATSAPP_CONFIG: configuração da integração por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_config (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(30) DEFAULT 'evolution',
    enabled BOOLEAN DEFAULT false,
    
    -- Evolution API
    evolution_instance_name VARCHAR(120),
    evolution_api_key VARCHAR(255),
    evolution_phone VARCHAR(30),
    
    session_status VARCHAR(30) DEFAULT 'disconnected',
    
    -- Agente IA
    ai_enabled BOOLEAN DEFAULT false,
    ai_prompt TEXT,
    
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- WHATSAPP_MENSAGENS: log de mensagens (auditoria)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    referencia_id UUID,  -- agendamento/pedido/etc relacionado
    telefone VARCHAR(30) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo VARCHAR(30) DEFAULT 'manual',
    -- tipos: recebida | ia_resposta | confirmacao | lembrete | retorno | manual
    status VARCHAR(30) DEFAULT 'enviada',
    -- status: enviada | erro | recebida
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_wa_msg_tenant ON whatsapp_mensagens(tenant_id);

-- ============================================================
-- AI_CONVERSAS: estado da conversa por cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cliente_telefone VARCHAR(30) NOT NULL,
    
    -- Histórico de mensagens (session state)
    historico JSONB DEFAULT '[]',
    
    -- Estado do fluxo (workflow state - SLOT FILLING)
    contexto JSONB DEFAULT '{}',
    
    ultima_interacao TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, cliente_telefone)
);
CREATE INDEX idx_ai_conversas_tenant ON ai_conversas(tenant_id);

-- ============================================================
-- (Tabelas específicas do nicho vêm aqui)
-- Veja a Parte 3 para schemas por nicho
-- ============================================================
```

### 🎯 Convenções Importantes

#### **1. UUIDs em todas as PKs**
- Mais seguro (não enumeráveis)
- Gerados pelo banco (`gen_random_uuid()`)
- Facilita migração e debug

#### **2. `tenant_id` é a primeira FK**
- Sempre logo após o `id`
- ON DELETE CASCADE (deletou tenant, deleta tudo dele)

#### **3. Indexes obrigatórios**
- Em todo `tenant_id`
- Em campos de busca frequente (telefone, data_hora)

#### **4. Soft delete vs Hard delete**
- Use `ativo BOOLEAN DEFAULT true` para soft delete
- Hard delete só via cascade do tenant

#### **5. Timestamps**
- `created_at` em tudo
- `updated_at` em tabelas mutáveis
- TIMESTAMPTZ com `now()` default

#### **6. JSONB para flexibilidade**
- Configurações específicas
- Histórico/contexto do agente
- Metadados que podem variar

### 🚀 Migration Idempotente

```javascript
// server/db/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  
  await pool.query(sql);
  console.log('✅ Migrations aplicadas');
}
```

O `schema.sql` deve ser **100% idempotente** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

---


# PARTE 2 — AGENTE CONVERSACIONAL

## 5. Slot Filling Pattern

### 🎯 Conceito

**Slot Filling** = padrão onde o agente coleta informações em "slots" estruturados, com validação rigorosa antes de cada operação final.

**Por que usar:**
- ✅ À prova de alucinação (estado é JSON, não memória do LLM)
- ✅ À prova de duplicação (idempotência)
- ✅ Sobrevive a restarts (estado em postgres)
- ✅ Validação garantida em cada slot
- ✅ Permite alterações ("ah, na verdade quero corte feminino")
- ✅ Permite desistência

**Inspirado em:**
- Google Dialogflow CX (Slot Filling Pattern)
- LangGraph (state persistence)
- OpenAI Cookbook (function calling)

### 📐 Estrutura do Estado

```javascript
{
  "fluxo_ativo": "agendamento" | "pedido" | "consulta" | null,
  "iniciado_em": "2026-06-22T17:00:00Z",
  
  "slots": {
    // Cada slot tem essa estrutura:
    "nome_do_slot": {
      "preenchido": true | false,
      "valor": { ... }   // null se não preenchido
    }
  },
  
  // Idempotência: protege contra duplicação
  "operacao_criada_id": null,
  "operacao_criada_em": null,
  
  "ultima_atualizacao": "2026-06-22T17:05:00Z"
}
```

### 🛠️ Implementação Completa

```javascript
// server/services/workflow-state.js

import { query } from '../config/database.js';

/**
 * Define os slots do fluxo (CUSTOMIZE POR NICHO!)
 */
function criarEstadoInicial() {
  return {
    fluxo_ativo: null,
    iniciado_em: null,
    slots: {
      // Slots universais (presentes em quase todos nichos):
      cliente: { preenchido: false, valor: null },
      
      // Slots específicos (varia por nicho):
      // Para AGENDAMENTO:
      servico: { preenchido: false, valor: null },
      profissional: { preenchido: false, valor: null },
      para_quem: { preenchido: false, valor: null },
      data: { preenchido: false, valor: null },
      horario: { preenchido: false, valor: null },
    },
    operacao_criada_id: null,
    operacao_criada_em: null,
    ultima_atualizacao: null,
  };
}

/**
 * Ordem dos slots para o fluxo principal.
 * O sistema valida nessa ordem.
 */
const ORDEM_SLOTS = [
  'cliente',
  'servico',
  'profissional',
  'para_quem',
  'data',
  'horario',
];

// ============================================================
// PERSISTÊNCIA
// ============================================================

export async function carregarEstado(tenantId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  
  try {
    const { rows } = await query(
      `SELECT contexto FROM ai_conversas 
        WHERE tenant_id = $1 AND cliente_telefone = $2`,
      [tenantId, tel]
    );
    
    if (!rows[0]?.contexto) {
      return criarEstadoInicial();
    }
    
    const salvo = typeof rows[0].contexto === 'string' 
      ? JSON.parse(rows[0].contexto) 
      : rows[0].contexto;
    
    const inicial = criarEstadoInicial();
    return {
      ...inicial,
      ...salvo,
      slots: { ...inicial.slots, ...(salvo.slots || {}) },
    };
  } catch (err) {
    console.error('❌ Erro ao carregar estado:', err.message);
    return criarEstadoInicial();
  }
}

export async function salvarEstado(tenantId, telefone, estado) {
  const tel = String(telefone || '').replace(/\D/g, '');
  
  const estadoFinal = {
    ...estado,
    ultima_atualizacao: new Date().toISOString(),
  };
  
  await query(
    `INSERT INTO ai_conversas (tenant_id, cliente_telefone, contexto, ultima_interacao)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (tenant_id, cliente_telefone) DO UPDATE SET
        contexto = $3,
        ultima_interacao = now()`,
    [tenantId, tel, JSON.stringify(estadoFinal)]
  );
}

// ============================================================
// MANIPULAÇÃO
// ============================================================

export function iniciarFluxo(estado, fluxo, clienteData = null) {
  const novo = criarEstadoInicial();
  novo.fluxo_ativo = fluxo;
  novo.iniciado_em = new Date().toISOString();
  
  if (clienteData) {
    novo.slots.cliente = { preenchido: true, valor: clienteData };
  }
  
  return novo;
}

export function resetarFluxo(estado, operacaoId = null) {
  const novo = criarEstadoInicial();
  
  if (operacaoId) {
    // Mantém ID por 5 minutos para idempotência
    novo.operacao_criada_id = operacaoId;
    novo.operacao_criada_em = new Date().toISOString();
  }
  
  return novo;
}

export function definirSlot(estado, slotName, valor) {
  return {
    ...estado,
    slots: {
      ...estado.slots,
      [slotName]: { preenchido: true, valor },
    },
  };
}

export function limparSlot(estado, slotName) {
  return {
    ...estado,
    slots: {
      ...estado.slots,
      [slotName]: { preenchido: false, valor: null },
    },
  };
}

// ============================================================
// CONSULTAS
// ============================================================

export function checklistCompleto(estado) {
  if (!estado.fluxo_ativo) return false;
  return ORDEM_SLOTS.every(slot => estado.slots[slot]?.preenchido === true);
}

export function proximoSlot(estado) {
  if (!estado.fluxo_ativo) return null;
  for (const slot of ORDEM_SLOTS) {
    if (!estado.slots[slot]?.preenchido) return slot;
  }
  return 'completo';
}

export function temOperacaoRecente(estado, minutos = 5) {
  if (!estado.operacao_criada_id || !estado.operacao_criada_em) return false;
  
  try {
    const criadoEm = new Date(estado.operacao_criada_em).getTime();
    return (Date.now() - criadoEm) < (minutos * 60 * 1000);
  } catch {
    return false;
  }
}

// ============================================================
// FORMATAÇÃO PARA PROMPT
// ============================================================

export function formatarEstadoParaPrompt(estado) {
  if (!estado.fluxo_ativo) {
    return 'NENHUM FLUXO ATIVO. Aguardando intenção do cliente.';
  }
  
  const linhas = [];
  linhas.push(`🔄 FLUXO ATIVO: ${estado.fluxo_ativo.toUpperCase()}`);
  linhas.push('');
  linhas.push('📋 CHECKLIST:');
  
  for (const slotName of ORDEM_SLOTS) {
    const slot = estado.slots[slotName];
    if (slot.preenchido) {
      linhas.push(`✅ ${slotName}: ${formatarValor(slot.valor)}`);
    } else {
      linhas.push(`❌ ${slotName}: ainda não preenchido`);
    }
  }
  
  linhas.push('');
  const prox = proximoSlot(estado);
  linhas.push(`🎯 PRÓXIMO PASSO: ${prox}`);
  
  return linhas.join('\n');
}

function formatarValor(v) {
  if (!v) return 'null';
  if (typeof v === 'string') return v;
  if (v.nome) return `${v.nome}${v.preco ? ' (R$' + v.preco + ')' : ''}`;
  return JSON.stringify(v);
}
```

### 🔒 Garantias do Padrão

| Garantia | Como é alcançada |
|----------|------------------|
| Não duplica | `operacao_criada_id` + janela de 5 min |
| Sobrevive restart | Estado em JSONB no banco |
| Sem alucinação | Estado é dado estruturado, não memória |
| Permite alterar | Tools `definir*` sobrescrevem slots |
| Permite desistir | `cancelarFluxoAtual` reseta |
| Validação rigorosa | Cada tool valida na base antes de marcar ✅ |

---

## 6. Tools do Agente

### 🛠️ Catálogo de Tools (universais + por nicho)

#### **Tools Universais (todo SaaS conversacional precisa):**

```javascript
const toolsUniversais = [
  // ───── INICIAR/CANCELAR FLUXO ─────
  {
    name: 'iniciarFluxo',
    description: 'Inicia um novo fluxo (agendamento/pedido/consulta). Reseta estado anterior.',
    parameters: { /* ... */ }
  },
  {
    name: 'cancelarFluxoAtual',
    description: 'Cancela fluxo em andamento. Use se cliente desistir.',
    parameters: {}
  },
  
  // ───── CLIENTE ─────
  {
    name: 'cadastrarClientePrincipal',
    description: 'Cadastra o cliente que está conversando.',
    parameters: {
      nome: { type: 'string', required: true }
    }
  },
  
  // ───── DEFINIR SLOTS (varia por nicho) ─────
  // Cada slot do fluxo tem uma tool definirX
  
  // ───── FINALIZAR ─────
  {
    name: 'finalizarOperacao',
    description: 'Finaliza e cria a operação na base. SÓ funciona se checklist 100%.',
    parameters: {}
  },
  
  // ───── QUERIES (não modificam estado) ─────
  {
    name: 'listarOpcoes',  // listarServicos, listarProdutos, etc.
    description: 'Lista opções disponíveis para o cliente escolher.',
    parameters: {}
  },
  {
    name: 'consultarInformacoesNegocio',
    description: 'Retorna info do negócio (endereço, horário, contato).',
    parameters: {}
  },
];
```

#### **Estrutura de Uma Tool (template)**

```javascript
case 'definirServico': {
  // 1. Valida fluxo ativo
  if (estado.fluxo_ativo !== 'agendamento') {
    return { resultado: { erro: 'Inicie o fluxo primeiro.' } };
  }
  
  // 2. Resolve input (aceita UUID, nome ou número de menu)
  const servico = await resolverServico(tenantId, args.servico);
  if (!servico) {
    return {
      resultado: {
        erro: `Serviço "${args.servico}" não encontrado.`,
        dica: 'Use listarServicos para ver opções.',
      },
    };
  }
  
  // 3. Atualiza slot
  const novoEstado = ws.definirSlot(estado, 'servico', {
    id: servico.id,
    nome: servico.nome,
    preco: parseFloat(servico.preco),
    duracao: servico.duracao_minutos,
  });
  
  // 4. Log
  console.log(`   ✅ Serviço definido: ${servico.nome}`);
  
  // 5. Retorna sucesso
  return {
    resultado: {
      sucesso: true,
      servico: { nome: servico.nome, preco: parseFloat(servico.preco) },
      mensagem: `Serviço "${servico.nome}" registrado.`,
    },
    novoEstado,
  };
}
```

### 🔍 Resolução Inteligente de IDs

**Tool aceita UUID, nome ou número de menu:**

```javascript
async function resolverServico(tenantId, valor) {
  if (!valor) return null;
  const valorStr = String(valor).trim();
  
  // 1. UUID válido?
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valorStr)) {
    const { rows } = await query(
      `SELECT * FROM servicos WHERE id = $1 AND tenant_id = $2 AND ativo = true`,
      [valorStr, tenantId]
    );
    return rows[0] || null;
  }
  
  // 2. Lista todos para outros casos
  const { rows: lista } = await query(
    `SELECT * FROM servicos WHERE tenant_id = $1 AND ativo = true ORDER BY nome`,
    [tenantId]
  );
  
  // 3. Número de posição (cliente disse "1", "2", etc.)
  if (/^\d+$/.test(valorStr)) {
    const idx = parseInt(valorStr, 10) - 1;
    if (idx >= 0 && idx < lista.length) return lista[idx];
  }
  
  // 4. Nome (match exato → parcial → palavra-chave)
  const valorLower = valorStr.toLowerCase();
  
  const exato = lista.find(s => s.nome.toLowerCase() === valorLower);
  if (exato) return exato;
  
  const parcial = lista.find(s => s.nome.toLowerCase().includes(valorLower));
  if (parcial) return parcial;
  
  const palavras = valorLower.split(/\s+/).filter(p => p.length > 2);
  for (const p of palavras) {
    const m = lista.find(s => s.nome.toLowerCase().includes(p));
    if (m) return m;
  }
  
  return null;
}
```

### 🛡️ Idempotência (não duplica operação)

```javascript
case 'finalizarOperacao': {
  // VERIFICA: já foi criado recentemente?
  if (ws.temOperacaoRecente(estado, 5)) {
    const { rows } = await query(
      `SELECT * FROM operacoes WHERE id = $1`,
      [estado.operacao_criada_id]
    );
    if (rows[0]) {
      return {
        resultado: {
          ja_criado: true,
          operacao: rows[0],
          mensagem: 'Operação JÁ CRIADA há poucos minutos. Não duplicar.',
        },
      };
    }
  }
  
  // VERIFICA: checklist 100%?
  if (!ws.checklistCompleto(estado)) {
    return { resultado: { erro: 'Checklist incompleto.' } };
  }
  
  // CRIA a operação
  const { rows } = await query(/* INSERT ... */);
  
  // RESETA o estado (mantém ID por 5 min para idempotência)
  const novoEstado = ws.resetarFluxo(estado, rows[0].id);
  
  return { resultado: { sucesso: true, ... }, novoEstado };
}
```

### 🚦 Loop de Iteração

```javascript
let iteracao = 0;
const MAX_ITERACOES = 6;
const ultimasTools = [];

while (iteracao < MAX_ITERACOES) {
  iteracao++;
  
  const resp = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
    temperature: 0.4,
    max_tokens: 600,
  });
  
  const msg = resp.choices[0].message;
  
  // Sem tools = resposta final
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    await ws.salvarEstado(tenantId, telefone, ctx.estado);
    return { resposta: msg.content, toolsExecutados };
  }
  
  // Detecta loop: mesma tool 2x seguidas
  const toolsAtuais = msg.tool_calls.map(tc => tc.function.name).join(',');
  ultimasTools.push(toolsAtuais);
  if (ultimasTools.length >= 2 && 
      ultimasTools.at(-1) === ultimasTools.at(-2)) {
    console.warn('⚠️  Loop detectado!');
    return { resposta: 'Pode reformular?', toolsExecutados };
  }
  
  // Executa tools
  const toolResults = [];
  for (const tc of msg.tool_calls) {
    const args = JSON.parse(tc.function.arguments || '{}');
    const { resultado, novoEstado } = await executarTool(ctx, tc.function.name, args);
    
    if (novoEstado) ctx.estado = novoEstado;
    
    toolResults.push({
      tool_call_id: tc.id,
      name: tc.function.name,
      args,
      resultado,
    });
  }
  
  // Reconstrói prompt com NOVO estado
  const novoSystemPrompt = montarSystemPrompt(/* ... */, ctx.estado);
  
  messages = [
    { role: 'system', content: novoSystemPrompt },
    ...historicoLimitado,
    { role: 'user', content: mensagemCliente },
    msg,
    ...toolResults.map(tr => ({
      role: 'tool',
      tool_call_id: tr.tool_call_id,
      content: JSON.stringify(tr.resultado),
    })),
  ];
}

// Limite atingido - força resposta sem tools
const final = await ai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [...messages, { 
    role: 'system', 
    content: 'Não chame mais tools. Responda diretamente.' 
  }],
  temperature: 0.3,
  max_tokens: 400,
});
return { resposta: final.choices[0].message.content, toolsExecutados };
```

---

## 7. System Prompt Dinâmico

### 🎯 Conceito

O system prompt é **regenerado a cada turno** com o estado atual. Assim o modelo sempre sabe onde está, sem depender de "memória".

### 📐 Template Universal

```javascript
function montarSystemPrompt(negocioNome, telefoneCliente, estado, promptPersonalizado) {
  const dataFmt = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' 
  });
  const horaFmt = new Date().toLocaleTimeString('pt-BR', { 
    hour: '2-digit', minute: '2-digit' 
  });
  
  const estadoTexto = ws.formatarEstadoParaPrompt(estado);
  
  return `[v1.0] Você é o atendente virtual do(a) "${negocioNome}".

━━━━━━━━━━━━━━━━━━━━━━━━
📞 CLIENTE ATUAL
━━━━━━━━━━━━━━━━━━━━━━━━
Telefone: ${telefoneCliente}
(SEMPRE use este telefone, nunca peça outro)

━━━━━━━━━━━━━━━━━━━━━━━━
${estadoTexto}
━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ESTILO DE COMUNICAÇÃO:

Você é uma pessoa atendendo no WhatsApp. Natural, simpático, direto.
NEM ROBÔ FRIO, NEM ENCHEDOR DE LINGUIÇA.

REGRAS:
- Use 1 emoji por mensagem (no máximo 2)
- Sem markdown (sem **bold**, sem títulos)
- Listas: "1. Nome - R$preço" (uma por linha)
- Acolhedor sem ser empolgado em excesso

EXEMPLOS:
✅ "Boa tarde! Como posso te ajudar?"
✅ "Claro! Pra começar, qual seu nome completo?"
✅ "Beleza! Pra qual dia? Hoje, amanhã ou outro dia?"
✅ "Confere:\n[Item] - R$[preço]\n[Detalhes]\nPosso confirmar?"

❌ "Olá! Que prazer falar com você! Como posso ajudar hoje? 😊✨"
❌ "Qual seu nome?" (muito seco)
❌ "**Cliente:** João\n**Serviço:** ..." (sem markdown)

🛠️ COMO TRABALHAR:

O sistema possui um CHECKLIST INTERNO que controla o fluxo.
Use TOOLS para preenchê-lo.

REGRAS DE OURO:
1. Cliente quer iniciar fluxo? → Chame iniciarFluxo PRIMEIRO.
2. Cliente novo? → Peça nome e use cadastrarClientePrincipal.
3. Use as tools "definir*" para registrar cada decisão.
4. NÃO pergunte sobre slots já preenchidos (✅).
5. Para FINALIZAR, todos os slots devem estar ✅.
6. Se cliente quiser MUDAR algo, use a tool definir* novamente.
7. Se desistir, use cancelarFluxoAtual.
8. NÃO chame a mesma tool 2x seguidas.

PERGUNTAS FORA DO CONTEXTO:
- Cliente pode perguntar preço, endereço, horário a qualquer momento.
- Use tools de query (consultarInformacoesNegocio, listarOpcoes).
- Depois retome o fluxo no slot pendente.

DATA E HORA ATUAIS:
Hoje: ${dataFmt} — ${horaFmt}

${promptPersonalizado || ''}`;
}
```

### 🎨 Personalização por Negócio

Cada negócio pode adicionar instruções extras (no painel):

```
INSTRUÇÕES DA BARBEARIA:
- Atendemos com prioridade clientes VIP
- Não fazemos agendamento aos domingos  
- Aceitamos PIX, dinheiro e cartão
```

Essas são **anexadas** ao prompt base, não substituem.

---

## 8. Integração WhatsApp via Evolution API

### 🎯 Por que Evolution API?

- ✅ Multi-instância nativa (1 por tenant)
- ✅ Não usa API oficial do WhatsApp (não precisa Business)
- ✅ Open source (gratuito)
- ✅ Webhooks robustos
- ✅ Reconexão automática

### 🐳 Setup da Evolution API (Docker)

```yaml
# docker-compose.yml
services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      SERVER_TYPE: http
      SERVER_PORT: 8080
      SERVER_URL: https://evolution.seu-dominio.com
      AUTHENTICATION_API_KEY: SUA_CHAVE_FORTE_AQUI
      DATABASE_ENABLED: true
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://...
      WEBHOOK_EVENTS_QRCODE_UPDATED: true
      WEBHOOK_EVENTS_MESSAGES_UPSERT: true
      WEBHOOK_EVENTS_CONNECTION_UPDATE: true
```

### 📡 Cliente da Evolution API

```javascript
// server/services/evolution-provider.js

import axios from 'axios';
import { query } from '../config/database.js';

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const SISTEMA_URL = process.env.SISTEMA_URL;

function getClient(apiKey = EVOLUTION_API_KEY) {
  return axios.create({
    baseURL: EVOLUTION_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    timeout: 30000,
  });
}

function getInstanceName(tenantId) {
  return `tenant-${tenantId.replace(/-/g, '').substring(0, 16)}`;
}

// ============================================================
// CRIAR INSTÂNCIA (chamado no cadastro do tenant)
// ============================================================

export async function criarInstancia(tenantId) {
  const instanceName = getInstanceName(tenantId);
  const webhookUrl = `${SISTEMA_URL}/api/whatsapp/webhook/evolution/${tenantId}`;
  
  try {
    const client = getClient();
    const response = await client.post('/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      },
    });
    
    const apiKey = response.data.hash?.apikey || response.data.hash || '';
    
    await query(
      `UPDATE whatsapp_config 
          SET evolution_instance_name = $1,
              evolution_api_key = $2,
              session_status = 'created'
        WHERE tenant_id = $3`,
      [instanceName, apiKey, tenantId]
    );
    
    return { instanceName, apiKey };
  } catch (err) {
    console.error('❌ Erro ao criar instância:', err.response?.data || err.message);
    throw err;
  }
}

// ============================================================
// CONECTAR (gera QR Code)
// ============================================================

export async function conectarInstancia(tenantId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE tenant_id = $1`,
    [tenantId]
  );
  
  let { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0] || {};
  
  if (!instanceName) {
    const nova = await criarInstancia(tenantId);
    instanceName = nova.instanceName;
    apiKey = nova.apiKey;
  }
  
  const client = getClient(apiKey);
  const response = await client.get(`/instance/connect/${instanceName}`);
  
  return {
    qr: response.data.base64 || response.data.code,
    status: 'connecting',
    instanceName,
  };
}

// ============================================================
// ENVIAR MENSAGEM
// ============================================================

export async function enviarMensagemEvolution(tenantId, telefone, texto) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE tenant_id = $1`,
    [tenantId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    throw new Error('Instância não configurada');
  }
  
  const numero = telefone.replace(/\D/g, '').replace(/^@.*/, '');
  
  const client = getClient(rows[0].evolution_api_key);
  await client.post(`/message/sendText/${rows[0].evolution_instance_name}`, {
    number: numero,
    text: texto,
  });
}

// ============================================================
// RECONEXÃO AUTOMÁTICA
// ============================================================

export async function reconectarInstanciaSilencioso(tenantId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE tenant_id = $1`,
    [tenantId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    return { ok: false, motivo: 'sem_instancia' };
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0];
  
  try {
    const client = getClient(apiKey);
    
    // Verifica estado
    const status = await client.get(`/instance/connectionState/${instanceName}`);
    const state = status.data?.instance?.state;
    
    if (state === 'open') {
      return { ok: true, status: 'connected', motivo: 'ja_conectado' };
    }
    
    // Tenta conectar
    await client.get(`/instance/connect/${instanceName}`);
    await new Promise(r => setTimeout(r, 3000));
    
    const novoStatus = await client.get(`/instance/connectionState/${instanceName}`);
    const novoState = novoStatus.data?.instance?.state;
    
    if (novoState === 'open') {
      await query(
        `UPDATE whatsapp_config SET session_status = 'connected' WHERE tenant_id = $1`,
        [tenantId]
      );
      return { ok: true, status: 'connected' };
    }
    
    return { ok: false, status: novoState, motivo: 'precisa_qr_novo' };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}
```

### 📥 Webhook Handler

```javascript
// server/routes/whatsapp.js

router.post('/webhook/evolution/:tenantId', async (req, res) => {
  // Responde imediatamente (evita timeout)
  res.sendStatus(200);
  
  try {
    const { tenantId } = req.params;
    const { event, data } = req.body;
    
    console.log(`📥 WEBHOOK ${event} | tenant: ${tenantId}`);
    
    // Connection update
    if (event === 'connection.update') {
      const state = data?.state;
      
      let dbStatus = 'disconnected';
      if (state === 'open') dbStatus = 'connected';
      else if (state === 'connecting') dbStatus = 'connecting';
      
      await query(
        `UPDATE whatsapp_config SET session_status = $1 WHERE tenant_id = $2`,
        [dbStatus, tenantId]
      );
      
      // Reconecta automaticamente se cair
      if (state === 'close') {
        setTimeout(async () => {
          const { reconectarInstanciaSilencioso } = await import('../services/evolution-provider.js');
          await reconectarInstanciaSilencioso(tenantId);
        }, 30000);
      }
      return;
    }
    
    // Mensagem recebida
    if (event === 'messages.upsert') {
      const key = data.key || {};
      const message = data.message || {};
      
      // Filtros
      if (key.fromMe) return;
      if (key.remoteJid?.includes('@g.us')) return;  // grupo
      if (key.remoteJid?.includes('@broadcast')) return;
      
      const texto = message.conversation 
                 || message.extendedTextMessage?.text 
                 || message.imageMessage?.caption 
                 || '';
      if (!texto) return;
      
      const telefone = (key.remoteJid || '').split('@')[0].replace(/\D/g, '');
      if (!telefone || telefone.length < 10) return;
      
      // Processa com agente IA
      await processarMensagemRecebida(tenantId, telefone, texto);
    }
  } catch (err) {
    console.error('❌ Erro webhook:', err.message);
  }
});

async function processarMensagemRecebida(tenantId, telefone, mensagem) {
  // 1. Busca config + IA habilitada?
  const cfg = await query(
    `SELECT ai_enabled, ai_prompt, (SELECT nome FROM tenants WHERE id = $1) AS nome
       FROM whatsapp_config WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!cfg.rows[0]?.ai_enabled) return;
  
  // 2. Salva mensagem recebida
  await query(
    `INSERT INTO whatsapp_mensagens (tenant_id, telefone, mensagem, tipo, status)
     VALUES ($1, $2, $3, 'recebida', 'recebida')`,
    [tenantId, telefone, mensagem]
  );
  
  // 3. Histórico curto (8 mensagens)
  const conversa = await getConversa(tenantId, telefone);
  const historico = (conversa?.historico || []).slice(-8);
  
  // 4. Processa com IA
  const { resposta } = await processarMensagem(
    tenantId, cfg.rows[0].nome, mensagem, historico, cfg.rows[0].ai_prompt, telefone
  );
  
  // 5. Envia resposta
  if (resposta) {
    await enviarMensagemEvolution(tenantId, telefone, resposta);
    await query(
      `INSERT INTO whatsapp_mensagens (tenant_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'ia_resposta', 'enviada')`,
      [tenantId, telefone, resposta]
    );
  }
  
  // 6. Salva histórico
  const novoHistorico = [
    ...historico,
    { role: 'user', content: mensagem },
    { role: 'assistant', content: resposta || '' },
  ];
  await salvarConversa(tenantId, telefone, novoHistorico);
}
```

---


# 📚 PARTE 3 — IMPLEMENTAÇÕES POR NICHO

A Parte 3 mostra como adaptar o framework genérico (multi-tenant + Slot Filling + Evolution API) para 8 nichos diferentes. Cada capítulo é **autocontido**: schema SQL, tools, system prompt, exemplos de conversa, validações e considerações específicas.

> 💡 **Dica:** Comece sempre pelo capítulo do nicho mais próximo e adapte. A base (multi-tenancy, autenticação, webhook) é igual para todos.

---

## 💈 CAPÍTULO 9 — BARBEARIA (REFERÊNCIA BASE)

### 9.1 Visão Geral do Negócio

**Operação:**
- Cliente agenda corte/barba via WhatsApp
- Atendimento por barbeiro (profissional)
- Duração média: 30-60 min por serviço
- Pagamento no local (dinheiro, PIX, cartão)
- Comissão por barbeiro

**Volume típico:**
- 10-30 atendimentos/dia
- 3-5 barbeiros ativos
- 50-200 clientes cadastrados

**Particularidades:**
- Cliente fiel volta a cada 15-30 dias
- Horários muito procurados: 17h-20h (fim de tarde)
- Sábado é dia de pico
- Pode atender com hora marcada ou ordem de chegada

### 9.2 Schema SQL Completo

```sql
-- Profissionais (barbeiros)
CREATE TABLE profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  especialidade TEXT,                    -- "Cortes masculinos", "Barba", etc
  comissao_percentual NUMERIC(5,2) DEFAULT 50,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Serviços
CREATE TABLE servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Corte Masculino", "Corte e Barba"
  duracao_minutos INTEGER NOT NULL,      -- 30, 45, 60
  preco NUMERIC(10,2) NOT NULL,
  categoria TEXT,                        -- "corte", "barba", "combo"
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profissionais x Serviços (quem faz o quê)
CREATE TABLE profissional_servicos (
  profissional_id UUID REFERENCES profissionais(id) ON DELETE CASCADE,
  servico_id UUID REFERENCES servicos(id) ON DELETE CASCADE,
  PRIMARY KEY (profissional_id, servico_id)
);

-- Horários de trabalho
CREATE TABLE horarios_trabalho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL,           -- 0=domingo, 6=sábado
  hora_inicio TIME NOT NULL,             -- 09:00
  hora_fim TIME NOT NULL,                -- 19:00
  ativo BOOLEAN DEFAULT TRUE
);

-- Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  data_nascimento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

-- Agendamentos
CREATE TABLE agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  servico_id UUID NOT NULL REFERENCES servicos(id),
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  status TEXT DEFAULT 'agendado',        -- agendado, em_andamento, concluido, cancelado, faltou
  observacoes TEXT,
  
  -- Notificações
  lembrete_enviado_em TIMESTAMPTZ,
  retorno_enviado_em TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agendamentos_data ON agendamentos(tenant_id, data, hora_inicio);
CREATE INDEX idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX idx_agendamentos_profissional ON agendamentos(profissional_id, data);

-- Comandas (para fechamento financeiro)
CREATE TABLE comandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agendamento_id UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  total NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'aberta',          -- aberta, fechada, cancelada
  forma_pagamento TEXT,                  -- dinheiro, pix, cartao_credito, cartao_debito
  observacoes TEXT,
  fechada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comanda_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  servico_id UUID REFERENCES servicos(id),
  produto_id UUID,                        -- se vender produtos
  descricao TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL
);
```

### 9.3 Tools do Agente (15 tools — referência completa)

```javascript
// Slot Filling: ordem fixa de preenchimento
// 1. cliente → 2. servico → 3. profissional → 4. paraQuem → 5. data → 6. horario → 7. confirmacao

const tools = [
  {
    type: 'function',
    function: {
      name: 'iniciarAgendamento',
      description: 'Inicia fluxo de agendamento. Chame UMA VEZ.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrarClientePrincipal',
      description: 'Cadastra cliente novo (telefone do WhatsApp).',
      parameters: {
        type: 'object',
        properties: {
          nomeCompleto: { type: 'string' },
        },
        required: ['nomeCompleto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirParaQuem',
      description: 'Define se agendamento é para o próprio cliente ou outra pessoa.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['proprio_cliente', 'outra_pessoa'] },
          nomePessoa: { type: 'string' },  // só se for outra pessoa
        },
        required: ['tipo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarServicos',
      description: 'Lista serviços. Use categoria para filtrar (ex: "corte").',
      parameters: {
        type: 'object',
        properties: {
          categoria: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirServico',
      description: 'Define serviço escolhido pelo cliente.',
      parameters: {
        type: 'object',
        properties: {
          servicoId: { type: 'string' },
          servicoNome: { type: 'string' },
        },
        required: ['servicoId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarProfissionais',
      description: 'Lista profissionais que fazem o serviço escolhido.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirProfissional',
      description: 'Define profissional escolhido.',
      parameters: {
        type: 'object',
        properties: {
          profissionalId: { type: 'string' },
          profissionalNome: { type: 'string' },
        },
        required: ['profissionalId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirData',
      description: 'Define data (YYYY-MM-DD). Aceita "hoje", "amanhã", "sexta".',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificarHorarioEspecifico',
      description: 'Verifica se UM horário específico está disponível. Se não tiver, retorna 3 sugestões próximas.',
      parameters: {
        type: 'object',
        properties: {
          horario: { type: 'string' },  // "15:00", "15h", "15"
        },
        required: ['horario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirHorario',
      description: 'Define horário final (depois de validado).',
      parameters: {
        type: 'object',
        properties: {
          horario: { type: 'string' },  // HH:MM
        },
        required: ['horario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmarAgendamento',
      description: 'Cria agendamento + comanda. Use APENAS após cliente confirmar resumo.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultarMeusAgendamentos',
      description: 'Lista agendamentos futuros do cliente.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarAgendamento',
      description: 'Cancela um agendamento.',
      parameters: {
        type: 'object',
        properties: {
          agendamentoId: { type: 'string' },
        },
        required: ['agendamentoId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reagendar',
      description: 'Reagenda um agendamento existente para nova data/hora.',
      parameters: {
        type: 'object',
        properties: {
          agendamentoId: { type: 'string' },
          novaData: { type: 'string' },
          novoHorario: { type: 'string' },
        },
        required: ['agendamentoId', 'novaData', 'novoHorario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarFluxoAtual',
      description: 'Cancela o fluxo atual (se cliente desistir).',
      parameters: { type: 'object', properties: {} },
    },
  },
];
```

### 9.4 System Prompt (Barbearia)

```javascript
function montarSystemPrompt({ barbeariaNome, dataAtual, contexto, slotsPendentes, slotsPreenchidos }) {
  return `Você é a recepcionista virtual da ${barbeariaNome}. 
Atende via WhatsApp de forma natural, amigável e CONCISA.

📅 Data hoje: ${dataAtual}

═══════════════════════════════════════════
🎯 SUA MISSÃO
═══════════════════════════════════════════
Agendar cortes/barbas de forma rápida. SEM ENROLAÇÃO.

═══════════════════════════════════════════
✅ ESTILO DE RESPOSTA
═══════════════════════════════════════════
- Use português brasileiro natural
- 1-2 frases por mensagem (NUNCA mais que 3)
- Toques permitidos: "Claro", "Beleza", "Show", "Anotado", "Perfeito"
- 1 emoji ocasional (não em toda mensagem)
- Use o nome do cliente quando fizer sentido

❌ PROIBIDO:
- Listas desnecessárias
- Várias perguntas na mesma mensagem
- Saudações repetidas ("Olá!" toda hora)
- Ser robô ("Compreendo perfeitamente sua solicitação")

═══════════════════════════════════════════
📋 CHECKLIST INTERNO (Slot Filling)
═══════════════════════════════════════════
Slots preenchidos: ${JSON.stringify(slotsPreenchidos)}
Próximo a preencher: ${slotsPendentes[0] || 'pronto para confirmar'}

REGRA DE OURO: Pergunte APENAS o próximo slot pendente. NUNCA repita.

═══════════════════════════════════════════
🔄 FLUXO PADRÃO
═══════════════════════════════════════════
1. Cliente menciona "quero cortar cabelo" → \`iniciarAgendamento\`
2. Slot \`cliente\`: pergunta nome (se não cadastrado) → \`cadastrarClientePrincipal\`
3. Slot \`servico\`: liste DIRETO os serviços de corte → cliente escolhe → \`definirServico\`
4. Slot \`profissional\`: liste profissionais → cliente escolhe → \`definirProfissional\`
5. Slot \`paraQuem\`: pergunta se é pra ele ou outro → \`definirParaQuem\`
6. Slot \`data\`: pergunta data → \`definirData\`
7. Slot \`horario\`:
   - Pergunte: "Qual horário fica bom pra você?"
   - Cliente responde "15h" → \`verificarHorarioEspecifico\`
   - Se OK → \`definirHorario\`
   - Se ocupado → mostre as 3 sugestões retornadas → cliente escolhe
8. Mostre resumo → cliente confirma → \`confirmarAgendamento\`

═══════════════════════════════════════════
💬 EXEMPLOS DE RESPOSTA NATURAL
═══════════════════════════════════════════
Cliente: "quero cortar cabelo"
✅ Bom: "Beleza! Pra começar, qual seu nome?"
❌ Ruim: "Olá! Compreendi que você gostaria de agendar um corte. Por favor, informe seu nome completo."

Cliente: "amanhã às 15h"
✅ Bom: "Deixa eu ver... 15h tá livre com o LUIZ ✅. Confirma?"
❌ Ruim: "Verifiquei a disponibilidade do profissional para o horário das 15:00 do dia seguinte e confirmo que está disponível."

═══════════════════════════════════════════
⚠️ NUNCA INVENTE
═══════════════════════════════════════════
- Preços, horários, profissionais, serviços
- Sempre use as TOOLS para buscar informação real
- Se não souber, diga "Vou verificar pra você" e use a tool

CONTEXTO DA CONVERSA:
${JSON.stringify(contexto, null, 2)}`;
}
```

### 9.5 Exemplos de Conversa Real

#### Cenário 1 — Agendamento simples (cliente novo)

```
Cliente: Boa tarde
Agente:  Boa tarde! Como posso ajudar?

Cliente: Quero cortar o cabelo
Agente:  Beleza! Qual seu nome completo?

Cliente: Antonio Rodrigues
Agente:  Anotado, Antonio! Temos esses cortes:
         1. Corte Masculino — R$45
         2. Corte e Barba — R$90
         3. Corte Meia Barba — R$70
         Qual prefere?

Cliente: 1
Agente:  Show. Com qual barbeiro?
         1. JOAO  2. LUIZ  3. MARCOS

Cliente: 2
Agente:  É pra você ou outra pessoa?

Cliente: Pra mim
Agente:  Pra qual data?

Cliente: Amanhã
Agente:  Qual horário fica bom pra você?

Cliente: 15h
Agente:  15h tá livre com o LUIZ ✅
         Confere:
         📋 Corte Masculino — R$45
         👤 Com LUIZ
         📅 Amanhã (23/06) às 15:00
         Confirma?

Cliente: Sim
Agente:  ✅ Agendado! Te esperamos amanhã às 15h.
```

#### Cenário 2 — Horário ocupado, sistema sugere alternativas

```
Cliente: Quero corte amanhã às 17h com Marcos
Agente:  17h não tá livre 😕 
         Tem essas opções com o MARCOS:
         • 16:00 ✅
         • 16:30 ✅
         • 18:00 ✅
         Qual prefere?

Cliente: 16:30
Agente:  Show, 16:30. Confere:
         📋 Corte Masculino — R$45
         👤 Com MARCOS
         📅 Amanhã (23/06) às 16:30
         Confirma?

Cliente: Confirmo
Agente:  ✅ Agendado! Até amanhã às 16:30.
```

#### Cenário 3 — Cancelamento

```
Cliente: Preciso desmarcar
Agente:  Você tem 1 agendamento:
         📅 Amanhã (23/06) 16:30 — Corte Masculino com MARCOS
         Quer cancelar esse?

Cliente: Sim
Agente:  Cancelado ✅ Quando quiser remarcar é só chamar.
```

### 9.6 Validações Específicas

```javascript
// Não permitir agendamento no passado
if (new Date(`${data}T${horario}`) < new Date()) {
  return { erro: 'horario_passado', mensagem: 'Esse horário já passou.' };
}

// Não permitir além de 60 dias
const limiteFuturo = new Date();
limiteFuturo.setDate(limiteFuturo.getDate() + 60);
if (new Date(data) > limiteFuturo) {
  return { erro: 'futuro_distante', mensagem: 'Só agendamos até 60 dias à frente.' };
}

// Verificar se profissional trabalha naquele dia
const diaSemana = new Date(data).getDay();
const { rows: horario } = await query(
  `SELECT 1 FROM horarios_trabalho 
     WHERE profissional_id = $1 AND dia_semana = $2 AND ativo = TRUE`,
  [profissionalId, diaSemana]
);
if (horario.length === 0) {
  return { erro: 'profissional_nao_trabalha', mensagem: 'Esse profissional não trabalha nesse dia.' };
}

// Verificar conflitos
const { rows: conflitos } = await query(
  `SELECT 1 FROM agendamentos 
     WHERE profissional_id = $1 AND data = $2 
       AND status NOT IN ('cancelado', 'faltou')
       AND ($3::time, $4::time) OVERLAPS (hora_inicio, hora_fim)`,
  [profissionalId, data, horarioInicio, horarioFim]
);
if (conflitos.length > 0) {
  return { erro: 'conflito_horario', mensagem: 'Esse horário já está ocupado.' };
}
```

### 9.7 Notificações Automáticas (Scheduler)

| Tipo | Quando | Mensagem |
|---|---|---|
| Notificar barbeiro | Imediato após criar | "🆕 Novo agendamento: João — 23/06 15:00 — Corte" |
| Lembrete cliente | 30 min antes | "Oi João, lembrando seu corte daqui 30min com LUIZ ✂️" |
| Retorno automático | 20 dias após | "Oi João! Já faz 20 dias do seu último corte. Quer agendar de novo? 😊" |

### 9.8 Diferenças vs outros nichos

- **Tempo curto** (30-60min) — múltiplos atendimentos por dia
- **Cliente recorrente** (volta a cada 15-30 dias) — retorno automático faz muito sentido
- **Pagamento no local** (não precisa cobrar antes)
- **Sem necessidade de prontuário ou documentação extensa**

---


## 💅 CAPÍTULO 10 — SALÃO DE BELEZA

### 10.1 Visão Geral do Negócio

**Operação:**
- Múltiplos serviços (cabelo, manicure, pedicure, sobrancelha, depilação, estética)
- Atendimentos longos (1-4h em coloração/química)
- Pacotes/combos populares (cabelo + escova + unha)
- Cliente VIP com preços/horários especiais
- Pagamento no local + venda de produtos (shampoo, esmalte)

**Volume típico:**
- 5-15 atendimentos/dia
- 4-8 profissionais (cabeleireiro, manicure, esteticista)
- 100-500 clientes cadastrados

**Particularidades:**
- Serviços longos exigem bloqueio de tempo maior
- Combos: serviços simultâneos (cabelo + unha pode ser ao mesmo tempo, com profissionais diferentes)
- Cliente VIP: programa fidelidade (10ª escova grátis, etc)
- Aniversariantes: descontos automáticos
- Maior preocupação com remarketing

### 10.2 Schema SQL Específico

```sql
-- Categorias de serviço (cabelo, unha, estética...)
CREATE TABLE categorias_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Cabelo", "Unha", "Estética"
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE
);

-- Serviços (extensão do schema base)
CREATE TABLE servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias_servico(id),
  nome TEXT NOT NULL,                    -- "Escova", "Coloração", "Manicure"
  duracao_minutos INTEGER NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  preco_vip NUMERIC(10,2),               -- preço para cliente VIP
  permite_simultaneo BOOLEAN DEFAULT FALSE,  -- pode ser feito ao mesmo tempo que outro
  ativo BOOLEAN DEFAULT TRUE
);

-- Pacotes/Combos
CREATE TABLE pacotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Pacote Noiva", "Combo Cabelo+Unha"
  preco_total NUMERIC(10,2) NOT NULL,
  desconto_percentual NUMERIC(5,2),
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE pacote_servicos (
  pacote_id UUID REFERENCES pacotes(id) ON DELETE CASCADE,
  servico_id UUID REFERENCES servicos(id) ON DELETE CASCADE,
  ordem INTEGER DEFAULT 0,
  PRIMARY KEY (pacote_id, servico_id)
);

-- Clientes (extensão para VIP/fidelidade)
ALTER TABLE clientes ADD COLUMN vip BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN total_atendimentos INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN pontos_fidelidade INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN preferencias JSONB DEFAULT '{}';
-- preferencias: { cor_cabelo_atual: "loiro", tipo_pele: "mista", alergias: ["henna"] }

-- Produtos vendidos
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  estoque INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE
);

-- Agendamentos múltiplos (1 visita = N serviços)
CREATE TABLE visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  data DATE NOT NULL,
  hora_chegada TIME NOT NULL,
  status TEXT DEFAULT 'agendada',
  pacote_id UUID REFERENCES pacotes(id),
  total_estimado NUMERIC(10,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cada serviço dentro da visita
CREATE TABLE visita_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id UUID NOT NULL REFERENCES visitas(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES servicos(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  ordem INTEGER DEFAULT 0,
  hora_inicio TIME,
  hora_fim TIME,
  preco NUMERIC(10,2),
  status TEXT DEFAULT 'agendado'
);
```

### 10.3 Tools Específicas (adições ao base)

```javascript
{
  type: 'function',
  function: {
    name: 'listarPacotes',
    description: 'Lista pacotes/combos disponíveis (ex: noiva, cabelo+unha).',
    parameters: { type: 'object', properties: {} },
  },
},
{
  type: 'function',
  function: {
    name: 'definirPacote',
    description: 'Cliente escolheu um pacote (combo).',
    parameters: {
      type: 'object',
      properties: { pacoteId: { type: 'string' } },
      required: ['pacoteId'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'adicionarServicoExtra',
    description: 'Adiciona outro serviço à visita atual.',
    parameters: {
      type: 'object',
      properties: { servicoId: { type: 'string' } },
      required: ['servicoId'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'verificarBeneficiosVIP',
    description: 'Consulta se cliente é VIP, pontos, descontos disponíveis.',
    parameters: { type: 'object', properties: {} },
  },
},
```

### 10.4 System Prompt (Salão)

```
Você é a recepcionista virtual do ${salaoNome}.
Atende com elegância, simpatia e personalização.

📅 Hoje: ${dataAtual}

🎯 MISSÃO
Agendar serviços de beleza (cabelo, unha, estética).
Sugerir pacotes/combos quando fizer sentido.
Identificar clientes VIP e oferecer benefícios.

✅ ESTILO
- Português brasileiro caloroso, mas conciso
- 1-2 frases por mensagem
- Use o nome do cliente
- Pode usar emojis com moderação (💅✨💆‍♀️)

📋 SLOT FILLING
Slots: cliente → categoria → servico/pacote → profissional → data → horario → confirmacao
Slots preenchidos: ${JSON.stringify(slotsPreenchidos)}
Próximo: ${slotsPendentes[0] || 'confirmação'}

🔄 FLUXO PADRÃO
1. Cliente diz "quero fazer cabelo" → categoria=cabelo → liste serviços de cabelo
2. Se cliente escolher 2+ serviços, sugira pacote (se houver match) com desconto
3. Cliente VIP: avise sobre benefício ("Você é VIP, tem 15% off!")
4. Aniversariante (mês de aniversário): aplica desconto especial
5. No fim: resumo + duração total + valor + confirmação

💬 EXEMPLOS

Cliente: "quero fazer escova"
✅ "Claro! Hoje temos a Maria e a Júlia pra escova. Tem preferência?"

Cliente VIP volta:
✅ "Oi Carla! 💅 Você é nossa cliente VIP, ganha 15% nos serviços de hoje. O que vai querer?"

Combo detectado:
✅ "Já que vai fazer escova + unha, recomendo nosso Combo Beleza por R$120 (economia de R$30). Topa?"

⚠️ NUNCA INVENTE
Sempre use as tools para buscar serviços, profissionais, pacotes e horários.
```

### 10.5 Exemplos de Conversa

#### Cenário 1 — Cliente VIP escolhe combo

```
Cliente: Oi
Agente:  Oi Carla! 💅 Você é nossa VIP, então tem 15% off hoje. O que vamos fazer?

Cliente: Quero escova e unha
Agente:  Show! Temos um Combo Beleza (escova + manicure) por R$135 com seu desconto VIP.
         Ou prefere separado? Escova R$80, manicure R$40 (R$102 com VIP).

Cliente: O combo
Agente:  Perfeito! Quer pra hoje ou outro dia?

Cliente: Hoje
Agente:  Que horário fica bom?

Cliente: 14h
Agente:  14h tá livre ✅ A Maria faz a escova e a Júlia a manicure (em paralelo).
         Termina por volta das 16h. Confirma?

Cliente: Sim
Agente:  ✅ Te esperamos às 14h, Carla! Reservei 2h pra você.
```

#### Cenário 2 — Aniversariante

```
Cliente: Quero agendar uma escova
Agente:  Oi Mariana! 🎂 É seu mês de aniversário, então tem 20% off.
         Quer pra qual dia?

Cliente: Sexta de manhã
Agente:  Tem 9h30 livre com a Júlia. Funciona?

Cliente: Pode ser
Agente:  ✅ Anotado: Escova sexta 26/06 às 9:30, R$80 (R$64 com seu desconto). 🎂
```

### 10.6 Validações Específicas

```javascript
// Tempo total da visita (somar duração dos serviços)
const duracaoTotal = await query(
  `SELECT COALESCE(SUM(duracao_minutos), 0) AS total
     FROM visita_servicos vs
     JOIN servicos s ON s.id = vs.servico_id
    WHERE vs.visita_id = $1`,
  [visitaId]
);

// Conflito: dois serviços em paralelo só se permite_simultaneo=true E profissionais diferentes
async function podeSerSimultaneo(servico1Id, servico2Id, prof1Id, prof2Id) {
  if (prof1Id === prof2Id) return false;  // mesma pessoa não faz 2 ao mesmo tempo
  const { rows } = await query(
    `SELECT permite_simultaneo FROM servicos WHERE id IN ($1, $2)`,
    [servico1Id, servico2Id]
  );
  return rows.every(r => r.permite_simultaneo);
}

// Programa de fidelidade: a cada 10 atendimentos, próximo ganha desconto
if (cliente.total_atendimentos > 0 && cliente.total_atendimentos % 10 === 0) {
  desconto = 0.30;  // 30% off no 10º, 20º, 30º atendimento
}
```

### 10.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Lembrete | 1h antes (visita longa) | "Oi Carla! Lembrando seu cabelo+unha às 14h hoje 💅" |
| Pós-atendimento | 1 dia depois | "Como ficou seu cabelo? 😊 Avalia a gente?" |
| Retorno cabelo | 30 dias | "Oi Carla! Já faz 1 mês da escova. Bora marcar de novo?" |
| Retorno unha | 15 dias | "Hora da manicure de novo? 💅" |
| Aniversário | 7 dias antes do aniversário | "🎂 Mês que vem é seu aniversário! Tem 20% off pra você." |

### 10.8 Diferenças vs Barbearia

- **Múltiplos serviços por visita** (combo cabelo+unha)
- **Atendimentos longos** (até 4h) → lembrete 1h antes
- **Cliente VIP** (programa fidelidade)
- **Pacotes promocionais**
- **Maior margem de personalização** (preferências de cor, alergias)

---

## 🏥 CAPÍTULO 11 — CLÍNICA MÉDICA / ODONTOLÓGICA

### 11.1 Visão Geral do Negócio

**Operação:**
- Consultas com médicos especialistas (cardiologia, dermatologia, etc)
- Procedimentos (exames, limpeza, restauração)
- Convênios + particulares (preços diferentes)
- Prontuário eletrônico (histórico clínico)
- Confirmação obrigatória 24h antes (evitar faltas)

**Volume típico:**
- 15-50 consultas/dia (clínica grande)
- 3-15 médicos
- 500-5000 pacientes cadastrados

**Particularidades:**
- ⚖️ **LGPD crítica** — dados de saúde são sensíveis
- Consultas têm horário fixo (15-30min) ou estendido (60min para retorno)
- Convênios cobrem alguns serviços
- Cancelamento <24h pode gerar cobrança
- Documentos: encaminhamentos, receitas, atestados
- Retorno é parte do tratamento (não opcional)

### 11.2 Schema SQL Específico

```sql
-- Especialidades médicas
CREATE TABLE especialidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Cardiologia", "Dermatologia"
  duracao_consulta_minutos INTEGER DEFAULT 30,
  ativo BOOLEAN DEFAULT TRUE
);

-- Médicos/Profissionais
CREATE TABLE profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  registro_profissional TEXT,            -- CRM, CRO, CRP
  cpf TEXT,
  email TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE profissional_especialidades (
  profissional_id UUID REFERENCES profissionais(id) ON DELETE CASCADE,
  especialidade_id UUID REFERENCES especialidades(id) ON DELETE CASCADE,
  PRIMARY KEY (profissional_id, especialidade_id)
);

-- Convênios
CREATE TABLE convenios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Unimed", "Bradesco Saúde", "Particular"
  ativo BOOLEAN DEFAULT TRUE
);

-- Procedimentos cobertos por convênio
CREATE TABLE convenio_procedimentos (
  convenio_id UUID REFERENCES convenios(id) ON DELETE CASCADE,
  procedimento_id UUID,
  valor_repasse NUMERIC(10,2),
  PRIMARY KEY (convenio_id, procedimento_id)
);

-- Pacientes (PII sensível)
CREATE TABLE pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT,                              -- criptografar (LGPD)
  rg TEXT,
  data_nascimento DATE,
  sexo TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  endereco JSONB,
  convenio_id UUID REFERENCES convenios(id),
  numero_carteirinha TEXT,
  observacoes_medicas TEXT,              -- alergias, condições crônicas
  consentimento_lgpd_em TIMESTAMPTZ,    -- data que aceitou termos
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

-- Consultas
CREATE TABLE consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  especialidade_id UUID REFERENCES especialidades(id),
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  tipo TEXT DEFAULT 'consulta',          -- consulta, retorno, exame, procedimento
  convenio_id UUID REFERENCES convenios(id),
  valor NUMERIC(10,2),
  status TEXT DEFAULT 'agendada',        -- agendada, confirmada, em_atendimento, concluida, cancelada, faltou
  motivo TEXT,                           -- motivo da consulta
  
  -- LGPD/Segurança
  confirmacao_solicitada_em TIMESTAMPTZ,
  confirmada_em TIMESTAMPTZ,
  cancelada_motivo TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consultas_data ON consultas(tenant_id, data, profissional_id);

-- Prontuário (registro clínico)
CREATE TABLE prontuario_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  consulta_id UUID REFERENCES consultas(id),
  profissional_id UUID NOT NULL REFERENCES profissionais(id),
  data TIMESTAMPTZ DEFAULT NOW(),
  
  -- SOAP padrão
  queixa TEXT,                           -- S: Subjetivo
  exame_fisico TEXT,                     -- O: Objetivo
  diagnostico TEXT,                      -- A: Avaliação
  conduta TEXT,                          -- P: Plano
  
  prescricao_medicamentos JSONB,
  exames_solicitados JSONB,
  
  acesso_log JSONB DEFAULT '[]'          -- log de quem acessou (LGPD)
);
```

### 11.3 Tools Específicas

```javascript
{
  name: 'listarEspecialidades',
  description: 'Lista especialidades disponíveis (cardiologia, dermatologia...).',
},
{
  name: 'definirEspecialidade',
  parameters: { properties: { especialidadeId: { type: 'string' } } },
},
{
  name: 'listarMedicos',
  description: 'Lista médicos da especialidade escolhida.',
},
{
  name: 'definirConvenio',
  parameters: {
    properties: {
      convenioId: { type: 'string' },
      tipo: { type: 'string', enum: ['particular', 'convenio'] },
    },
  },
},
{
  name: 'definirMotivoConsulta',
  description: 'Cliente descreve motivo (sintomas, retorno, etc).',
  parameters: {
    properties: { motivo: { type: 'string' } },
  },
},
{
  name: 'consultarHistorico',
  description: 'Verifica se paciente tem consultas anteriores (sem expor prontuário).',
},
{
  name: 'aceitarLGPD',
  description: 'Registra consentimento LGPD do paciente.',
},
```

### 11.4 System Prompt (Clínica)

```
Você é a recepção virtual da ${clinicaNome}.
Atende com profissionalismo, cuidado e respeito.

⚖️ LGPD: Você lida com dados sensíveis de saúde.
- NUNCA peça/repita CPF, dados médicos detalhados via WhatsApp
- NUNCA discuta diagnóstico, sintomas detalhados — apenas agende
- Se paciente quer falar com médico, oriente a consulta presencial

🎯 MISSÃO
Agendar consultas, exames e retornos.
Coletar dados mínimos necessários (nome, telefone, especialidade).
Solicitar confirmação 24h antes.

✅ ESTILO
- Tom profissional mas acolhedor
- Português brasileiro formal-amigável
- 1-2 frases por mensagem

📋 SLOT FILLING
Slots: paciente → especialidade → medico → convenio → data → horario → motivo → confirmacao
Slots preenchidos: ${JSON.stringify(slotsPreenchidos)}

🔄 FLUXO
1. "Quero marcar consulta" → pergunta especialidade
2. Lista médicos da especialidade → escolhe
3. Pergunta convênio (ou particular)
4. Pergunta data preferida → horário
5. Pergunta motivo (resumido) — para o médico se preparar
6. Resumo → confirma → envia confirmação 24h antes

💬 EXEMPLOS

Paciente: "preciso ir no cardiologista"
✅ "Claro. Temos os Drs. Pedro e Mariana de cardiologia. Tem preferência?"

Paciente: "quero remarcar"
✅ "Sem problema. Você tem consulta dia 25 às 14h com Dr. Pedro. É essa?"

Paciente descreve sintomas detalhados:
✅ "Entendi. Vou anotar como motivo: 'avaliação cardiológica'. O médico vai te avaliar melhor presencialmente. Pra qual dia?"

⚠️ NUNCA
- Diagnostique, sugira medicamento ou tratamento
- Repita CPF/dados sensíveis na conversa
- Confirme prontuário/exames anteriores via WhatsApp
```

### 11.5 Exemplos de Conversa

#### Cenário 1 — Primeira consulta

```
Paciente: Boa tarde, preciso marcar consulta
Agente:  Boa tarde! Posso ajudar. Qual seu nome?

Paciente: Ana Silva
Agente:  Anotado, Ana. Qual especialidade?

Paciente: Dermatologia
Agente:  Temos a Dra. Mariana e o Dr. Carlos. Tem preferência?

Paciente: Dra. Mariana
Agente:  Vai usar convênio ou particular?

Paciente: Unimed
Agente:  Anotado. Pra qual data?

Paciente: Próxima semana
Agente:  A Dra. tem terça (24/06) ou quinta (26/06). Qual fica melhor?

Paciente: Terça
Agente:  Tem 14h ou 16h livres na terça. Qual prefere?

Paciente: 14h
Agente:  Pode me dizer o motivo (resumido) da consulta?

Paciente: Tô com umas manchas no rosto
Agente:  Anotado: avaliação dermatológica. 
         Confere:
         👩‍⚕️ Dra. Mariana — Dermatologia
         📅 Terça 24/06 às 14h
         🏥 Unimed
         Confirma?

Paciente: Sim
Agente:  ✅ Agendado! Vou enviar confirmação no dia anterior.
         📋 Traga documento + carteirinha do convênio.
```

#### Cenário 2 — Confirmação 24h antes (automático)

```
Sistema:  Olá Ana! Confirmando sua consulta:
          📅 Amanhã (24/06) às 14h
          👩‍⚕️ Dra. Mariana — Dermatologia
          Pode confirmar? (1-Sim 2-Cancelar 3-Remarcar)

Paciente: 1
Sistema:  ✅ Confirmado. Te esperamos amanhã!
```

#### Cenário 3 — Cancelamento <24h

```
Paciente: Preciso cancelar a consulta de amanhã
Agente:  Sem problema, mas atenção: cancelamentos com menos de 24h podem gerar cobrança 
         conforme nossa política. Quer cancelar mesmo assim ou prefere remarcar?

Paciente: Remarcar
Agente:  Boa escolha. Pra qual data?
```

### 11.6 Validações Específicas (LGPD)

```javascript
// Anonimização de logs
function logSeguro(mensagem, paciente) {
  return {
    pacienteId: paciente.id,         // só ID
    iniciais: paciente.nome.split(' ').map(n => n[0]).join(''),
    mensagem: mensagem.replace(/\d{11,}/g, '[CPF]'),  // remove CPF
  };
}

// Consentimento LGPD obrigatório
async function exigirConsentimento(pacienteId) {
  const { rows } = await query(
    `SELECT consentimento_lgpd_em FROM pacientes WHERE id = $1`,
    [pacienteId]
  );
  if (!rows[0]?.consentimento_lgpd_em) {
    return {
      precisa_consentimento: true,
      texto: 'Para continuar, preciso que aceite nossa política de proteção de dados (LGPD). Aceita?',
    };
  }
}

// Acesso ao prontuário registrado em log
async function acessarProntuario(prontuarioId, usuarioId) {
  await query(
    `UPDATE prontuario_entradas 
        SET acesso_log = acesso_log || jsonb_build_object('user', $1, 'em', NOW())
      WHERE id = $2`,
    [usuarioId, prontuarioId]
  );
}
```

### 11.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Confirmação | 24h antes | "Confirmando sua consulta amanhã às 14h. Confirma?" |
| Lembrete | 2h antes | "Lembrando: consulta hoje às 14h com Dra. Mariana" |
| Pós-consulta | 1 dia depois | "Como foi sua consulta? Avalia o atendimento?" |
| Retorno (se prescrito) | conforme médico | "Lembrando: retorno marcado para 30/07" |
| Aniversário do exame | 1 ano | "Já faz 1 ano do seu check-up. Quer reagendar?" |

### 11.8 Diferenças vs Barbearia

- **LGPD obrigatória** (consentimento, anonimização)
- **Confirmação 24h** (cancelamento <24h tem custo)
- **Convênios** afetam preço e cobertura
- **Prontuário separado do agendamento**
- **Tom mais formal e profissional**
- **Não diagnostique no agente IA** (legal/ético)

---


## ⚖️ CAPÍTULO 12 — ADVOCACIA

### 12.1 Visão Geral do Negócio

**Operação:**
- Consultas jurídicas iniciais (presenciais ou online)
- Áreas: trabalhista, civil, criminal, família, tributário, empresarial
- Casos abertos com prazos processuais
- Honorários: hora consulta, contrato fixo, êxito (% da causa)
- Audiências/prazos críticos

**Volume típico:**
- 5-20 consultas/dia
- 2-10 advogados
- Carteira de 100-1000 clientes ativos

**Particularidades:**
- ⚖️ **OAB e ética profissional** (não pode prometer resultado)
- ⚖️ **LGPD muito sensível** (segredo profissional)
- Documentos obrigatórios: procuração, RG, CPF, comprovantes
- Prazos processuais são críticos (perder = perder a causa)
- Áudio do cliente é comum (mas não pode substituir consulta)
- Advogado precisa avaliar caso ANTES de aceitar

### 12.2 Schema SQL Específico

```sql
-- Áreas de atuação
CREATE TABLE areas_juridicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Trabalhista", "Família", "Criminal"
  descricao TEXT,
  valor_consulta NUMERIC(10,2),
  ativo BOOLEAN DEFAULT TRUE
);

-- Advogados
CREATE TABLE advogados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  oab TEXT NOT NULL,                     -- número da OAB
  oab_estado TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE advogado_areas (
  advogado_id UUID REFERENCES advogados(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas_juridicas(id) ON DELETE CASCADE,
  PRIMARY KEY (advogado_id, area_id)
);

-- Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'pf',                -- pf (pessoa física) ou pj (jurídica)
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,                         -- criptografar
  rg TEXT,
  data_nascimento DATE,
  estado_civil TEXT,
  profissao TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  endereco JSONB,
  observacoes TEXT,
  consentimento_lgpd_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

-- Consultas (agendamentos para conversa inicial)
CREATE TABLE consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  advogado_id UUID NOT NULL REFERENCES advogados(id),
  area_id UUID REFERENCES areas_juridicas(id),
  modalidade TEXT DEFAULT 'presencial',  -- presencial, online
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  resumo_caso TEXT,                      -- breve descrição
  valor_consulta NUMERIC(10,2),
  status TEXT DEFAULT 'agendada',
  link_videoconferencia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Casos (após consulta, vira caso)
CREATE TABLE casos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero_processo TEXT,                  -- número do processo (CNJ)
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  advogado_responsavel_id UUID REFERENCES advogados(id),
  area_id UUID REFERENCES areas_juridicas(id),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'ativo',           -- ativo, suspenso, encerrado_ganho, encerrado_perdido, encerrado_acordo
  tipo_honorarios TEXT,                  -- fixo, hora, exito
  valor_honorarios NUMERIC(10,2),
  percentual_exito NUMERIC(5,2),
  data_abertura DATE,
  data_encerramento DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prazos (críticos!)
CREATE TABLE prazos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  data_limite DATE NOT NULL,
  prioridade TEXT DEFAULT 'normal',      -- baixa, normal, alta, fatal
  cumprido BOOLEAN DEFAULT FALSE,
  cumprido_em TIMESTAMPTZ,
  observacoes TEXT
);

CREATE INDEX idx_prazos_data ON prazos(caso_id, data_limite) WHERE cumprido = FALSE;

-- Audiências
CREATE TABLE audiencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  local TEXT,                            -- forum, virtual
  link_virtual TEXT,
  tipo TEXT,                             -- conciliacao, instrucao, julgamento
  status TEXT DEFAULT 'agendada',
  observacoes TEXT
);

-- Documentos
CREATE TABLE documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  caso_id UUID REFERENCES casos(id),
  tipo TEXT,                             -- procuracao, rg, comprovante, contrato
  url TEXT,                              -- caminho/storage
  recebido_em TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.3 Tools Específicas

```javascript
{
  name: 'listarAreasJuridicas',
  description: 'Lista áreas (trabalhista, família, criminal...).',
},
{
  name: 'definirAreaJuridica',
  parameters: { properties: { areaId: { type: 'string' } } },
},
{
  name: 'classificarUrgencia',
  description: 'Classifica urgência do caso (audiência marcada? prazo? consulta inicial?).',
  parameters: {
    properties: {
      tipo: { type: 'string', enum: ['consulta_inicial', 'caso_em_andamento', 'urgente_prazo', 'audiencia_proxima'] },
    },
  },
},
{
  name: 'definirModalidade',
  parameters: {
    properties: {
      modalidade: { type: 'string', enum: ['presencial', 'online'] },
    },
  },
},
{
  name: 'coletarResumoCaso',
  description: 'Coleta breve resumo (NÃO entra em mérito, só categoriza).',
  parameters: {
    properties: { resumo: { type: 'string', maxLength: 500 } },
  },
},
{
  name: 'aceitarLGPD',
  description: 'Registra aceite do termo LGPD + sigilo profissional.',
},
{
  name: 'consultarAndamentoCaso',
  description: 'Cliente já tem caso? Mostra status sem expor detalhes sensíveis.',
},
```

### 12.4 System Prompt (Advocacia)

```
Você é a recepção virtual do escritório ${escritorioNome}.
Atende com profissionalismo, sigilo e tom respeitoso.

⚖️ ÉTICA OAB (CRÍTICO)
- NUNCA dê opinião jurídica, conselho ou parecer
- NUNCA prometa resultado ("você vai ganhar", "tem 100% de chance")
- NUNCA discuta valores de causa, indenização, cálculos
- NUNCA aceite caso sem advogado avaliar
- Sempre encaminhe a uma consulta inicial com advogado

⚖️ LGPD + SIGILO PROFISSIONAL
- Dados do cliente são confidenciais (segredo profissional)
- NÃO confirme dados de outros clientes ou casos
- NÃO peça documentos sensíveis via WhatsApp (combine envio seguro)

🎯 MISSÃO
Agendar consulta inicial com advogado adequado à área.
Coletar resumo MUITO breve para advogado se preparar.
Esclarecer modalidade (presencial/online), valor da consulta.

✅ ESTILO
- Tom formal mas acolhedor
- Português brasileiro respeitoso
- Sem gírias nem emojis (apenas ✅ na confirmação)
- 2-3 frases máximo por mensagem

📋 SLOT FILLING
Slots: cliente → area → advogado → modalidade → data → horario → resumo → confirmacao
Slots preenchidos: ${JSON.stringify(slotsPreenchidos)}

💬 EXEMPLOS

Cliente: "preciso de um advogado, fui demitido"
✅ "Posso ajudar a agendar uma consulta com advogado trabalhista. Qual seu nome completo?"
❌ "Demitido sem justa causa? Você tem direito a..." (NUNCA dar parecer)

Cliente: "vou ganhar a causa?"
✅ "Quem pode te dizer isso é o advogado, após avaliar os documentos. Vou agendar uma consulta?"

Cliente: "qual o valor da indenização?"
✅ "Esse cálculo é feito pelo advogado com base no caso. Vamos agendar a consulta inicial?"

⚠️ NUNCA
- Confirme se outra pessoa é cliente do escritório (sigilo)
- Discuta detalhes de processo via WhatsApp
- Recomende ações jurídicas
- Diga prazos processuais sem o advogado confirmar
```

### 12.5 Exemplos de Conversa

#### Cenário 1 — Consulta inicial

```
Cliente: Boa tarde, preciso de um advogado
Agente:  Boa tarde. Posso te ajudar a agendar uma consulta. Qual seu nome completo?

Cliente: João Silva
Agente:  Anotado. A consulta é sobre qual área? Trabalhista, família, criminal, civil, 
         empresarial ou tributário?

Cliente: Trabalhista
Agente:  Temos os Drs. Pedro Lima (OAB/SP 12345) e Mariana Costa (OAB/SP 67890) 
         em direito trabalhista. Tem preferência?

Cliente: Dr. Pedro
Agente:  Prefere consulta presencial ou online?

Cliente: Online
Agente:  Pra qual data?

Cliente: Sexta
Agente:  Dr. Pedro tem 10h ou 14h livre na sexta. Qual prefere?

Cliente: 14h
Agente:  Pode me passar um resumo bem breve do que você quer tratar? 
         (3-4 linhas, só pra ele se preparar)

Cliente: Fui demitido por justa causa, mas acho injusto, queria avaliar
Agente:  Anotado.
         Confere:
         👨‍⚖️ Dr. Pedro Lima — Trabalhista
         📅 Sexta 26/06 às 14h (online)
         💰 Consulta: R$300
         
         Você concorda com nossa política de privacidade (LGPD)?

Cliente: Sim
Agente:  ✅ Agendado. Vou enviar o link da videoconferência por aqui 1h antes.
         📋 Tenha à mão: carteira de trabalho, contracheques, comprovante de demissão.
```

#### Cenário 2 — Cliente quer parecer (REJEIÇÃO ÉTICA)

```
Cliente: Doutor, comprei um produto e veio com defeito. Posso processar?
Agente:  Esse tipo de avaliação só pode ser feita por um advogado, em consulta. 
         Posso agendar com nosso especialista em consumidor?

Cliente: Quanto eu posso ganhar?
Agente:  Cálculos de indenização dependem de cada caso. O advogado vai analisar 
         e te orientar. Vamos agendar?
```

#### Cenário 3 — Cliente já em andamento

```
Cliente: Quero saber como tá meu processo
Agente:  Vou conferir aqui... Você tem 1 caso ativo conosco com Dr. Pedro Lima.
         Para detalhes do andamento, posso pedir que ele te ligue ou agendar 
         um retorno. O que prefere?

Cliente: Retorno
Agente:  Dr. Pedro tem disponibilidade quinta às 15h. Funciona?
```

### 12.6 Validações Específicas

```javascript
// Filtros éticos no input
const PALAVRAS_PROIBIDAS_RESPOSTA = [
  'vai ganhar', 'tem direito a', 'indenização de', 
  'na minha opinião', 'eu acho que', 'recomendo processar',
];

// Verifica se IA está dando parecer (não pode)
function ehParecerJuridico(resposta) {
  return PALAVRAS_PROIBIDAS_RESPOSTA.some(p => 
    resposta.toLowerCase().includes(p)
  );
}

// Se detectar, substitui por mensagem padrão
if (ehParecerJuridico(respostaIA)) {
  respostaIA = 'Esse tipo de avaliação só pode ser feita pelo advogado, em consulta. Posso agendar?';
}

// Confidencialidade — não confirmar dados de outros
async function podeRevelar(perguntaSobre, telefoneRequisitante) {
  const cliente = await buscarPorTelefone(telefoneRequisitante);
  if (perguntaSobre.cpf !== cliente.cpf) return false;
  return true;
}
```

### 12.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Confirmação consulta | 24h antes | "Lembrando consulta amanhã às 14h com Dr. Pedro" |
| Lembrete docs | 24h antes | "Lembrando trazer: carteira de trabalho, contracheques" |
| Audiência | 48h antes | "Sua audiência é dia 30/06 às 10h no Fórum Central" |
| Audiência | 2h antes | "Audiência hoje às 10h. Local: Fórum Central, sala 305" |
| Prazo crítico | conforme | "Prazo do caso XYZ vence em 2 dias. Avise o cliente." (interno) |

### 12.8 Diferenças vs Barbearia

- **Ética OAB** crítica (não pode dar parecer)
- **Sigilo profissional** + LGPD reforçado
- **Tom MUITO formal**
- **Casos têm vida longa** (meses/anos) vs agendamentos pontuais
- **Prazos processuais** são fatais (não podem ser perdidos)
- **Documentação obrigatória** (procuração)
- **Audiências** são compromissos legais (não cancelar)

---


## 👕 CAPÍTULO 13 — LOJA DE ROUPAS / E-COMMERCE WHATSAPP

### 13.1 Visão Geral do Negócio

**Operação:**
- Catálogo de produtos com fotos, tamanhos e cores
- Cliente vê produto, escolhe tamanho/cor, adiciona ao carrinho
- Pagamento: PIX, cartão (link), boleto
- Entrega: Correios, motoboy local, retirada na loja
- Estoque por SKU (produto + tamanho + cor)

**Volume típico:**
- 30-200 mensagens/dia
- 5-50 vendas/dia
- 100-1000 produtos no catálogo

**Particularidades:**
- 📸 **Imagens** são parte essencial (precisa enviar fotos)
- Estoque variável (esgota rápido)
- Tabela de medidas (P, M, G, GG)
- Política de troca/devolução (CDC)
- Frete calculado por CEP
- Pagamento online (link Mercado Pago, Stripe, etc)
- Carrinho abandonado é comum (recuperar via msg)

### 13.2 Schema SQL Específico

```sql
-- Categorias
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Camisetas", "Calças", "Vestidos"
  slug TEXT NOT NULL,
  parent_id UUID REFERENCES categorias(id),
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE
);

-- Produtos
CREATE TABLE produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL,
  preco_promocional NUMERIC(10,2),
  ativo BOOLEAN DEFAULT TRUE,
  destaque BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Imagens dos produtos
CREATE TABLE produto_imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  principal BOOLEAN DEFAULT FALSE
);

-- Variações (SKU = produto + tamanho + cor)
CREATE TABLE produto_variacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tamanho TEXT,                          -- P, M, G, GG, 36, 38, 40
  cor TEXT,                              -- Preto, Branco, Vermelho
  cor_hex TEXT,                          -- #000000
  estoque INTEGER DEFAULT 0,
  sku TEXT UNIQUE,                       -- código interno
  preco_adicional NUMERIC(10,2) DEFAULT 0  -- ex: GG custa +R$5
);

CREATE INDEX idx_variacoes_produto ON produto_variacoes(produto_id);
CREATE INDEX idx_variacoes_estoque ON produto_variacoes(estoque) WHERE estoque > 0;

-- Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT,
  cpf TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  endereco JSONB,                        -- {cep, logradouro, numero, complemento, bairro, cidade, uf}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

-- Carrinho (sessão temporária)
CREATE TABLE carrinhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id),
  telefone TEXT,
  status TEXT DEFAULT 'aberto',          -- aberto, abandonado, finalizado
  total NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE carrinho_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrinho_id UUID NOT NULL REFERENCES carrinhos(id) ON DELETE CASCADE,
  variacao_id UUID NOT NULL REFERENCES produto_variacoes(id),
  quantidade INTEGER DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

-- Pedidos (carrinho finalizado)
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero TEXT UNIQUE NOT NULL,           -- #001234
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  
  -- Valores
  subtotal NUMERIC(10,2) NOT NULL,
  frete NUMERIC(10,2) DEFAULT 0,
  desconto NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  
  -- Pagamento
  forma_pagamento TEXT,                  -- pix, cartao, boleto
  pagamento_status TEXT DEFAULT 'pendente',  -- pendente, aprovado, recusado, estornado
  pagamento_link TEXT,
  pagamento_id_externo TEXT,             -- ID do gateway
  
  -- Entrega
  tipo_entrega TEXT,                     -- correios_pac, correios_sedex, motoboy, retirada
  endereco_entrega JSONB,
  prazo_entrega_dias INTEGER,
  codigo_rastreio TEXT,
  
  -- Status
  status TEXT DEFAULT 'aguardando_pagamento',
  -- aguardando_pagamento, pago, em_separacao, enviado, entregue, cancelado
  
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  variacao_id UUID REFERENCES produto_variacoes(id),
  produto_nome TEXT NOT NULL,            -- snapshot
  tamanho TEXT,
  cor TEXT,
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);

-- Histórico de status
CREATE TABLE pedido_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  mudou_em TIMESTAMPTZ DEFAULT NOW(),
  observacao TEXT
);
```

### 13.3 Tools Específicas

```javascript
{
  name: 'listarCategorias',
  description: 'Lista categorias (camisetas, calças...).',
},
{
  name: 'buscarProdutos',
  description: 'Busca produtos por categoria ou termo.',
  parameters: {
    properties: {
      categoria: { type: 'string' },
      termo: { type: 'string' },
      limit: { type: 'number', default: 5 },
    },
  },
},
{
  name: 'mostrarProduto',
  description: 'Mostra produto com fotos, descrição, tamanhos disponíveis.',
  parameters: {
    properties: { produtoId: { type: 'string' } },
  },
},
{
  name: 'verificarEstoque',
  description: 'Verifica se variação específica tem estoque.',
  parameters: {
    properties: {
      produtoId: { type: 'string' },
      tamanho: { type: 'string' },
      cor: { type: 'string' },
    },
  },
},
{
  name: 'adicionarAoCarrinho',
  parameters: {
    properties: {
      variacaoId: { type: 'string' },
      quantidade: { type: 'number', default: 1 },
    },
  },
},
{
  name: 'mostrarCarrinho',
  description: 'Mostra itens do carrinho atual.',
},
{
  name: 'removerDoCarrinho',
  parameters: {
    properties: { itemId: { type: 'string' } },
  },
},
{
  name: 'calcularFrete',
  parameters: {
    properties: { cep: { type: 'string' } },
  },
},
{
  name: 'definirEnderecoEntrega',
  parameters: {
    properties: {
      cep: { type: 'string' },
      logradouro: { type: 'string' },
      numero: { type: 'string' },
      complemento: { type: 'string' },
      bairro: { type: 'string' },
      cidade: { type: 'string' },
      uf: { type: 'string' },
    },
  },
},
{
  name: 'definirFormaPagamento',
  parameters: {
    properties: {
      forma: { type: 'string', enum: ['pix', 'cartao', 'boleto'] },
    },
  },
},
{
  name: 'finalizarPedido',
  description: 'Cria pedido e gera link de pagamento.',
},
{
  name: 'consultarPedido',
  parameters: {
    properties: { numero: { type: 'string' } },
  },
},
```

### 13.4 System Prompt (Loja de Roupas)

```
Você é o assistente de vendas da ${lojaNome}.
Atende com simpatia, agilidade e foco em fechar venda.

🎯 MISSÃO
Mostrar produtos, esclarecer dúvidas (tamanho, cor, prazo).
Adicionar ao carrinho, calcular frete, fechar venda.
Recuperar carrinhos abandonados.

✅ ESTILO
- Português brasileiro descontraído
- Use emojis com moderação (👕👗💝🚚📦)
- 1-2 frases + foto/dados quando aplicável
- Sempre mostre PREÇO e FOTO ao apresentar produto

🔄 FLUXO PADRÃO
1. Cliente diz "quero ver vestidos" → buscar e mostrar 3-5 com foto
2. Cliente escolhe → mostrar tamanhos e cores disponíveis
3. Cliente define tamanho/cor → adicionar ao carrinho
4. Pode continuar comprando ou finalizar
5. Coleta CEP → calcula frete → mostra opções
6. Pega endereço → forma pagamento → gera link
7. Confirma pedido → envia código de rastreio quando despachar

📋 SLOTS
Para finalizar pedido: cliente_dados → endereco → frete → pagamento

💬 EXEMPLOS

Cliente: "tem vestido vermelho?"
✅ "Temos sim! 👗 Olha esses 3 mais vendidos:
    1. Vestido Floral Vermelho — R$159 [foto]
    2. Vestido Curto Vermelho — R$129 [foto]
    3. Vestido Longo Vermelho — R$229 [foto]
    Quer ver detalhes de algum?"

Cliente: "tenho que pagar antes?"
✅ "Sim, é pré-pago. Aceita PIX (5% off), cartão até 6x sem juros, ou boleto."

Cliente: "esse tem GG?"
✅ "Vou verificar... 👀 Sim, GG na cor preta tem 3 disponíveis. Adiciono no carrinho?"

⚠️ NUNCA
- Invente preços ou prazos
- Confirme estoque sem verificar (esgota rápido)
- Prometa entrega em prazo sem checar CEP
```

### 13.5 Exemplos de Conversa

#### Cenário 1 — Compra completa

```
Cliente: Oi, quero ver camisetas
Agente:  Oi! 👕 Top, temos várias. Olha as mais procuradas:
         1. Camiseta Básica Branca — R$59 [foto]
         2. Camiseta Estampada Floral — R$79 [foto]
         3. Camiseta Oversized Preta — R$89 [foto]
         Quer ver detalhes de alguma?

Cliente: A 2
Agente:  [foto adicional]
         Camiseta Estampada Floral — R$79
         📏 Tamanhos: P, M, G, GG
         🎨 Cores: Branco, Rosa, Verde
         Qual prefere?

Cliente: M rosa
Agente:  Verificando... ✅ M rosa tem 4 unidades. Adiciono no carrinho?

Cliente: Sim, e quero ver mais uma
Agente:  ✅ Adicionada! O que mais quer ver?

Cliente: Vestido floral
Agente:  Olha esses:
         1. Vestido Floral Curto — R$159
         2. Vestido Floral Longo — R$199
         (...)

Cliente: O 1, M, igual
Agente:  ✅ Vestido Floral Curto M no carrinho.
         🛒 Carrinho:
         • Camiseta Floral M Rosa — R$79
         • Vestido Floral Curto M — R$159
         Subtotal: R$238
         Quer fechar?

Cliente: Sim
Agente:  Me passa seu CEP pra calcular o frete?

Cliente: 13345-678
Agente:  📦 Opções:
         • PAC: R$18 (5-7 dias)
         • SEDEX: R$32 (1-2 dias)
         Qual prefere?

Cliente: PAC
Agente:  Pode confirmar o endereço? Rua, número, bairro, cidade?

Cliente: Rua das Flores 123, Centro, Indaiatuba SP
Agente:  Anotado.
         💳 Pagamento: PIX (5% off = R$243,10), cartão até 6x R$42,67, ou boleto?

Cliente: PIX
Agente:  ✅ Pedido #1234 criado!
         💰 Total: R$243,10 (com 5% off PIX)
         🔗 Link de pagamento: https://pag.com/xyz
         ⏰ Confirma em até 30min ou pedido cancela.
         Te aviso quando pagar e quando enviar 📦
```

#### Cenário 2 — Recuperação de carrinho

```
Sistema (24h depois):
         Oi Mariana 👋 Vi que você esqueceu 2 itens no carrinho:
         • Camiseta Floral M Rosa — R$79
         • Vestido Floral Curto M — R$159
         Como cortesia, ganha 10% off se finalizar hoje. 
         Quer continuar? 💕

Cliente: Sim
Agente:  Show! 🎉 Com desconto: R$214,20.
         Te passo o link de pagamento?
```

### 13.6 Validações Específicas

```javascript
// Reserva de estoque (atomic)
async function reservarEstoque(variacaoId, qtd) {
  const result = await query(
    `UPDATE produto_variacoes 
        SET estoque = estoque - $1
      WHERE id = $2 AND estoque >= $1
      RETURNING id`,
    [qtd, variacaoId]
  );
  return result.rowCount === 1;
}

// Liberar se pagamento não confirmar em 30min
async function liberarEstoqueExpirado() {
  await query(`
    UPDATE produto_variacoes pv
       SET estoque = estoque + pi.quantidade
      FROM pedido_itens pi
      JOIN pedidos p ON p.id = pi.pedido_id
     WHERE pi.variacao_id = pv.id
       AND p.status = 'aguardando_pagamento'
       AND p.created_at < NOW() - INTERVAL '30 minutes'
  `);
  
  await query(`
    UPDATE pedidos SET status = 'cancelado', cancelado_motivo = 'pagamento_expirado'
     WHERE status = 'aguardando_pagamento'
       AND created_at < NOW() - INTERVAL '30 minutes'
  `);
}

// CEP brasileiro (8 dígitos)
function validarCEP(cep) {
  const limpo = cep.replace(/\D/g, '');
  return limpo.length === 8 ? limpo : null;
}

// Política troca/devolução (CDC: 7 dias)
function podeTrocar(pedido) {
  const dias = (Date.now() - new Date(pedido.entregue_em)) / (1000 * 60 * 60 * 24);
  return dias <= 7;
}
```

### 13.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Pagamento pendente | 30min antes vencer | "Seu pedido vai cancelar em 30min se não pagar" |
| Pagamento confirmado | Imediato | "✅ Pagamento confirmado! Estamos separando" |
| Pedido enviado | Quando despachar | "📦 Enviado! Rastreio: BR123456" |
| Pedido entregue | Imediato | "Recebeu? Avalia a gente?" |
| Carrinho abandonado | 24h depois | "Esqueceu o carrinho? 10% off pra finalizar" |
| Promoções | Conforme campanha | "👗 Liquida! Vestidos -30% até domingo" |
| Aniversário | No dia | "🎂 Feliz aniversário! Cupom 15% off" |

### 13.8 Diferenças vs Barbearia

- **E-commerce real** (não agendamento, mas pedido)
- **Imagens essenciais** (precisa enviar fotos)
- **Estoque atomic** (concorrência de compra)
- **Pagamento online integrado** (link Mercado Pago, etc)
- **Frete por CEP** (Correios API)
- **Pós-venda crítico** (rastreio, troca)
- **Carrinho abandonado** (oportunidade de remarketing)

---


## 🍕 CAPÍTULO 14 — RESTAURANTE / DELIVERY

### 14.1 Visão Geral do Negócio

**Operação:**
- Cardápio com pratos, bebidas, sobremesas
- Pedido: cliente escolhe → endereço → pagamento → entrega
- Pode ter retirada no local (sem taxa)
- Bairros atendidos com taxas diferentes
- Tempo médio de entrega: 30-60min
- Pico nos horários de almoço (11h30-14h) e jantar (18h-22h)

**Volume típico:**
- 50-300 pedidos/dia
- Cardápio: 30-150 itens

**Particularidades:**
- ⏰ **Tempo é crítico** (cliente espera comida quente, rápido)
- Personalizações comuns ("sem cebola", "ponto da carne")
- Combos e promoções (segunda do filé, kit família)
- Entregadores próprios ou app (iFood, Rappi)
- Acompanhamento em tempo real
- Pico = não dá pra atender todos (avisar)

### 14.2 Schema SQL Específico

```sql
-- Categorias do cardápio
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Pizzas", "Hambúrgueres", "Bebidas"
  ordem INTEGER DEFAULT 0,
  disponivel_almoco BOOLEAN DEFAULT TRUE,
  disponivel_jantar BOOLEAN DEFAULT TRUE,
  ativo BOOLEAN DEFAULT TRUE
);

-- Pratos
CREATE TABLE pratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id),
  nome TEXT NOT NULL,                    -- "Pizza Margherita Grande"
  descricao TEXT,                        -- ingredientes
  preco NUMERIC(10,2) NOT NULL,
  preco_promocional NUMERIC(10,2),
  imagem_url TEXT,
  tempo_preparo_min INTEGER DEFAULT 20,
  permite_personalizar BOOLEAN DEFAULT TRUE,
  ativo BOOLEAN DEFAULT TRUE,
  esgotado BOOLEAN DEFAULT FALSE         -- ingrediente faltou hoje
);

-- Adicionais (queijo extra, bacon, sem cebola)
CREATE TABLE adicionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Queijo extra"
  preco NUMERIC(10,2) DEFAULT 0,
  tipo TEXT,                             -- adicional, retirar (ex: "sem cebola"=R$0)
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE prato_adicionais (
  prato_id UUID REFERENCES pratos(id) ON DELETE CASCADE,
  adicional_id UUID REFERENCES adicionais(id) ON DELETE CASCADE,
  PRIMARY KEY (prato_id, adicional_id)
);

-- Bairros atendidos com taxas
CREATE TABLE bairros_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  taxa_entrega NUMERIC(10,2) NOT NULL,
  tempo_estimado_min INTEGER DEFAULT 45,
  ativo BOOLEAN DEFAULT TRUE
);

-- Cupons
CREATE TABLE cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,                  -- "FRETE10"
  tipo TEXT,                             -- desconto_fixo, desconto_percentual, frete_gratis
  valor NUMERIC(10,2),
  pedido_minimo NUMERIC(10,2) DEFAULT 0,
  validade DATE,
  usos_max INTEGER,
  usos_atuais INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE
);

-- Pedidos
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero TEXT UNIQUE NOT NULL,           -- "P-1234"
  cliente_id UUID REFERENCES clientes(id),
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  
  tipo TEXT DEFAULT 'delivery',          -- delivery, retirada
  
  -- Endereço (se delivery)
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_referencia TEXT,
  bairro_id UUID REFERENCES bairros_entrega(id),
  
  -- Valores
  subtotal NUMERIC(10,2) NOT NULL,
  taxa_entrega NUMERIC(10,2) DEFAULT 0,
  desconto NUMERIC(10,2) DEFAULT 0,
  cupom_id UUID REFERENCES cupons(id),
  total NUMERIC(10,2) NOT NULL,
  
  -- Pagamento
  forma_pagamento TEXT,                  -- pix, dinheiro, cartao_entrega, cartao_online
  troco_para NUMERIC(10,2),              -- se dinheiro
  pagamento_status TEXT DEFAULT 'pendente',
  
  -- Status do pedido
  status TEXT DEFAULT 'recebido',
  -- recebido, em_preparo, saiu_entrega, entregue, cancelado
  
  observacoes TEXT,
  tempo_estimado_min INTEGER,
  entregador_nome TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  preparado_em TIMESTAMPTZ,
  saiu_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ
);

CREATE TABLE pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  prato_id UUID REFERENCES pratos(id),
  prato_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL,
  observacoes TEXT,                      -- "ponto da carne: bem passado"
  subtotal NUMERIC(10,2) NOT NULL
);

CREATE TABLE pedido_item_adicionais (
  pedido_item_id UUID REFERENCES pedido_itens(id) ON DELETE CASCADE,
  adicional_id UUID REFERENCES adicionais(id),
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (pedido_item_id, adicional_id)
);
```

### 14.3 Tools Específicas

```javascript
{
  name: 'mostrarCardapio',
  parameters: {
    properties: { categoria: { type: 'string' } },
  },
},
{
  name: 'buscarPrato',
  parameters: {
    properties: { termo: { type: 'string' } },
  },
},
{
  name: 'mostrarPrato',
  parameters: {
    properties: { pratoId: { type: 'string' } },
  },
},
{
  name: 'adicionarAoPedido',
  parameters: {
    properties: {
      pratoId: { type: 'string' },
      quantidade: { type: 'number', default: 1 },
      adicionais: { type: 'array', items: { type: 'string' } },
      observacoes: { type: 'string' },
    },
  },
},
{
  name: 'mostrarPedidoAtual',
},
{
  name: 'definirTipoEntrega',
  parameters: {
    properties: {
      tipo: { type: 'string', enum: ['delivery', 'retirada'] },
    },
  },
},
{
  name: 'definirEnderecoEntrega',
  parameters: {
    properties: {
      bairro: { type: 'string' },
      rua: { type: 'string' },
      numero: { type: 'string' },
      complemento: { type: 'string' },
      referencia: { type: 'string' },
    },
  },
},
{
  name: 'aplicarCupom',
  parameters: {
    properties: { codigo: { type: 'string' } },
  },
},
{
  name: 'definirFormaPagamento',
  parameters: {
    properties: {
      forma: { type: 'string', enum: ['pix', 'dinheiro', 'cartao_entrega', 'cartao_online'] },
      trocoPara: { type: 'number' },
    },
  },
},
{
  name: 'finalizarPedido',
  description: 'Cria pedido e envia para cozinha.',
},
{
  name: 'consultarStatusPedido',
  parameters: {
    properties: { numero: { type: 'string' } },
  },
},
```

### 14.4 System Prompt (Restaurante)

```
Você é o atendente virtual do ${restauranteNome}.
Anota pedidos com agilidade, simpatia e precisão.

🎯 MISSÃO
Anotar pedido (pratos + adicionais + observações).
Coletar endereço, forma de pagamento.
Enviar para cozinha rapidamente.
Acompanhar status até entregar.

✅ ESTILO
- Português brasileiro descontraído
- Use emojis (🍕🍔🥤📦🛵)
- Curto e direto (cliente tem fome!)
- Anotar EXATAMENTE o que cliente quer (sem cebola = sem cebola)

🔄 FLUXO
1. Cliente diz "quero pedir" → mostre cardápio (categorias)
2. Lista pratos da categoria → cliente escolhe
3. Pergunta personalização se cabível ("ponto da carne?", "sem cebola?")
4. Continua até cliente dizer "só isso"
5. Pergunta entrega ou retirada
6. Se entrega → bairro + endereço (calcular taxa)
7. Forma pagamento (se dinheiro: troco pra quanto?)
8. Resumo + total + tempo estimado → confirma
9. Manda pra cozinha → atualiza status

📋 SLOTS
itens (pelo menos 1) → tipo_entrega → endereco (se delivery) → pagamento → confirmacao

💬 EXEMPLOS

Cliente: "quero uma pizza"
✅ "Boa! 🍕 Temos:
    1. Margherita G — R$59
    2. Calabresa G — R$65
    3. Portuguesa G — R$72
    4. 4 Queijos G — R$75
    Qual?"

Cliente: "calabresa, sem cebola"
✅ "Anotado: Calabresa G sem cebola — R$65. 
    Mais alguma coisa? Bebida?"

Cliente: "só isso"
✅ "Beleza! Entrega ou retirada?"

Cliente: "tá demorando"
✅ "Vou checar pra você... 👀 Pedido em preparo, saiu da cozinha às 18:45.
    Estimativa de chegada: 19:10. Já está bem próximo!"

⚠️ NUNCA
- Esqueça observações importantes (alergia, ponto da carne)
- Diga prazo sem checar bairro
- Aceite pedido fora do horário (cozinha fechada)
```

### 14.5 Exemplos de Conversa

#### Cenário 1 — Pedido completo

```
Cliente: Boa noite, quero pedir
Agente:  Boa noite! 🍕 O que vai querer? Pizzas, hambúrgueres, bebidas, sobremesas?

Cliente: Pizza
Agente:  Olha as opções:
         1. Margherita G — R$59
         2. Calabresa G — R$65
         3. Portuguesa G — R$72
         4. 4 Queijos G — R$75
         5. Especial da Casa G — R$85
         Qual?

Cliente: 4 queijos, sem orégano
Agente:  Anotado: 4 Queijos G sem orégano — R$75
         Mais alguma coisa? Borda recheada, bebida, sobremesa?

Cliente: Borda de catupiry e uma coca 2L
Agente:  ✅ Borda Catupiry +R$8
         ✅ Coca-Cola 2L — R$12
         Total parcial: R$95.
         Mais algo?

Cliente: Não
Agente:  Beleza! Entrega ou retirada?

Cliente: Entrega
Agente:  Qual seu bairro?

Cliente: Centro
Agente:  Anotado, taxa Centro = R$5, entrega ~30min.
         Me passa rua, número, complemento?

Cliente: Rua das Flores 123 ap 402
Agente:  Ponto de referência?

Cliente: Perto da praça
Agente:  Forma de pagamento? PIX, cartão na entrega, dinheiro ou cartão online?

Cliente: Dinheiro
Agente:  Troco pra quanto?

Cliente: 100
Agente:  Anotado: troco pra R$100 (R$0 de troco — exato!).
         📋 Pedido #P-1234:
         • 4 Queijos G sem orégano — R$75
         • Borda Catupiry — R$8
         • Coca-Cola 2L — R$12
         Subtotal: R$95
         Taxa entrega: R$5
         💰 Total: R$100 (dinheiro)
         📍 Rua das Flores 123 ap 402, Centro
         ⏰ Estimativa: 30min
         Confirma?

Cliente: Confirmo
Agente:  ✅ Pedido enviado pra cozinha! Te aviso quando sair pra entrega.
```

#### Cenário 2 — Acompanhamento

```
Sistema (15 min depois):
         🍕 Sua 4 Queijos saiu da cozinha! Entregador a caminho.
         📍 Estimativa: 15min

Sistema (30 min depois):
         📦 Entregue! Bom apetite! Avalia a gente quando puder?
```

#### Cenário 3 — Bairro fora da área

```
Cliente: Quero entregar no Jardim das Palmeiras
Agente:  Esse bairro infelizmente fica fora da nossa área de entrega 😕
         Mas você pode retirar aqui (sem taxa) ou pedir pelo iFood que entregamos lá. 
         O que prefere?
```

### 14.6 Validações Específicas

```javascript
// Horário de funcionamento
async function estaAberto(tenantId) {
  const agora = new Date();
  const dia = agora.getDay();
  const hora = agora.toTimeString().slice(0, 5);
  
  const { rows } = await query(
    `SELECT 1 FROM horarios_funcionamento 
       WHERE tenant_id = $1 AND dia_semana = $2 
         AND hora_abertura <= $3 AND hora_fechamento >= $3
         AND ativo = TRUE`,
    [tenantId, dia, hora]
  );
  return rows.length > 0;
}

// Estoque diário (pratos esgotados)
async function pratoDisponivel(pratoId) {
  const { rows } = await query(
    `SELECT esgotado FROM pratos WHERE id = $1`,
    [pratoId]
  );
  return !rows[0]?.esgotado;
}

// Taxa por bairro
async function taxaEntrega(tenantId, bairro) {
  const { rows } = await query(
    `SELECT * FROM bairros_entrega 
       WHERE tenant_id = $1 AND LOWER(nome) = LOWER($2) AND ativo = TRUE`,
    [tenantId, bairro]
  );
  if (rows.length === 0) return null;  // não atende
  return rows[0];
}

// Cupom válido
async function validarCupom(codigo, subtotal) {
  const { rows } = await query(
    `SELECT * FROM cupons 
       WHERE codigo = $1 AND ativo = TRUE
         AND (validade IS NULL OR validade >= CURRENT_DATE)
         AND (usos_max IS NULL OR usos_atuais < usos_max)
         AND pedido_minimo <= $2`,
    [codigo, subtotal]
  );
  return rows[0] || null;
}
```

### 14.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Confirmação | Imediato | "✅ Pedido recebido! Em preparo" |
| Saiu entrega | Quando saiu | "🛵 Pedido a caminho! ~15min" |
| Entregue | Imediato | "📦 Entregue! Bom apetite" |
| Avaliação | 30min após | "Como foi seu pedido? ⭐⭐⭐⭐⭐" |
| Retorno | 7-15 dias | "Saudades? 🍕 Pedido novamente?" |
| Promoção | Semanal | "🍔 Hoje: combo família por R$49!" |

### 14.8 Diferenças vs Barbearia

- **Pedidos, não agendamentos** (FIFO na cozinha)
- **Tempo é crítico** (cliente espera comida quente)
- **Personalização extensa** (sem cebola, ponto da carne)
- **Taxa de entrega por bairro** (não CEP como roupa)
- **Cardápio sazonal** (pratos esgotam no dia)
- **Acompanhamento em tempo real** (status em mudança)
- **Pico de pedidos** (avisar tempo extra em rush)

---


## 🏠 CAPÍTULO 15 — IMOBILIÁRIA

### 15.1 Visão Geral do Negócio

**Operação:**
- Catálogo de imóveis (aluguel + venda)
- Filtros: bairro, quartos, garagem, valor, área
- Cliente vê imóvel → agenda visita
- Visita com corretor → proposta → negociação
- CRM: leads, prospects, clientes ativos

**Volume típico:**
- Pequena: 30-100 imóveis ativos
- Média: 300-1000 imóveis
- Grande: 5000+ imóveis
- 5-30 corretores

**Particularidades:**
- 🏛️ **CRECI** obrigatório (corretor regulamentado)
- Imóvel tem MUITAS fotos (10-30 por anúncio)
- Localização é tudo (mapa, transporte, escolas)
- Preço varia (negociação esperada)
- Documentação extensa (escritura, IPTU, condomínio)
- Visita acompanhada por corretor (segurança)
- Lead qualification importante (filtrar curiosos)

### 15.2 Schema SQL Específico

```sql
-- Tipos de imóvel
CREATE TABLE tipos_imovel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL                     -- "Apartamento", "Casa", "Sala Comercial"
);

-- Bairros/Cidades
CREATE TABLE bairros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  uf TEXT NOT NULL
);

-- Imóveis
CREATE TABLE imoveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo TEXT UNIQUE NOT NULL,           -- "AP-1234"
  
  -- Tipo de negócio
  finalidade TEXT NOT NULL,              -- venda, aluguel, ambos
  
  -- Categorização
  tipo_id UUID REFERENCES tipos_imovel(id),
  bairro_id UUID REFERENCES bairros(id),
  
  -- Localização
  endereco_rua TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  cep TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  
  -- Características
  area_total NUMERIC(10,2),             -- m²
  area_util NUMERIC(10,2),
  quartos INTEGER,
  banheiros INTEGER,
  suites INTEGER,
  vagas_garagem INTEGER,
  andar INTEGER,
  
  -- Comodidades (JSONB para flexibilidade)
  comodidades JSONB DEFAULT '{}',
  -- {piscina:true, academia:true, churrasqueira:true, elevador:true, portaria24h:true}
  
  -- Valores
  preco_venda NUMERIC(12,2),
  preco_aluguel NUMERIC(10,2),
  iptu NUMERIC(10,2),
  condominio NUMERIC(10,2),
  
  -- Conteúdo
  titulo TEXT,
  descricao TEXT,
  destaques TEXT[],
  
  -- Status
  status TEXT DEFAULT 'disponivel',      -- disponivel, reservado, vendido, alugado, suspenso
  destaque BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_imoveis_filtros ON imoveis(tenant_id, finalidade, status, bairro_id, quartos);
CREATE INDEX idx_imoveis_preco_venda ON imoveis(preco_venda) WHERE finalidade IN ('venda', 'ambos');
CREATE INDEX idx_imoveis_preco_aluguel ON imoveis(preco_aluguel) WHERE finalidade IN ('aluguel', 'ambos');

-- Imagens
CREATE TABLE imovel_imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  legenda TEXT,
  principal BOOLEAN DEFAULT FALSE
);

-- Corretores
CREATE TABLE corretores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  creci TEXT NOT NULL,
  creci_uf TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

-- Leads/Interessados
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  
  -- Qualificação
  finalidade TEXT,                       -- comprar, alugar
  faixa_preco_min NUMERIC(12,2),
  faixa_preco_max NUMERIC(12,2),
  bairros_interesse UUID[],
  quartos_min INTEGER,
  vagas_min INTEGER,
  
  -- Origem
  origem TEXT DEFAULT 'whatsapp',
  imovel_inicial_id UUID REFERENCES imoveis(id),
  
  status TEXT DEFAULT 'novo',            -- novo, contatado, qualificado, visita_agendada, proposta, perdido
  corretor_id UUID REFERENCES corretores(id),
  
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ultimo_contato TIMESTAMPTZ DEFAULT NOW()
);

-- Visitas
CREATE TABLE visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  imovel_id UUID NOT NULL REFERENCES imoveis(id),
  lead_id UUID REFERENCES leads(id),
  corretor_id UUID REFERENCES corretores(id),
  data DATE NOT NULL,
  hora TIME NOT NULL,
  status TEXT DEFAULT 'agendada',        -- agendada, realizada, cancelada, faltou
  feedback_cliente TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Propostas
CREATE TABLE propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  imovel_id UUID NOT NULL REFERENCES imoveis(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  corretor_id UUID REFERENCES corretores(id),
  valor_oferta NUMERIC(12,2) NOT NULL,
  forma_pagamento TEXT,                  -- a_vista, financiamento, fgts
  condicoes TEXT,
  status TEXT DEFAULT 'em_analise',      -- em_analise, aceita, recusada, contraproposta
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 15.3 Tools Específicas

```javascript
{
  name: 'buscarImoveis',
  parameters: {
    properties: {
      finalidade: { type: 'string', enum: ['venda', 'aluguel'] },
      tipo: { type: 'string' },           // apartamento, casa
      bairro: { type: 'string' },
      quartos_min: { type: 'number' },
      precoMax: { type: 'number' },
      vagas_min: { type: 'number' },
      limit: { type: 'number', default: 5 },
    },
  },
},
{
  name: 'mostrarImovel',
  description: 'Mostra detalhes completos + fotos do imóvel.',
  parameters: {
    properties: { imovelId: { type: 'string' } },
  },
},
{
  name: 'qualificarLead',
  description: 'Coleta informações para qualificar (orçamento, urgência, finalidade).',
  parameters: {
    properties: {
      finalidade: { type: 'string', enum: ['comprar', 'alugar'] },
      orcamentoMax: { type: 'number' },
      bairrosInteresse: { type: 'array', items: { type: 'string' } },
      urgencia: { type: 'string', enum: ['agora', 'proximos_meses', 'pesquisando'] },
    },
  },
},
{
  name: 'agendarVisita',
  parameters: {
    properties: {
      imovelId: { type: 'string' },
      data: { type: 'string' },
      hora: { type: 'string' },
    },
  },
},
{
  name: 'consultarVisitas',
  description: 'Lista visitas agendadas pelo cliente.',
},
{
  name: 'iniciarProposta',
  description: 'Cliente quer fazer proposta. Coleta valor + condições.',
  parameters: {
    properties: {
      imovelId: { type: 'string' },
      valor: { type: 'number' },
      formaPagamento: { type: 'string' },
    },
  },
},
{
  name: 'transferirParaCorretor',
  description: 'Lead qualificado → passa pra corretor humano.',
},
```

### 15.4 System Prompt (Imobiliária)

```
Você é o atendimento virtual da ${imobiliariaNome}.
Atende com profissionalismo, ajudando a encontrar imóveis ideais.

🏛️ CRECI / ÉTICA
- Você NÃO é corretor, é assistente de pré-atendimento
- Mostra imóveis, agenda visitas, coleta interesses
- NÃO negocia preço, faz contrato ou aconselha juridicamente
- Visitas SEMPRE acompanhadas por corretor

🎯 MISSÃO
Apresentar imóveis que combinem com cliente.
Qualificar lead (orçamento, urgência, perfil).
Agendar visita com corretor.
Coletar dados para CRM.

✅ ESTILO
- Tom profissional caloroso
- Português brasileiro educado
- 1-2 frases + dados objetivos
- Use emojis com moderação (🏠📍🛏️🚗📅)

🔄 FLUXO
1. Cliente quer "alugar/comprar" → finalidade
2. Pergunta tipo (apto/casa) e bairro
3. Pergunta orçamento (faixa)
4. Mostra 3-5 imóveis que batem
5. Cliente interessa em algum → mostra detalhes
6. Quer visitar? → coleta nome, telefone, agenda com corretor
7. Lead qualificado salvo → corretor assume

📋 SLOTS PARA AGENDAR VISITA
imovel_escolhido → cliente_dados → corretor_disponivel → data → hora → confirmacao

💬 EXEMPLOS

Cliente: "procuro apto 2 quartos no Centro, até 2500 aluguel"
✅ "Beleza! Olha 3 opções:
    🏢 AP-1234 — Centro — 2qts, 1 vaga — R$2300
    🏢 AP-5678 — Centro — 2qts, 2 vagas — R$2450
    🏢 AP-9012 — Vila Nova — 2qts, 1 vaga — R$2200
    Quer ver detalhes de algum?"

Cliente: "quanto vale um apto de 2 quartos nesse bairro?"
✅ "A média varia entre R$2000 e R$3500 dependendo do andar e idade. 
    Quer que eu mostre algumas opções?"

Cliente: "vou conseguir financiar?"
✅ "Esse cálculo o corretor faz com você. Posso agendar pra ele te orientar?"

⚠️ NUNCA
- Negocie preço por conta própria
- Garanta que imóvel vai aceitar proposta X
- Dê parecer sobre financiamento, juros, escritura
- Recomende advogado, banco específico
```

### 15.5 Exemplos de Conversa

#### Cenário 1 — Busca + visita

```
Cliente: Boa tarde, quero alugar uma casa
Agente:  Boa tarde! 🏠 Quantos quartos?

Cliente: 3 quartos
Agente:  Em qual bairro?

Cliente: Vila Nova ou Jardim das Flores
Agente:  Qual seu orçamento de aluguel?

Cliente: Até 3500
Agente:  Anotado. Olha 3 opções pra você:
         
         🏠 CA-1001 — Vila Nova — 3qts, 2vagas, 120m² — R$3200
         📷 [foto]
         
         🏠 CA-2002 — Jardim das Flores — 3qts, 1vaga, 100m² — R$2900
         📷 [foto]
         
         🏠 CA-3003 — Vila Nova — 3qts c/ suíte, 2vagas, 150m² — R$3500
         📷 [foto]
         
         Quer ver mais detalhes de alguma?

Cliente: A primeira
Agente:  🏠 CA-1001 — Vila Nova
         📍 Rua das Acácias, 45
         🛏️ 3 quartos (1 suíte), 2 banheiros
         🚗 2 vagas
         📐 120m² total / 100m² útil
         💰 R$3200 + IPTU R$120 + condomínio (não tem, é casa)
         ✨ Quintal, churrasqueira, área gourmet
         📷 [10 fotos]
         
         Quer agendar uma visita com o corretor?

Cliente: Quero
Agente:  Show. Qual seu nome completo?

Cliente: Carlos Souza
Agente:  Anotado, Carlos. Pra qual dia?

Cliente: Sábado de manhã
Agente:  O Dr. Roberto (corretor) tem 9h, 10h ou 11h livre. Qual prefere?

Cliente: 10h
Agente:  ✅ Visita agendada!
         📅 Sábado 27/06 às 10h
         🏠 CA-1001 — Vila Nova, Rua das Acácias 45
         👨‍💼 Com Roberto Silva (CRECI/SP 12345)
         📞 Vai te ligar 30min antes pra confirmar.
         
         📋 Traga: documento, comprovante de renda (se for prosseguir)
```

#### Cenário 2 — Lead qualificação

```
Cliente: Tá vendendo apartamento?
Agente:  Sim! 🏢 Pra ter ideia das opções, posso saber:
         1. Quantos quartos você procura?
         2. Em qual bairro/região?
         3. Faixa de orçamento?

Cliente: 2 quartos, qualquer bairro central, até 400 mil
Agente:  Anotado:
         • 2 quartos
         • Região central
         • Até R$400.000
         
         Temos 7 opções nesse perfil. Te mando as 4 melhores:
         (...)
```

### 15.6 Validações Específicas

```javascript
// Filtro com múltiplos critérios
async function buscarImoveis(filtros) {
  const conditions = ['tenant_id = $1', "status = 'disponivel'"];
  const params = [tenantId];
  
  if (filtros.finalidade) {
    conditions.push(`finalidade IN ($${params.length + 1}, 'ambos')`);
    params.push(filtros.finalidade);
  }
  
  if (filtros.precoMax) {
    const col = filtros.finalidade === 'venda' ? 'preco_venda' : 'preco_aluguel';
    conditions.push(`${col} <= $${params.length + 1}`);
    params.push(filtros.precoMax);
  }
  
  if (filtros.quartos_min) {
    conditions.push(`quartos >= $${params.length + 1}`);
    params.push(filtros.quartos_min);
  }
  
  if (filtros.bairros?.length) {
    conditions.push(`bairro_id = ANY($${params.length + 1})`);
    params.push(filtros.bairros);
  }
  
  const sql = `
    SELECT * FROM imoveis 
     WHERE ${conditions.join(' AND ')}
     ORDER BY destaque DESC, created_at DESC
     LIMIT 5
  `;
  
  return await query(sql, params);
}

// Score de qualificação do lead (0-100)
function scoreLead(lead) {
  let score = 0;
  if (lead.urgencia === 'agora') score += 30;
  else if (lead.urgencia === 'proximos_meses') score += 20;
  if (lead.faixa_preco_max) score += 20;
  if (lead.bairros_interesse?.length) score += 15;
  if (lead.quartos_min) score += 10;
  if (lead.email) score += 15;
  if (lead.nome && lead.nome.split(' ').length >= 2) score += 10;
  return score;
}
```

### 15.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Confirmação visita | 24h antes | "Confirmando visita amanhã 10h ao CA-1001" |
| Lembrete | 2h antes | "Sua visita é hoje às 10h. Endereço: Rua X, 45" |
| Pós-visita | 2h depois | "Como foi a visita? Quer ver outros parecidos?" |
| Imóveis novos | Conforme perfil | "🆕 Novo apto que combina com seu perfil!" |
| Reativação | 30 dias sem interação | "Ainda procurando? Tem novidades pra você" |

### 15.8 Diferenças vs Barbearia

- **Lead qualification** crítica (filtrar curiosos)
- **CRECI** obrigatório (corretor humano fecha)
- **Imóvel é grande compra** (decisão lenta, várias visitas)
- **Catálogo extenso com fotos** (10-30 por imóvel)
- **Filtros complexos** (preço, quartos, bairro, m²)
- **Visitas com corretor** (segurança, regulação)
- **Pipeline longo** (lead → visita → proposta → contrato)
- **Pós-venda mínimo** (após fechar, é eventual)

---


## 💪 CAPÍTULO 16 — ACADEMIA / PERSONAL TRAINER

### 16.1 Visão Geral do Negócio

**Operação:**
- Planos mensais (mensalidade)
- Aulas em grupo (yoga, jump, funcional, spinning)
- Personal trainer (1:1 com hora marcada)
- Avaliação física periódica (3 em 3 meses)
- Anamnese antes de iniciar (saúde, objetivos)

**Volume típico:**
- Academia: 100-2000 alunos
- Personal: 20-100 alunos por personal
- 5-30 instrutores

**Particularidades:**
- 🏥 **Saúde** é fator (atestado médico, anamnese)
- Mensalidade recorrente (cobrança automática)
- Plano = acesso (não é serviço pontual)
- Aulas têm vagas limitadas
- Avaliação física é diferencial competitivo
- Aniversário do plano = momento de retenção
- Inadimplência → bloqueio acesso

### 16.2 Schema SQL Específico

```sql
-- Planos
CREATE TABLE planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Plano Mensal", "Trimestral", "Anual"
  descricao TEXT,
  preco_mensal NUMERIC(10,2) NOT NULL,
  duracao_meses INTEGER DEFAULT 1,       -- 1, 3, 6, 12
  desconto_percentual NUMERIC(5,2) DEFAULT 0,
  inclui_aulas BOOLEAN DEFAULT TRUE,
  inclui_personal BOOLEAN DEFAULT FALSE,
  inclui_avaliacao BOOLEAN DEFAULT TRUE,
  ativo BOOLEAN DEFAULT TRUE
);

-- Modalidades de aula
CREATE TABLE modalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                    -- "Yoga", "Jump", "Funcional"
  descricao TEXT,
  duracao_minutos INTEGER DEFAULT 60,
  vagas_max INTEGER DEFAULT 20,
  nivel TEXT,                            -- iniciante, intermediario, avancado
  ativo BOOLEAN DEFAULT TRUE
);

-- Instrutores
CREATE TABLE instrutores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cref TEXT,                             -- Registro CREF
  especialidades TEXT[],
  email TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE instrutor_modalidades (
  instrutor_id UUID REFERENCES instrutores(id) ON DELETE CASCADE,
  modalidade_id UUID REFERENCES modalidades(id) ON DELETE CASCADE,
  PRIMARY KEY (instrutor_id, modalidade_id)
);

-- Aulas (grade fixa semanal)
CREATE TABLE aulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modalidade_id UUID NOT NULL REFERENCES modalidades(id),
  instrutor_id UUID NOT NULL REFERENCES instrutores(id),
  dia_semana INTEGER NOT NULL,           -- 0-6
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  vagas_max INTEGER NOT NULL,
  ativo BOOLEAN DEFAULT TRUE
);

-- Reservas em aula (vagas)
CREATE TABLE aula_reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id UUID NOT NULL REFERENCES aulas(id),
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  data DATE NOT NULL,                    -- aula daquele dia específico
  status TEXT DEFAULT 'reservada',       -- reservada, presente, faltou, cancelada
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aula_id, aluno_id, data)
);

-- Alunos
CREATE TABLE alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT,
  data_nascimento DATE,
  sexo TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  
  -- Saúde
  atestado_medico_url TEXT,
  atestado_medico_validade DATE,
  anamnese_completa BOOLEAN DEFAULT FALSE,
  observacoes_saude TEXT,                -- restrições, lesões
  
  -- Acesso
  matricula TEXT UNIQUE,
  data_inicio DATE,
  status TEXT DEFAULT 'ativo',           -- ativo, inativo, bloqueado_inadimplente
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, telefone)
);

-- Matrículas (plano contratado)
CREATE TABLE matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  plano_id UUID NOT NULL REFERENCES planos(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  valor_mensal NUMERIC(10,2) NOT NULL,
  forma_pagamento TEXT,                  -- pix_recorrente, cartao_recorrente, boleto
  status TEXT DEFAULT 'ativa',           -- ativa, cancelada, suspensa
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mensalidades (uma por mês)
CREATE TABLE mensalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id UUID NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  mes_referencia DATE NOT NULL,          -- 2026-06-01
  valor NUMERIC(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT DEFAULT 'pendente',        -- pendente, paga, atrasada
  forma_pagamento TEXT,
  link_pagamento TEXT
);

-- Avaliação física
CREATE TABLE avaliacoes_fisicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  instrutor_id UUID REFERENCES instrutores(id),
  data DATE NOT NULL,
  
  peso NUMERIC(5,2),
  altura NUMERIC(4,2),
  imc NUMERIC(5,2),
  percentual_gordura NUMERIC(5,2),
  
  -- Medidas (cm)
  braco NUMERIC(5,2),
  peito NUMERIC(5,2),
  cintura NUMERIC(5,2),
  quadril NUMERIC(5,2),
  coxa NUMERIC(5,2),
  
  observacoes TEXT,
  proxima_avaliacao DATE
);

-- Personal trainer (sessões 1:1)
CREATE TABLE sessoes_personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES alunos(id),
  instrutor_id UUID NOT NULL REFERENCES instrutores(id),
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  status TEXT DEFAULT 'agendada',
  observacoes_treino TEXT
);
```

### 16.3 Tools Específicas

```javascript
{
  name: 'mostrarPlanos',
  description: 'Lista planos disponíveis com preços.',
},
{
  name: 'verificarStatusAluno',
  description: 'Verifica se já é aluno (matrícula ativa, mensalidade em dia).',
},
{
  name: 'fazerMatricula',
  parameters: {
    properties: {
      planoId: { type: 'string' },
      formaPagamento: { type: 'string' },
    },
  },
},
{
  name: 'mostrarGradeAulas',
  description: 'Mostra grade da semana com modalidades, horários, instrutores.',
  parameters: {
    properties: {
      modalidade: { type: 'string' },
      diaSemana: { type: 'string' },
    },
  },
},
{
  name: 'reservarVagaAula',
  parameters: {
    properties: {
      aulaId: { type: 'string' },
      data: { type: 'string' },
    },
  },
},
{
  name: 'cancelarReservaAula',
  parameters: {
    properties: { reservaId: { type: 'string' } },
  },
},
{
  name: 'agendarPersonal',
  parameters: {
    properties: {
      instrutorId: { type: 'string' },
      data: { type: 'string' },
      hora: { type: 'string' },
    },
  },
},
{
  name: 'agendarAvaliacaoFisica',
  parameters: {
    properties: {
      data: { type: 'string' },
      hora: { type: 'string' },
    },
  },
},
{
  name: 'consultarMensalidade',
  description: 'Mostra status da mensalidade atual.',
},
{
  name: 'pagarMensalidade',
  description: 'Gera link de pagamento da mensalidade pendente.',
},
{
  name: 'enviarAtestadoMedico',
  description: 'Cliente quer enviar atestado. Coleta foto/PDF.',
},
```

### 16.4 System Prompt (Academia)

```
Você é a recepção virtual da ${academiaNome}.
Atende com motivação, energia positiva e profissionalismo.

🏥 SAÚDE / SEGURANÇA
- Atestado médico é OBRIGATÓRIO antes de treinar
- Não dê conselhos médicos ou nutricionais
- Encaminhe a profissional adequado se cliente reporta dor/lesão

🎯 MISSÃO
Apresentar planos, fazer matrículas.
Reservar vagas em aulas.
Agendar personal trainer / avaliação física.
Cobrar mensalidades pendentes.

✅ ESTILO
- Tom motivacional mas não exagerado
- Português brasileiro descontraído
- Use emojis (💪🏋️‍♀️🧘‍♀️🏃‍♂️)
- 1-2 frases por mensagem

🔄 FLUXOS
A. Novo aluno: planos → escolhe → matrícula → atestado → avaliação → começa
B. Reserva aula: grade → escolhe → reserva (verifica vaga + plano ativo)
C. Personal: agenda direto com instrutor (se plano inclui)
D. Mensalidade atrasada: avisa + link pagamento

💬 EXEMPLOS

Cliente: "quero saber sobre os planos"
✅ "Claro! 💪 Temos:
    🥉 Mensal — R$120/mês
    🥈 Trimestral — R$320 (R$107/mês, economia R$40)
    🥇 Anual — R$1080 (R$90/mês, economia R$360)
    Qualquer um inclui aulas + avaliação física. Qual te interessa?"

Cliente: "quero fazer yoga amanhã"
✅ "Olha as opções de amanhã:
    🧘 7h com Carla (8/15 vagas)
    🧘 19h com Marcos (12/15 vagas)
    Qual prefere?"

Cliente: "to com dor nas costas"
✅ "Importante avisar o instrutor antes da aula. Quer que eu agende uma 
    conversa com nosso fisio parceiro? Ele avalia melhor."

⚠️ NUNCA
- Diga que cliente pode treinar sem atestado
- Recomende treinos específicos sem instrutor
- Dê dieta/suplementação
```

### 16.5 Exemplos de Conversa

#### Cenário 1 — Matrícula novo aluno

```
Cliente: Oi, quero me matricular
Agente:  Oi! 💪 Bem-vindo. Olha nossos planos:
         🥉 Mensal — R$120
         🥈 Trimestral — R$320 (R$107/mês)
         🥇 Anual — R$1080 (R$90/mês)
         Todos com aulas + avaliação física inclusas. Qual?

Cliente: Trimestral
Agente:  Boa escolha! 💪 Forma de pagamento? PIX, cartão recorrente ou boleto?

Cliente: PIX
Agente:  Show. Pra finalizar:
         1. Qual seu nome completo?
         2. Data de nascimento?

Cliente: Carlos Souza, 15/03/1990
Agente:  Anotado.
         📋 Pra começar a treinar, precisamos:
         ✅ Atestado médico (de até 30 dias)
         ✅ Avaliação física (agendamos pra você gratuita)
         
         Você já tem atestado em mãos?

Cliente: Tenho
Agente:  Perfeito! Manda foto/PDF aqui mesmo. 
         E pra avaliação física, posso agendar com a Carla amanhã 8h?

Cliente: [envia foto do atestado]
         Pode amanhã 8h
Agente:  ✅ Atestado recebido (vou anexar ao seu cadastro).
         ✅ Avaliação física: Amanhã (23/06) às 8h com Carla.
         
         💰 Mensalidade Trimestral: R$320
         🔗 PIX: [link]
         
         Após pagar, sua matrícula é ativada. Bem-vindo! 🎉
```

#### Cenário 2 — Reserva de aula

```
Cliente: Tem yoga essa semana?
Agente:  Tem sim! 🧘 Olha:
         Seg 7h e 19h
         Qua 7h e 19h
         Sex 7h e 19h
         Qual dia/horário?

Cliente: Quarta 19h
Agente:  Quarta (24/06) 19h com Marcos. Tem 12/15 vagas. Reservo?

Cliente: Reserva
Agente:  ✅ Reservado! Te aviso 1h antes.
         💡 Pode chegar 10min antes pra alongar.
```

#### Cenário 3 — Mensalidade atrasada

```
Sistema: Oi Carlos! Sua mensalidade de junho está atrasada (venceu 15/06).
         Pra continuar treinando, paga aqui:
         🔗 [link PIX] R$120
         
Cliente: Já paguei
Agente:  Vou conferir... 👀 Encontrei o pagamento ✅ Liberado!
```

### 16.6 Validações Específicas

```javascript
// Acesso só com mensalidade em dia + atestado válido
async function podeTreinar(alunoId) {
  const { rows } = await query(`
    SELECT 
      a.atestado_medico_validade,
      a.status AS aluno_status,
      m.status AS mensalidade_status,
      m.data_vencimento
    FROM alunos a
    JOIN matriculas mat ON mat.aluno_id = a.id AND mat.status = 'ativa'
    LEFT JOIN mensalidades m ON m.matricula_id = mat.id 
      AND m.mes_referencia = DATE_TRUNC('month', CURRENT_DATE)
    WHERE a.id = $1
  `, [alunoId]);
  
  const a = rows[0];
  if (!a) return { ok: false, motivo: 'sem_matricula' };
  if (a.aluno_status === 'bloqueado_inadimplente') {
    return { ok: false, motivo: 'inadimplente' };
  }
  if (!a.atestado_medico_validade || new Date(a.atestado_medico_validade) < new Date()) {
    return { ok: false, motivo: 'atestado_vencido' };
  }
  if (a.mensalidade_status !== 'paga' && new Date(a.data_vencimento) < new Date()) {
    return { ok: false, motivo: 'mensalidade_atrasada' };
  }
  return { ok: true };
}

// Vaga atomic em aula
async function reservarVagaAtomic(aulaId, data, alunoId) {
  return await transaction(async (client) => {
    const { rows: [aula] } = await client.query(
      `SELECT vagas_max FROM aulas WHERE id = $1`,
      [aulaId]
    );
    
    const { rows: [{ count }] } = await client.query(
      `SELECT COUNT(*) FROM aula_reservas 
        WHERE aula_id = $1 AND data = $2 AND status = 'reservada'`,
      [aulaId, data]
    );
    
    if (parseInt(count) >= aula.vagas_max) {
      return { ok: false, motivo: 'aula_lotada' };
    }
    
    await client.query(
      `INSERT INTO aula_reservas (aula_id, aluno_id, data) 
       VALUES ($1, $2, $3)`,
      [aulaId, alunoId, data]
    );
    return { ok: true };
  });
}

// Atestado vencido?
async function atestadoValido(alunoId) {
  const { rows } = await query(
    `SELECT atestado_medico_validade FROM alunos WHERE id = $1`,
    [alunoId]
  );
  return rows[0]?.atestado_medico_validade > new Date();
}
```

### 16.7 Notificações Automáticas

| Tipo | Quando | Mensagem |
|---|---|---|
| Mensalidade | 5 dias antes | "Sua mensalidade vence em 5 dias. Link de pagamento: ..." |
| Mensalidade | No vencimento | "Sua mensalidade venceu hoje. Pague pra não bloquear acesso" |
| Mensalidade | 3 dias atraso | "Acesso será bloqueado em 2 dias se não pagar" |
| Atestado | 30 dias antes vencer | "Seu atestado vence em 30 dias. Renove pra continuar treinando" |
| Avaliação física | A cada 90 dias | "Hora da reavaliação física! Bora ver sua evolução?" |
| Lembrete aula | 1h antes | "Sua aula de yoga é em 1h. Te esperamos!" |
| Aniversário | No dia | "🎂 Parabéns! Treine forte hoje!" |
| Ausência | 7 dias sem ir | "Sentimos sua falta! Bora voltar?" |

### 16.8 Diferenças vs Barbearia

- **Mensalidade recorrente** (não pagamento por serviço)
- **Atestado médico obrigatório** (saúde)
- **Aulas em grupo com vagas** (concorrência)
- **Avaliação física periódica** (diferencial)
- **CREF** (instrutores regulamentados)
- **Inadimplência → bloqueio** (cartão de acesso)
- **Retenção é a maior métrica** (cliente que para de treinar)

---


# 📚 PARTE 4 — OPERACIONAL E LIÇÕES APRENDIDAS

## 🚀 CAPÍTULO 17 — DEPLOY (EasyPanel + Docker)

### 17.1 Por que EasyPanel?

- Painel administrativo simples (ao estilo cPanel)
- Deploy via Docker com 1 clique
- Reverse proxy + SSL automático (Let's Encrypt)
- Logs e métricas integradas
- Variáveis de ambiente via UI
- Custo baixo (VPS pequena já roda 5+ apps)
- Brasil-friendly (suporta provedores BR)

### 17.2 Pré-requisitos

- VPS Linux (Ubuntu 22.04+ recomendado)
- 2GB RAM mínimo (4GB ideal)
- Domínio apontando pro IP da VPS
- Conta GitHub com repo do projeto

### 17.3 Dockerfile do projeto

```dockerfile
# Dockerfile

FROM node:20-alpine

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci --only=production

# Copia código
COPY . .

# Porta exposta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Comando padrão
CMD ["npm", "start"]
```

### 17.4 docker-compose.yml (referência local)

```yaml
version: '3.9'

services:
  app:
    build: .
    container_name: agendapro
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - EVOLUTION_API_URL=${EVOLUTION_API_URL}
      - EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
      - PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
    volumes:
      - ./logs:/app/logs
```

### 17.5 Passo a passo no EasyPanel

#### 1. Instalar EasyPanel na VPS

```bash
# SSH na VPS
ssh root@SEU_IP

# Instalar Docker se não tiver
curl -fsSL https://get.docker.com | sh

# Instalar EasyPanel
curl -sSL https://get.easypanel.io | sh
```

#### 2. Acessar painel

- Abra `https://SEU_IP:3000` (ou domínio configurado)
- Crie conta admin

#### 3. Criar projeto

```
EasyPanel → Projects → + New Project
Nome: agendapro
```

#### 4. Adicionar PostgreSQL

```
+ Service → Database → PostgreSQL
Versão: 16
Nome: agendapro-db
Database: agendapro
User: agendapro
Password: [gerada]
```

Anote a connection string interna:
```
postgres://agendapro:senha@agendapro-db:5432/agendapro
```

#### 5. Adicionar app Node.js

```
+ Service → App
Nome: agendapro-app
Source: GitHub
Repository: seu-usuario/agendapro
Branch: main
Build Method: Dockerfile

Environment:
NODE_ENV=production
DATABASE_URL=postgres://agendapro:senha@agendapro-db:5432/agendapro
JWT_SECRET=[gerar com openssl rand -hex 32]
OPENAI_API_KEY=sk-proj-...
EVOLUTION_API_URL=https://...
EVOLUTION_API_KEY=...
PUBLIC_BASE_URL=https://app.seudominio.com.br
PORT=3000

Domains:
- app.seudominio.com.br (com Let's Encrypt automático)
```

#### 6. Adicionar Evolution API

```
+ Service → App
Nome: evolution-api
Source: Docker Image
Image: atendai/evolution-api:latest

Environment (mínimas):
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=[sua-chave-forte]
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgres://...

Volume:
/evolution/store

Domains:
- evolution.seudominio.com.br
```

### 17.6 Deploy automático via GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to EasyPanel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger EasyPanel rebuild
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.EASYPANEL_TOKEN }}" \
            -H "Content-Type: application/json" \
            "${{ secrets.EASYPANEL_URL }}/api/projects/agendapro/services/agendapro-app/redeploy"
```

### 17.7 Troubleshooting Deploy

| Problema | Solução |
|---|---|
| Build falha no EasyPanel | Verifique `package.json` está commitado (`package-lock.json` também) |
| `DATABASE_URL` inválida | Use o nome do serviço interno (`agendapro-db`), não `localhost` |
| 502 Bad Gateway | Aguarde 1-2min para healthcheck. Veja logs |
| SSL não emite | Domínio precisa apontar pro IP ANTES de configurar Let's Encrypt |
| Container reinicia infinitamente | Veja logs (`Logs` tab). Geralmente env var faltando |
| OpenAI 401 | Verifique se chave começa com `sk-proj-` ou `sk-` e está atualizada |
| Evolution não conecta | URL deve ser HTTPS, certificado deve estar válido |

### 17.8 Backup e segurança

```bash
# Backup PostgreSQL diário (rodar via cron)
docker exec agendapro-db pg_dump -U agendapro agendapro \
  | gzip > /backups/agendapro-$(date +%Y%m%d).sql.gz

# Reter 30 dias
find /backups -name "agendapro-*.sql.gz" -mtime +30 -delete
```

```bash
# Firewall mínimo (UFW)
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (redirect to HTTPS)
ufw allow 443/tcp    # HTTPS
ufw enable
```

---

## 📋 CAPÍTULO 18 — LIÇÕES APRENDIDAS (BUGS REAIS)

Esses são bugs **reais** que apareceram em produção e como foram resolvidos. Documentação importantíssima para não repetir os mesmos erros.

### 18.1 Bug do `@lid` (WhatsApp ID alternativo)

**Sintoma:**  
Mensagens chegam no webhook com `remoteJid` no formato `123456@lid` em vez de `5511999999999@s.whatsapp.net`. Sistema não conseguia identificar o cliente.

**Causa:**  
WhatsApp Web/Business usa LID (Local ID) como identificador alternativo em algumas situações (números privados, contatos secundários).

**Solução:**

```javascript
// Filtrar e normalizar telefone
function extrairTelefone(remoteJid) {
  if (!remoteJid) return null;
  
  // LID (não é número de telefone real)
  if (remoteJid.includes('@lid')) {
    console.log('⏭️  Ignorada: LID', remoteJid);
    return null;
  }
  
  // Grupo
  if (remoteJid.includes('@g.us')) return null;
  
  // Broadcast/Status
  if (remoteJid.includes('@broadcast')) return null;
  
  // Telefone normal
  const numero = remoteJid.split('@')[0].replace(/\D/g, '');
  return numero.length >= 10 ? numero : null;
}
```

### 18.2 Bug da alucinação (IA inventava horários)

**Sintoma:**  
IA confirmava horários que não existiam ou que estavam ocupados. Cliente chegava na barbearia e era informado que horário não existia.

**Causa:**  
GPT inventava informação quando não usava as tools (ou quando histórico tinha exemplos antigos).

**Solução:**

1. **System prompt explícito:**
```
⚠️ NUNCA INVENTE
- Preços, horários, profissionais, serviços
- Sempre use as TOOLS para buscar informação real
- Se não souber, diga "Vou verificar pra você" e use a tool
```

2. **Forçar tool calls em decisões críticas:**
```javascript
// Antes de criar agendamento, REVALIDAR via tool
async function confirmarAgendamento(state) {
  // Re-verifica disponibilidade ATÔMICA antes de criar
  const disponivel = await verificarDisponibilidade(
    state.profissionalId, 
    state.data, 
    state.horario
  );
  if (!disponivel) {
    return { erro: 'horario_ocupado_recentemente' };
  }
  // Só agora cria
}
```

3. **`temperature: 0.4`** (mais determinístico)

### 18.3 Bug do loop infinito (mesma tool 5x)

**Sintoma:**  
IA chamava `iniciarAgendamento` repetidamente. Cliente respondia "Antonio Rodrigues" e IA chamava `definirParaQuem` e `iniciarAgendamento` em loop. Mensagem de erro `⚠️ Limite de iterações`.

**Causa:**  
IA "esquecia" que tool já foi chamada e tentava de novo, sem progredir nos slots.

**Solução: Loop Detection + Slot Filling**

```javascript
// Em ai.js
const toolsChamadas = [];
let iteracoes = 0;

while (iteracoes < MAX_ITERACOES) {
  iteracoes++;
  
  const response = await openai.chat.completions.create({...});
  
  // Detecta loop: mesma tool 2x seguidas
  if (response.tool_calls) {
    const ultimaTool = toolsChamadas[toolsChamadas.length - 1];
    const novaTool = response.tool_calls[0].function.name;
    
    if (ultimaTool === novaTool) {
      console.log('🔁 Loop detectado, abortando');
      break;
    }
    
    toolsChamadas.push(novaTool);
  }
}
```

E o **Slot Filling Pattern** garante que cada slot só é preenchido uma vez. Se o slot já tem valor, a tool retorna mensagem indicando que pode pular.

### 18.4 Bug da idempotência (criava 2 agendamentos)

**Sintoma:**  
Cliente confirmava o agendamento, sistema criava DOIS registros idênticos. Comanda também duplicada.

**Causa:**  
IA chamava `confirmarAgendamento` duas vezes na mesma conversa (mensagem de confirmação chegou em duplicidade ou IA reapertou tool).

**Solução:**

```javascript
// Adicionar campo de "agendamento criado" no estado
async function confirmarAgendamento(state) {
  // Idempotência: se já criou nos últimos 5 min, retorna o mesmo
  if (state.agendamento_criado_id) {
    const minutosDesde = (Date.now() - state.agendamento_criado_em) / 60000;
    if (minutosDesde < 5) {
      return { 
        ok: true, 
        agendamentoId: state.agendamento_criado_id,
        ja_existia: true,
      };
    }
  }
  
  // Cria
  const ag = await criarAgendamento(state);
  
  // Salva no estado
  await salvarEstado(state.tenantId, state.telefone, {
    agendamento_criado_id: ag.id,
    agendamento_criado_em: Date.now(),
  });
  
  return { ok: true, agendamentoId: ag.id };
}
```

### 18.5 Bug do reset de estado (slot acumulava)

**Sintoma:**  
Cliente fazia agendamento, depois pedia outro, e dados antigos vinham misturados (horário antigo aparecia como "preferido").

**Causa:**  
Estado do slot filling ficava persistido após sucesso. Próximo agendamento começava com slots já preenchidos.

**Solução:**

```javascript
// Reset automático após sucesso
async function confirmarAgendamento(state) {
  const ag = await criarAgendamento(state);
  
  // RESETA o estado completamente
  await query(
    `UPDATE ai_conversas SET contexto = '{}' WHERE tenant_id = $1 AND telefone = $2`,
    [state.tenantId, state.telefone]
  );
  
  return { ok: true, agendamentoId: ag.id };
}
```

### 18.6 Bug da reconexão (queda de internet)

**Sintoma:**  
Internet cai por 5min, Evolution desconecta. Quando volta, instância fica em status `disconnected` e clientes mandam mensagem mas agente não responde.

**Causa:**  
WhatsApp Web não reconecta sozinho automaticamente. Evolution API mantém estado mas não tenta reconectar.

**Solução: 4 camadas de resiliência**

1. **Webhook detecta queda → reconecta em 30s:**
```javascript
if (event === 'connection.update' && data?.state === 'close') {
  setTimeout(() => reconectarInstanciaSilencioso(tenantId), 30000);
}
```

2. **Scheduler verifica todas as instâncias a cada 5min:**
```javascript
// scheduler.js
async function verificarInstancias() {
  const { rows } = await query(`
    SELECT tenant_id FROM whatsapp_config 
     WHERE session_status IN ('disconnected', 'connecting')
  `);
  for (const row of rows) {
    await reconectarInstanciaSilencioso(row.tenant_id);
  }
}
setInterval(verificarInstancias, 5 * 60 * 1000);
```

3. **Boot do servidor reconecta tudo:**
```javascript
// server.js (após app.listen)
setTimeout(async () => {
  await reconectarTodasOffline();
}, 5000);
```

4. **Rota manual:**
```javascript
router.post('/api/whatsapp/reconectar/:tenantId', requireAuth, async (req, res) => {
  const result = await reconectarInstanciaSilencioso(req.params.tenantId);
  res.json(result);
});
```

### 18.7 Bug do tom robótico (IA muito seca)

**Sintoma:**  
Atendimento sem nenhuma humanidade. Cliente reclamava que "parecia um robô burro".

**Exemplos do bug:**
```
Cliente: Boa tarde
Bot: Boa tarde! Como posso ajudar?
Cliente: Quero cortar cabelo
Bot: Qual seu nome completo?
Cliente: Antonio
Bot: Qual serviço?
```

**Solução: System prompt com exemplos ❌/✅**

```
✅ ESTILO DE RESPOSTA
- Use português brasileiro natural
- 1-2 frases por mensagem (NUNCA mais que 3)
- Toques permitidos: "Claro", "Beleza", "Show", "Anotado", "Perfeito"
- Use o nome do cliente quando fizer sentido

💬 EXEMPLOS

Cliente: "quero cortar cabelo"
✅ Bom: "Beleza! Pra começar, qual seu nome?"
❌ Ruim: "Olá! Compreendi que você gostaria de agendar um corte. Por favor, informe seu nome completo."

Cliente: "amanhã às 15h"
✅ Bom: "Deixa eu ver... 15h tá livre com o LUIZ ✅. Confirma?"
❌ Ruim: "Verifiquei a disponibilidade do profissional para o horário das 15:00 do dia seguinte e confirmo que está disponível."
```

E `temperature: 0.4` (não 0.0 — precisa de variação).

### 18.8 Bug da listagem de horários (confusa)

**Sintoma:**  
Quando cliente pedia horário, IA listava 30+ horários disponíveis. Cliente se perdia.

**Solução: Pergunta direcionada**

Em vez de:
```
❌ "Temos 9h, 9h30, 10h, 10h30, 11h, 11h30, 14h, 14h30, 15h, 15h30, 16h, 16h30..."
```

Faça:
```
✅ "Qual horário fica bom pra você?"
   Cliente: "15h"
   ✅ "15h tá livre ✅" 
   ou
   ✅ "15h tá ocupado. Tem 14h30, 15h30 ou 16h. Qual prefere?"
```

Tool `verificarHorarioEspecifico` retorna 3 sugestões próximas se o horário pedido estiver ocupado.

### 18.9 Bug da comanda não criada

**Sintoma:**  
Agendamento criado mas comanda (registro financeiro) não. No fechamento do dia, faltava receita.

**Causa:**  
Lógica de criação separada — se a query do agendamento falhasse parcialmente, a comanda não chegava a ser criada.

**Solução: Transação atômica**

```javascript
async function confirmarAgendamento(state) {
  return await transaction(async (client) => {
    // 1. Cria agendamento
    const { rows: [ag] } = await client.query(`
      INSERT INTO agendamentos (...) VALUES (...) RETURNING *
    `, [...]);
    
    // 2. Cria comanda JUNTO
    const { rows: [comanda] } = await client.query(`
      INSERT INTO comandas (
        tenant_id, agendamento_id, cliente_id, profissional_id, status
      ) VALUES ($1, $2, $3, $4, 'aberta') RETURNING *
    `, [tenantId, ag.id, ag.cliente_id, ag.profissional_id]);
    
    // 3. Adiciona item da comanda
    await client.query(`
      INSERT INTO comanda_itens (
        comanda_id, servico_id, descricao, preco_unitario, total
      ) VALUES ($1, $2, $3, $4, $5)
    `, [comanda.id, ag.servico_id, servicoNome, preco, preco]);
    
    return { agendamento: ag, comanda };
  });
}
```

### 18.10 Bug do push protection (secrets no git)

**Sintoma:**  
GitHub bloqueava push porque tinha API key em `.env.example`.

**Solução:**

1. Nunca commit chaves reais. `.env.example` só com placeholders:
```
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXX
JWT_SECRET=GERAR_COM_OPENSSL
```

2. `.gitignore` rigoroso:
```
.env
.env.local
.env.production
.env.vps
*.pem
*.key
secrets/
```

3. Se já vazou: girar a chave imediatamente no provedor (OpenAI dashboard, etc).

---

## ✅ CAPÍTULO 19 — CHECKLIST DE IMPLEMENTAÇÃO

Use esta lista ao iniciar um projeto novo em qualquer nicho.

### 19.1 Setup Inicial

- [ ] Criar repositório Git (GitHub/GitLab)
- [ ] `package.json` com dependências base (express, pg, openai, axios, jsonwebtoken)
- [ ] `.gitignore` configurado (node_modules, .env, logs)
- [ ] `.env.example` com placeholders (sem secrets reais)
- [ ] `README.md` básico
- [ ] Estrutura de pastas:
  ```
  /server
    /config
    /db
    /middleware
    /routes
    /services
    server.js
  /public
  ```

### 19.2 Banco de Dados

- [ ] PostgreSQL acessível (Supabase, EasyPanel, RDS, etc)
- [ ] `schema.sql` com tabelas multi-tenant (`tenant_id` em TODAS)
- [ ] Migrações automáticas no boot (`migrate.js`)
- [ ] Seeds para desenvolvimento
- [ ] Índices nas colunas filtradas com frequência
- [ ] Foreign keys com `ON DELETE` apropriado
- [ ] Trigger `updated_at` em tabelas que mudam

### 19.3 Multi-Tenancy

- [ ] Tabela `tenants` (cada cliente do SaaS)
- [ ] Middleware que injeta `tenant_id` em todas queries
- [ ] JWT com `tenant_id` no payload
- [ ] Testes: usuário do tenant A NUNCA acessa dados do tenant B

### 19.4 Autenticação e Autorização

- [ ] Cadastro com hash de senha (bcrypt, mínimo 10 rounds)
- [ ] Login retorna JWT (expira em 7 dias)
- [ ] Refresh token (opcional, 30 dias)
- [ ] Middleware `requireAuth` + `requireRole`
- [ ] Logout (blacklist token ou cookie clear)
- [ ] Recuperação de senha por email
- [ ] Rate limiting em rotas de auth (login, register)

### 19.5 Evolution API + WhatsApp

- [ ] Evolution API rodando (Docker próprio ou serviço)
- [ ] Cada tenant tem instância isolada (criada no cadastro)
- [ ] Webhook configurado para `messages.upsert` + `connection.update`
- [ ] QR Code endpoint (frontend pode mostrar)
- [ ] Status connected/disconnected sincronizado
- [ ] Reconexão automática (4 camadas: webhook, scheduler, boot, manual)
- [ ] Filtros: ignorar grupos, broadcasts, LID, fromMe

### 19.6 Agente IA (Slot Filling)

- [ ] Tabela `ai_conversas` com `historico` e `contexto` JSONB
- [ ] Lista de slots por nicho (ex: cliente, servico, profissional, data, horario)
- [ ] Tools especializadas (1 tool por slot + tools de listagem)
- [ ] System prompt com:
  - [ ] Missão clara
  - [ ] Estilo (✅/❌ com exemplos)
  - [ ] Slots preenchidos visíveis no prompt
  - [ ] Regra de ouro: "pergunte só o próximo slot"
- [ ] Loop detection (mesma tool 2x = aborta)
- [ ] Limite de iterações (10 max)
- [ ] Idempotência (não criar duplicado em 5min)
- [ ] Reset automático após sucesso
- [ ] `temperature: 0.4`, `max_tokens: 600`

### 19.7 Notificações Automáticas

- [ ] Scheduler rodando (`setInterval` ou cron)
- [ ] Verificações idempotentes (coluna `enviado_em`)
- [ ] Lembrete antes do compromisso
- [ ] Confirmação 24h antes (clínica, advocacia)
- [ ] Pós-atendimento (avaliação)
- [ ] Retorno automático (barbearia, salão)
- [ ] Aniversário do cliente (se aplicável)

### 19.8 Frontend

- [ ] Página de login responsiva
- [ ] Onboarding (criar tenant + admin + dados iniciais)
- [ ] Dashboard mobile-first
- [ ] CRUD de:
  - Profissionais/instrutores/médicos
  - Serviços/produtos/imóveis
  - Clientes/pacientes/leads
  - Agendamentos/pedidos/visitas
- [ ] Status WhatsApp + QR Code
- [ ] Conversas (chat com cliente, histórico IA)
- [ ] Relatórios básicos (financeiro, ocupação)
- [ ] Configurações (horários, dados da empresa)

### 19.9 Operacional

- [ ] Logs estruturados (`console.log` com prefixos visuais)
- [ ] Healthcheck `/api/health`
- [ ] Tratamento de erros global (`unhandledRejection`)
- [ ] Backup diário do banco
- [ ] Monitoramento (UptimeRobot, BetterUptime, etc)
- [ ] Domínio + SSL (Let's Encrypt automático)
- [ ] Variáveis de ambiente seguras (não no código)

### 19.10 Segurança

- [ ] Rate limiting (express-rate-limit)
- [ ] Helmet middleware
- [ ] CORS configurado adequadamente
- [ ] SQL injection: SEMPRE parametrized queries
- [ ] XSS: escape de HTML em todas saídas
- [ ] CSRF: tokens em formulários
- [ ] LGPD: termo de consentimento, anonimização em logs, exportação/exclusão de dados
- [ ] Senhas: bcrypt 10+ rounds
- [ ] Secrets em vault ou env vars (nunca no git)
- [ ] Auditoria: log de quem acessou o quê

---

## 🛠️ CAPÍTULO 20 — TROUBLESHOOTING

Problemas comuns e como resolver.

### 20.1 Agente IA não responde

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| Mensagem chega no webhook mas não responde | Cliente checa logs `🤖 PROCESSAR MENSAGEM` | Veja se aparece. Se não, problema é no webhook handler |
| Aparece "IA desabilitada para esta barbearia" | Coluna `ai_enabled = false` no tenant | `UPDATE tenants SET ai_enabled = true WHERE id = ?` |
| Erro `OPENAI_API_KEY não configurada` | Env var faltando | Configure no EasyPanel/`.env` |
| Resposta vazia | OpenAI retornou sem texto | Cliente fez algo estranho. Loga `response` completa |
| Demora 30s+ | Slow query no DB ou latência OpenAI | Adicione índices, use `gpt-4o-mini` |

### 20.2 Mensagens não enviadas via Evolution

| Sintoma | Solução |
|---|---|
| `Erro 401 Unauthorized` | API key incorreta ou expirada |
| `Erro 404 Not Found` | Nome da instância errado ou instância não existe |
| `Connection state: close` | WhatsApp desconectou. Use rota `/reconectar` ou QR novo |
| `Number is not a WhatsApp number` | Validar formato (DDI+DDD+número) |
| Funciona local mas não em produção | URL Evolution deve ser HTTPS, certificado válido |

### 20.3 Banco de dados

| Sintoma | Solução |
|---|---|
| `Connection refused` | DB não está rodando ou hostname errado |
| `Too many connections` | Aumentar `max` no pool ou pool exhaustion |
| Query lenta | Adicione índices: `CREATE INDEX ON tabela (coluna_filtrada)` |
| `Duplicate key violation` | Use `ON CONFLICT DO NOTHING` ou `ON CONFLICT UPDATE` |
| Timezone errado | Definir `TZ=America/Sao_Paulo` em env vars |

### 20.4 Loop de tools / IA não progride

```
🔧 iniciarAgendamento {}
🔧 definirParaQuem {"tipo":"proprio_cliente"}
🔧 iniciarAgendamento {}
🔧 definirParaQuem {"tipo":"proprio_cliente"}
⚠️ Limite de iterações
```

**Causa:** IA não vê slot já preenchido OU prompt confuso.

**Solução:**
1. No system prompt, mostre slots preenchidos:
```
Slots preenchidos: ${JSON.stringify(slotsPreenchidos)}
Próximo: ${slotsPendentes[0]}
REGRA: Não chame tool de slot já preenchido.
```

2. Tools devem verificar se slot já preenchido:
```javascript
async function definirParaQuem(state, params) {
  if (state.paraQuem) {
    return { ja_definido: true, valor: state.paraQuem };
  }
  // ...
}
```

3. Loop detection já implementado deve cortar.

### 20.5 Performance / Custos

| Problema | Solução |
|---|---|
| Custo OpenAI alto | Use `gpt-4o-mini` (95% mais barato que `gpt-4`) |
| Histórico grande gera tokens | Limite a últimas 20 mensagens |
| Muitas tools = mais tokens | Só passe tools relevantes ao slot atual |
| Latência alta | Cache de listagens (serviços, profissionais) |
| DB com 1M+ registros lento | Particionamento por `tenant_id` |

### 20.6 Erros de Cadastro / Onboarding

| Sintoma | Solução |
|---|---|
| Cadastro falha após criar tenant | Transação não está abrangindo tudo. Use `BEGIN/COMMIT` |
| Instância Evolution não cria | Veja se URL/key Evolution corretas. Cota da Evolution? |
| "Email já existe" mas usuário não lembra | Resetar senha por email, não recriar |
| QR code não aparece | Frontend está consumindo `data:image/png;base64,...`? |

### 20.7 Webhook não chega

```bash
# Debug: ver se Evolution recebe seu webhook URL
curl https://evolution.seudominio.com/instance/fetchInstances \
  -H "apikey: SUA_API_KEY"
```

| Sintoma | Solução |
|---|---|
| Webhook configurado mas não chega | Verifique se URL é HTTPS pública (não localhost) |
| Erro CORS no webhook | Use `cors()` middleware |
| `Cannot POST /webhook/evolution/:tenantId` | Rota não está registrada. Verifique `server.js` |
| Webhook chega mas ignora | Veja filtros (`fromMe`, grupos, LID) |

### 20.8 Comandos úteis para debug

```bash
# Ver logs do app (EasyPanel)
docker logs agendapro-app --tail 200 -f

# Ver logs do PostgreSQL
docker logs agendapro-db --tail 200

# Conectar no banco
docker exec -it agendapro-db psql -U agendapro

# Listar tenants
SELECT id, nome, plano, ativo FROM tenants;

# Ver mensagens recentes
SELECT t.nome, c.telefone, c.historico
  FROM ai_conversas c
  JOIN tenants t ON t.id = c.tenant_id
 ORDER BY c.updated_at DESC
 LIMIT 10;

# Ver agendamentos do dia
SELECT a.id, c.nome AS cliente, p.nome AS prof, s.nome AS servico, a.data, a.hora_inicio
  FROM agendamentos a
  JOIN clientes c ON c.id = a.cliente_id
  JOIN profissionais p ON p.id = a.profissional_id
  JOIN servicos s ON s.id = a.servico_id
 WHERE a.data = CURRENT_DATE
 ORDER BY a.hora_inicio;

# Status das instâncias Evolution
SELECT t.nome, w.session_status, w.evolution_instance_name
  FROM tenants t
  JOIN whatsapp_config w ON w.tenant_id = t.id
 ORDER BY t.nome;
```

---

# 🎓 CONCLUSÃO

Esse é o blueprint completo para criar SaaS conversacional multi-tenant em qualquer nicho. Cada peça foi forjada com bugs reais, soluções testadas em produção e padrões que evitam armadilhas conhecidas (alucinação, loops, idempotência, LGPD).

**Para começar um projeto novo:**

1. Escolha o nicho mais próximo (capítulos 9-16)
2. Adapte o schema SQL
3. Defina os slots do agente para esse nicho
4. Implemente as tools especializadas
5. Customize o system prompt (copie/adapte do exemplo)
6. Configure Evolution API + scheduler
7. Deploy via EasyPanel
8. Use o Checklist do Capítulo 19 para não esquecer nada
9. Quando bater problema, consulte Capítulo 20

**Stack consolidada:**
- Node.js puro (Express + ES modules)
- PostgreSQL (Supabase ou self-hosted)
- OpenAI GPT-4o-mini com Tools API
- Evolution API para WhatsApp
- Slot Filling Pattern customizado
- EasyPanel + Docker para deploy

**Princípios fundamentais:**
- **Multi-tenancy é fundação** — `tenant_id` em tudo, isolamento por design
- **Slot Filling > Histórico de conversa** — checklist interno é à prova de erros
- **Tools são fonte da verdade** — IA não inventa, busca real
- **Idempotência salva** — não criar duplicados
- **Reconexão multicamada** — internet cai, sistema continua
- **Tom natural mas conciso** — nem robô frio, nem enrolão
- **LGPD desde o dia 1** — não é opcional

Esse arquivo evolui. Cada bug novo encontrado, documente. Cada nicho novo, adicione um capítulo. O conhecimento é o ativo.

---

**Documento gerado em:** Junho 2026  
**Stack base:** Node.js 20 + PostgreSQL 16 + OpenAI gpt-4o-mini + Evolution API v2  
**Licença:** Uso interno / referência pessoal
