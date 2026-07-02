-- ============================================================
-- AGENDAPRO SAAS - SCHEMA MULTI-TENANT
-- Cada barbearia (tenant) tem seus proprios dados isolados
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- TENANT: barbearias ----------
CREATE TABLE IF NOT EXISTS barbearias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,          -- usado na URL publica de agendamento
    telefone VARCHAR(30),
    email VARCHAR(255),
    endereco TEXT,
    plano VARCHAR(50) DEFAULT 'free',
    -- janelas de funcionamento padrao (JSON)
    horario_config JSONB DEFAULT '{
        "manha": {"inicio": "07:30", "fim": "11:00"},
        "tarde": {"inicio": "13:00", "fim": "19:00"},
        "especial": {"inicio": "19:00", "fim": "21:00", "acrescimo_percent": 50},
        "intervalo_minutos": 30
    }'::jsonb,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garante colunas novas em bancos já existentes (idempotente)
ALTER TABLE barbearias ADD COLUMN IF NOT EXISTS horario_especial_ativo BOOLEAN DEFAULT false;

-- ---------- usuarios (contas de login: dono / staff) ----------
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'owner',           -- owner | admin | staff
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- profissionais (barbeiros) ----------
CREATE TABLE IF NOT EXISTS profissionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    especialidade VARCHAR(120),
    telefone VARCHAR(30),
    avatar_inicial VARCHAR(2),
    notificar_whatsapp BOOLEAN DEFAULT true,
    ativo BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garante colunas novas em bancos ja existentes (idempotente)
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS telefone VARCHAR(30);
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS eh_responsavel BOOLEAN DEFAULT false;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS notificar_whatsapp BOOLEAN DEFAULT true;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS comissao_servico_percentual DECIMAL(5,2) DEFAULT 0;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS comissao_produto_percentual DECIMAL(5,2) DEFAULT 0;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS data_contratacao DATE;
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{"clientes":true,"comandas":true,"gerenciar_agenda":false,"relatorios":false,"caixa":false,"estoque":false,"servicos":false,"horarios":false,"configuracoes":false,"cancelar_agendamento":false}';

-- ---------- COMANDA ----------
CREATE SEQUENCE IF NOT EXISTS comandas_numero_seq START 1;

CREATE TABLE IF NOT EXISTS comandas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    agendamento_id UUID,
    numero INTEGER NOT NULL DEFAULT nextval('comandas_numero_seq'),
    cliente_id UUID,
    cliente_nome VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'aberta',           -- aberta | finalizada | cancelada
    valor DECIMAL(10,2) DEFAULT 0,
    forma_pagamento VARCHAR(30),
    troco DECIMAL(10,2),
    valor_recebido DECIMAL(10,2),
    abertura TIMESTAMPTZ DEFAULT now(),
    fechamento TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comanda_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comanda_id UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    profissional_id UUID REFERENCES profissionais(id) ON DELETE SET NULL,
    tipo VARCHAR(30) DEFAULT 'servico',           -- servico | produto
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comanda_itens ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1;

-- ---------- CAIXA ----------
CREATE TABLE IF NOT EXISTS caixa_registros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    valor_inicial DECIMAL(10,2) DEFAULT 0,
    valor_final DECIMAL(10,2),
    abertura TIMESTAMPTZ DEFAULT now(),
    fechamento TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'aberto',           -- aberto | fechado
    responsavel VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (barbearia_id, data)
);

CREATE TABLE IF NOT EXISTS caixa_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caixa_id UUID NOT NULL REFERENCES caixa_registros(id) ON DELETE CASCADE,
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL,                     -- entrada | saida
    descricao TEXT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    forma_pagamento VARCHAR(30),
    comanda_id UUID REFERENCES comandas(id) ON DELETE SET NULL,
    hora TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- comissoes ----------
CREATE TABLE IF NOT EXISTS comissoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    comanda_id UUID REFERENCES comandas(id) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL,                  -- servico | produto
    descricao VARCHAR(255) NOT NULL,
    valor_item DECIMAL(10,2) NOT NULL,
    percentual DECIMAL(5,2) NOT NULL,
    valor_comissao DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente',      -- pendente | pago
    pago_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_profissional ON comissoes(profissional_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON comissoes(status);

-- ---------- acertos ----------
CREATE TABLE IF NOT EXISTS acertos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    valor_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comissoes ADD COLUMN IF NOT EXISTS acerto_id UUID REFERENCES acertos(id) ON DELETE SET NULL;

-- ---------- servicos ----------
CREATE TABLE IF NOT EXISTS servicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(120),
    duracao_minutos INTEGER NOT NULL DEFAULT 30,
    preco DECIMAL(10,2) NOT NULL DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- clientes ----------
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    observacoes TEXT,
    total_visitas INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (barbearia_id, telefone)
);

-- ---------- agendamentos ----------
CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    servico_id UUID REFERENCES servicos(id) ON DELETE SET NULL,
    data_hora TIMESTAMP NOT NULL,
    duracao_minutos INTEGER NOT NULL DEFAULT 30,
    preco DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_especial BOOLEAN DEFAULT false,
    status VARCHAR(30) DEFAULT 'agendado',      -- agendado | confirmado | concluido | cancelado
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Converte data_hora para TIMESTAMP sem fuso (relogio de parede) em bancos existentes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'agendamentos' AND column_name = 'data_hora'
       AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE agendamentos
      ALTER COLUMN data_hora TYPE TIMESTAMP
      USING (data_hora AT TIME ZONE 'America/Sao_Paulo');
  END IF;
END $$;

ALTER TABLE comandas ADD COLUMN IF NOT EXISTS agendamento_id UUID;
ALTER TABLE comandas ADD FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE SET NULL;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cliente_id UUID;
ALTER TABLE comandas ADD FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;

