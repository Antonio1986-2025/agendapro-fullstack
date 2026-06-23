# 🚀 Como Aplicar o Fix de Duplicata de Confirmações

## ⚡ QUICK START (3 passos)

### 1️⃣ Atualizar o Banco de Dados

Conecte no banco e rode:

```sql
ALTER TABLE agendamentos 
ADD COLUMN IF NOT EXISTS confirmacao_enviada_em TIMESTAMPTZ;
```

**OU** use o script pronto:

```bash
psql -h SEU_HOST -U SEU_USER -d SEU_DB -f MIGRATION-FIX-DUPLICATA.sql
```

### 2️⃣ Atualizar o Código

O código já está atualizado no repositório. Se estiver em produção:

```bash
# Fazer pull das mudanças
git pull origin main

# Verificar se todos os arquivos foram atualizados
git status
```

### 3️⃣ Reiniciar o Servidor

```bash
# Desenvolvimento
npm run dev

# Produção (PM2)
pm2 restart app

# Produção (Docker)
docker-compose down && docker-compose up -d
```

---

## 🧪 TESTAR A CORREÇÃO

### Teste 1: Cancelamento Normal

1. Criar agendamento via WhatsApp
2. Cancelar o agendamento
3. **Verificar**: Apenas 1 mensagem de cancelamento (sem confirmações depois)

### Teste 2: Múltiplas Alterações de Status

1. Criar agendamento pelo painel admin
2. Mudar status para "confirmado" → Cliente recebe confirmação
3. Mudar status para "agendado" e depois "confirmado" novamente
4. **Verificar**: Cliente recebe apenas 1 confirmação (na 1ª vez)

### Teste 3: Verificar Logs

```bash
# Ver logs em tempo real
pm2 logs app --lines 100

# Procurar por proteção anti-duplicata
grep "ANTI-DUPLICATA" logs/app.log
```

Você deve ver logs como:

```
📝 [PATCH /status] ID: abc123 | Status ANTERIOR: agendado → NOVO: confirmado
📤 Enviando confirmação para 5567991234567
```

Ou:

```
📝 [PATCH /status] ID: abc123 | Status ANTERIOR: confirmado → NOVO: confirmado
⏭️  [ANTI-DUPLICATA] Status já era "confirmado", não reenvia confirmação
```

---

## 🔧 ROLLBACK (se necessário)

Se algo der errado, você pode reverter:

```bash
# Reverter código
git revert c721a71

# Remover coluna do banco (opcional)
# ALTER TABLE agendamentos DROP COLUMN IF EXISTS confirmacao_enviada_em;

# Reiniciar servidor
pm2 restart app
```

---

## 📊 MONITORAMENTO

### Verificar se Fix Está Ativo

```sql
-- Verificar se coluna existe
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'agendamentos' 
  AND column_name = 'confirmacao_enviada_em';

-- Ver agendamentos com confirmação enviada
SELECT id, data_hora, status, confirmacao_enviada_em
FROM agendamentos
WHERE confirmacao_enviada_em IS NOT NULL
ORDER BY confirmacao_enviada_em DESC
LIMIT 10;
```

### Verificar Duplicatas (debugging)

```sql
-- Ver mensagens de confirmação enviadas nos últimos 7 dias
SELECT 
  telefone, 
  COUNT(*) as total_confirmacoes,
  array_agg(created_at ORDER BY created_at) as timestamps
FROM whatsapp_mensagens
WHERE tipo = 'confirmacao'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY telefone
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
```

---

## ✅ CHECKLIST DE VALIDAÇÃO

- [ ] Coluna `confirmacao_enviada_em` existe na tabela `agendamentos`
- [ ] Código atualizado com proteção anti-duplicata
- [ ] Servidor reiniciado
- [ ] Teste de cancelamento passou (sem duplicatas)
- [ ] Logs mostram `[ANTI-DUPLICATA]` quando necessário
- [ ] Nenhum erro nos logs após deploy

---

## 🆘 TROUBLESHOOTING

### Problema: Coluna não foi criada

```sql
-- Verificar permissões
SELECT has_table_privilege('agendamentos', 'ALTER');

-- Tentar manualmente
ALTER TABLE agendamentos ADD COLUMN confirmacao_enviada_em TIMESTAMPTZ;
```

### Problema: Ainda está enviando duplicatas

1. Verificar se servidor foi reiniciado:
   ```bash
   pm2 logs app --lines 20
   ```

2. Verificar se código está atualizado:
   ```bash
   git log --oneline -5
   # Deve mostrar: c721a71 🐛 FIX: Mensagens de confirmação duplicadas
   ```

3. Verificar logs em tempo real:
   ```bash
   pm2 logs app --lines 100 | grep "PATCH /status"
   ```

### Problema: Erro ao rodar migração

```
ERROR: permission denied for table agendamentos
```

**Solução**: Conectar com usuário que tem permissão de ALTER:

```bash
psql -h HOST -U postgres -d DATABASE -f MIGRATION-FIX-DUPLICATA.sql
```

---

## 📞 SUPORTE

Se encontrar problemas:

1. Verificar arquivo `BUG-FIX-DUPLICATA-CONFIRMACAO.md` para detalhes técnicos
2. Ver logs: `pm2 logs app --lines 200`
3. Verificar status do banco: executar queries de monitoramento acima

---

**Última atualização**: 2026-06-22  
**Versão do fix**: 1.0.0  
**Commit**: c721a71
