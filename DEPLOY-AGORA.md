# 🚀 DEPLOY AGORA - Guia Rápido

**Data**: 23 de junho de 2026  
**Versão**: 1.0.0 (Sistema de Permissões + Fix Duplicatas)  
**Status**: ✅ Código já está no GitHub

---

## ⚡ QUICK DEPLOY (5 minutos)

### PASSO 1: Conectar no VPS

```bash
ssh seu-usuario@seu-ip-vps
```

### PASSO 2: Ir para o Projeto

```bash
cd /caminho/do/agendapro-fullstack
# Exemplo comum:
# cd /var/www/agendapro-fullstack
# ou
# cd ~/agendapro-fullstack
```

### PASSO 3: Fazer Backup (Segurança)

```bash
# Backup rápido
cp -r . ../backup-$(date +%Y%m%d-%H%M%S)
```

### PASSO 4: Puxar Código Novo

```bash
git pull origin main
```

**Você verá algo como:**
```
remote: Counting objects: 56, done.
Receiving objects: 100% (56/56)
Resolving deltas: 100% (27/27)
From https://github.com/Antonio1986-2025/agendapro-fullstack
   0d4cc97..eeef6dd  main -> main
Updating 0d4cc97..eeef6dd
Fast-forward
 22 files changed, 3094 insertions(+), 32 deletions(-)
 create mode 100644 server/middleware/permissoes.js
 create mode 100644 test-permissoes.js
 ...
```

### PASSO 5: Instalar Dependências (se necessário)

```bash
npm install --production
```

**Nota**: Neste deploy **NÃO há novas dependências**, mas é bom garantir.

### PASSO 6: Aplicar Migração do Banco

```bash
# A migração já roda automaticamente se AUTO_MIGRATE=true no .env
# Mas você pode rodar manualmente para garantir:
node server/db/migrate.js
```

**Saída esperada:**
```
✅ PostgreSQL conectado
✅ Migrations aplicadas (schema atualizado)
Concluído.
```

### PASSO 7: Testar Localmente na VPS

```bash
# Teste 1: Fix de duplicatas
node test-fix-duplicata.js

# Teste 2: Sistema de permissões
node test-permissoes.js
```

**Resultado esperado:**
```
✅ Testes passaram: 19
❌ Testes falharam: 0
```

### PASSO 8: Reiniciar Servidor

**Com PM2** (mais comum):
```bash
pm2 restart all
# ou especificamente:
pm2 restart agendapro
```

**Com Docker Compose**:
```bash
docker-compose restart
```

**Com systemd**:
```bash
sudo systemctl restart agendapro
```

### PASSO 9: Verificar Logs

```bash
# PM2
pm2 logs --lines 50

# Docker
docker-compose logs -f app --tail 50
```

**Procure por:**
```
✅ PostgreSQL conectado
✅ Migrations aplicadas
🚀 Servidor rodando na porta 3000
```

### PASSO 10: Testar API

```bash
# Teste de saúde
curl http://localhost:3000/api/health

# Deve retornar algo como:
# {"status":"online","database":"connected","timestamp":"..."}
```

---

## ✅ VALIDAÇÃO FINAL

### 1. Testar no Navegador

Acesse: `http://seu-dominio.com` ou `http://seu-ip:3000`

### 2. Login como Owner

```
Email: seu-email@email.com
Senha: sua-senha
```

### 3. Verificar Nova Funcionalidade

**Teste A: Sistema de Permissões**
1. Ir em **Equipe** → **Profissionais**
2. Clicar em um profissional
3. Verificar que aparece campo **"Permissões"** com:
   - ☑ Clientes
   - ☐ Comandas
   - ☐ Gerenciar Agenda
   - ☐ Relatórios

**Teste B: Fix de Duplicatas**
1. Criar um agendamento via WhatsApp
2. Cancelar o agendamento
3. Verificar que recebe **apenas 1 mensagem de cancelamento**
4. NÃO deve receber mensagens de confirmação depois

---

## 🔍 O QUE MUDOU NESTE DEPLOY

### Arquivos Novos
- ✅ `server/middleware/permissoes.js` (448 linhas)
- ✅ `test-fix-duplicata.js`
- ✅ `test-permissoes.js`
- ✅ 7 arquivos de documentação

### Arquivos Modificados
- ✅ `server/db/schema.sql` - Nova coluna `confirmacao_enviada_em`
- ✅ `server/routes/agendamentos.js` - Filtros + validações
- ✅ `server/routes/comandas.js` - Proteção permissão
- ✅ `server/routes/dashboard.js` - Proteção permissão
- ✅ `server/routes/profissionais.js` - Endpoints permissões
- ✅ `server/routes/servicos.js` - Proteção POST/PUT/DELETE
- ✅ `server/routes/estoque.js` - Proteção owner/admin
- ✅ `server/routes/transacoes.js` - Proteção owner/admin
- ✅ `server/routes/caixa.js` - Proteção owner/admin
- ✅ `server/middleware/auth.js` - Injeção userId e role

### Banco de Dados
- ✅ Nova coluna: `agendamentos.confirmacao_enviada_em`
- ✅ Coluna já existia: `profissionais.permissoes` (JSONB)
- ✅ Coluna já existia: `usuarios.role`
- ✅ Coluna já existia: `usuarios.profissional_id`

### Impacto Zero
- ✅ **Compatibilidade total**: Usuários atuais continuam funcionando
- ✅ **Sem breaking changes**: Tudo retrocompatível
- ✅ **Permissões padrão**: Profissionais existentes mantêm acesso total