-- ---------- horarios especiais por profissional ----------
CREATE TABLE IF NOT EXISTS horarios_especiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    horario VARCHAR(5) NOT NULL,                -- ex "19:00"
    ativo BOOLEAN DEFAULT true,
    UNIQUE (profissional_id, horario)
);

-- ---------- configuracao WhatsApp por barbearia ----------
CREATE TABLE IF NOT EXISTS whatsapp_config (
    barbearia_id UUID PRIMARY KEY REFERENCES barbearias(id) ON DELETE CASCADE,
    provider VARCHAR(30) DEFAULT 'log',         -- log | openwa
    phone_number_id VARCHAR(120),
    access_token TEXT,
    verify_token VARCHAR(120),
    enabled BOOLEAN DEFAULT false,
    -- OpenWA session
    openwa_session_name VARCHAR(120),
    openwa_url VARCHAR(255),
    openwa_api_key VARCHAR(255),
    session_status VARCHAR(30) DEFAULT 'disconnected', -- disconnected | connecting | connected
    updated_at TIMESTAMPTZ DEFAULT now(),
    ai_enabled BOOLEAN DEFAULT false,
    ai_prompt TEXT
);

-- ---------- log de mensagens WhatsApp ----------
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    agendamento_id UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
    telefone VARCHAR(30) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo VARCHAR(30) DEFAULT 'manual',          -- confirmacao|lembrete|manual|novo_agendamento_barbeiro|recebida|lembrete_30min|retorno_20dias
    status VARCHAR(30) DEFAULT 'enviada',       -- enviada|erro|recebida
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- conversas do agente IA ----------
CREATE TABLE IF NOT EXISTS ai_conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    cliente_telefone VARCHAR(30) NOT NULL,
    historico JSONB DEFAULT '[]',
    contexto JSONB DEFAULT '{}',
    ultima_interacao TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(barbearia_id, cliente_telefone)
);

-- ---------- TRANSAÇÕES (Financeiro geral) ----------
CREATE TABLE IF NOT EXISTS transacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL,                     -- entrada | saida
    categoria VARCHAR(120) NOT NULL,
    descricao TEXT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    forma_pagamento VARCHAR(30),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    observacao TEXT,
    comanda_id UUID REFERENCES comandas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- ESTOQUE ----------
CREATE TABLE IF NOT EXISTS estoque_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    unidade VARCHAR(30) DEFAULT 'un',
    quantidade DECIMAL(10,2) DEFAULT 0,
    minimo DECIMAL(10,2) DEFAULT 0,
    custo DECIMAL(10,2) DEFAULT 0,
    preco_venda DECIMAL(10,2) DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estoque_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES estoque_itens(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL,                     -- entrada | saida | consumo | ajuste
    quantidade DECIMAL(10,2) NOT NULL,
    motivo TEXT,
    profissional_id UUID REFERENCES profissionais(id) ON DELETE SET NULL,
    comanda_id UUID REFERENCES comandas(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- INDICES ----------
CREATE INDEX IF NOT EXISTS idx_usuarios_barbearia ON usuarios(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_profissionais_barbearia ON profissionais(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_servicos_barbearia ON servicos(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_barbearia ON clientes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbearia ON agendamentos(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_prof ON agendamentos(profissional_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_barbearia ON whatsapp_mensagens(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_comandas_barbearia ON comandas(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);
CREATE INDEX IF NOT EXISTS idx_comanda_itens_comanda ON comanda_itens(comanda_id);
CREATE INDEX IF NOT EXISTS idx_caixa_barbearia ON caixa_registros(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_caixa_data ON caixa_registros(data);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_caixa ON caixa_movimentos(caixa_id);

-- Coluna pra vincular usuario staff ao profissional
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES profissionais(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transacoes_barbearia ON transacoes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_estoque_barbearia ON estoque_itens(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_item ON estoque_movimentos(item_id);

-- Migracoes para tabelas existentes (add column if not exists)
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS session_status VARCHAR(30) DEFAULT 'disconnected';
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS openwa_session_name VARCHAR(120);
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS openwa_url VARCHAR(255);
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS openwa_api_key VARCHAR(255);
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS ai_prompt TEXT;

-- QR Code para conexão Baileys
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS qr_code_expira_em TIMESTAMPTZ;

-- Controle de notificações automáticas em agendamentos
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS notificacao_barbeiro_enviada_em TIMESTAMPTZ;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS confirmacao_enviada_em TIMESTAMPTZ;

-- Controle de mensagem de retorno (20 dias depois) - por cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ultimo_servico_em TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS retorno_enviado_em TIMESTAMPTZ;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger para atualizar updated_at automaticamente em clientes
CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clientes_updated_at ON clientes;
CREATE TRIGGER trg_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_updated_at();

-- ---------- solicitacoes_especiais (serviços não catalogados) ----------
CREATE TABLE IF NOT EXISTS solicitacoes_especiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    servico_solicitado TEXT NOT NULL,
    observacoes TEXT,
    status VARCHAR(30) DEFAULT 'pendente',      -- pendente | contatado | resolvido | cancelado
    responsavel_contatou_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_barbearia ON solicitacoes_especiais(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_especiais(status);

-- ---------- BLOQUEIOS (barbeiro bloqueia horarios livres) ----------
CREATE TABLE IF NOT EXISTS bloqueios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    data_hora TIMESTAMP NOT NULL,
    duracao_minutos INTEGER NOT NULL DEFAULT 30,
    motivo VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bloqueios_barbearia ON bloqueios(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_prof_data ON bloqueios(profissional_id, data_hora);

