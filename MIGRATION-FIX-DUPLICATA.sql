-- ============================================================
-- MIGRATION: Adiciona proteção anti-duplicata de confirmações
-- ============================================================
-- Data: 2026-06-22
-- Bug: Mensagens de confirmação duplicadas após cancelamento
-- Solução: Adiciona coluna confirmacao_enviada_em para rastrear envios

-- Adiciona coluna se não existir
ALTER TABLE agendamentos 
ADD COLUMN IF NOT EXISTS confirmacao_enviada_em TIMESTAMPTZ;

-- Comentário na coluna
COMMENT ON COLUMN agendamentos.confirmacao_enviada_em IS 
'Timestamp do envio da mensagem de confirmação ao cliente. Usado para evitar duplicatas.';

-- Verificação
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'agendamentos'
  AND column_name = 'confirmacao_enviada_em';

COMMIT;