---

## 🎯 APÓS O DEPLOY

### Para Ativar o Sistema de Permissões

**Cenário 1: Criar Novo Barbeiro com Acesso Limitado**

Via painel admin:
1. **Equipe** → **Adicionar Profissional**
2. Preencher dados do barbeiro
3. Marcar **"Criar acesso ao sistema"**
4. Configurar **permissões**:
   - ☑ Clientes (ver todos)
   - ☐ Comandas (não acessa)
   - ☐ Gerenciar Agenda (vê só a própria)
   - ☐ Relatórios (não acessa)
5. Salvar

**Cenário 2: Atualizar Barbeiro Existente**

Via API:
```bash
curl -X PATCH http://localhost:3000/api/profissionais/{id}/permissoes \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  }'
```

### Testar Acesso Staff

1. Criar usuário staff (via endpoint ou admin)
2. Login com credenciais do staff
3. Verificar que vê apenas:
   - ✅ Sua própria agenda
   - ✅ Lista de clientes
   - ❌ NÃO vê comandas
   - ❌ NÃO vê relatórios
   - ❌ NÃO pode concluir agendamentos manualmente

---

## 🚨 TROUBLESHOOTING

### Problema 1: "Coluna confirmacao_enviada_em não existe"

**Causa**: Migração não rodou

**Solução**:
```bash
node server/db/migrate.js
pm2 restart all
```

### Problema 2: Staff ainda vê toda agenda

**Causa**: Usuário não vinculado ao profissional

**Solução**:
```sql
-- Conectar no banco
psql $DATABASE_URL

-- Ver usuários staff
SELECT u.id, u.nome, u.role, u.profissional_id 
FROM usuarios u 
WHERE role = 'staff';

-- Vincular ao profissional
UPDATE usuarios 
SET profissional_id = 'ID_DO_PROFISSIONAL'
WHERE id = 'ID_DO_USUARIO' AND role = 'staff';
```

### Problema 3: Testes falhando

**Causa**: Dependências desatualizadas ou banco offline

**Solução**:
```bash
# Reinstalar dependências
rm -rf node_modules
npm install --production

# Verificar banco
psql $DATABASE_URL -c "SELECT 1"

# Rodar testes novamente
node test-permissoes.js
```

### Problema 4: PM2 não reinicia

**Solução**:
```bash
# Ver processos
pm2 list

# Deletar processo travado
pm2 delete all

# Iniciar novamente
pm2 start npm --name "agendapro" -- start
pm2 save
```

### Problema 5: Git pull com conflitos

**Solução**:
```bash
# Descartar mudanças locais
git reset --hard origin/main

# Puxar novamente
git pull origin main
```

---

## 📊 MONITORAMENTO PÓS-DEPLOY

### Verificar Logs por 10 minutos

```bash
pm2 logs --lines 100 | grep -i "error\|anti-duplicata\|acesso negado"
```

**Procure por**:
- ✅ `[ANTI-DUPLICATA]` - Proteção funcionando
- ✅ `Acesso negado` - Permissões bloqueando corretamente
- ❌ Nenhum erro crítico

### Verificar Banco de Dados

```bash
# Conectar no banco
psql $DATABASE_URL

# Ver agendamentos com confirmação enviada
SELECT COUNT(*) FROM agendamentos WHERE confirmacao_enviada_em IS NOT NULL;

# Ver profissionais com permissões
SELECT nome, permissoes FROM profissionais WHERE permissoes IS NOT NULL;
```

---

## ✅ CHECKLIST COMPLETO

- [ ] 1. Conectado no VPS
- [ ] 2. Backup feito
- [ ] 3. `git pull origin main` executado
- [ ] 4. `npm install` executado (se necessário)
- [ ] 5. `node server/db/migrate.js` executado
- [ ] 6. `node test-fix-duplicata.js` passou
- [ ] 7. `node test-permissoes.js` passou (19/19)
- [ ] 8. Servidor reiniciado (`pm2 restart all`)
- [ ] 9. Logs verificados (sem erros)
- [ ] 10. API testada (`curl /api/health`)
- [ ] 11. Login no painel funcionando
- [ ] 12. Teste de cancelamento WhatsApp (sem duplicatas)
- [ ] 13. Monitoramento por 10 minutos
- [ ] 14. Tudo OK! ✅

---

## 🎉 SUCESSO!

Se todos os itens do checklist estão ✅, seu deploy foi um sucesso!

**O que está funcionando agora:**
- ✅ Sistema de permissões ativo
- ✅ Fix de duplicatas aplicado
- ✅ Barbeiros com acesso limitado
- ✅ Validações automáticas
- ✅ Logs de auditoria

**Próximos passos:**
1. Criar 1-2 usuários staff de teste
2. Testar acesso limitado
3. Treinar equipe sobre limitações
4. Monitorar por 24h

---

## 📞 SUPORTE

**Documentação disponível:**
- `README-IMPLEMENTACAO.md` - Guia completo
- `GUIA-SISTEMA-PERMISSOES.md` - Como usar permissões
- `RELATORIO-IMPLEMENTACAO-COMPLETA.md` - Relatório técnico

**Testes:**
```bash
node test-fix-duplicata.js
node test-permissoes.js
```

**Logs:**
```bash
pm2 logs --lines 200
```

---

**Tempo estimado de deploy**: 5-10 minutos  
**Risco**: Baixo (tudo testado)  
**Impacto**: Alto (resolve bugs críticos)

🚀 **Bom deploy!**
