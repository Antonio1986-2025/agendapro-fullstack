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
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS notificar_whatsapp BOOLEAN DEFAULT true;

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
    provider VARCHAR(30) DEFAULT 'log',         -- log | meta_cloud
    phone_number_id VARCHAR(120),
    access_token TEXT,
    verify_token VARCHAR(120),
    enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- log de mensagens WhatsApp ----------
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbearia_id UUID NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
    agendamento_id UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
    telefone VARCHAR(30) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo VARCHAR(40) DEFAULT 'confirmacao',     -- confirmacao | lembrete | manual | recebida
    status VARCHAR(30) DEFAULT 'enviada',       -- enviada | erro | recebida
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
