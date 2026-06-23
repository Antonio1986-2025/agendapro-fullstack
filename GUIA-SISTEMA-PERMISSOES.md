# 🔐 Guia do Sistema de Controle de Acesso e Permissões

**Versão**: 1.0.0  
**Data**: 2026-06-22  
**Status**: ✅ Implementado e Testado

---

## 📋 VISÃO GERAL

O sistema implementa controle de acesso baseado em **roles** (papéis) e **permissões granulares** armazenadas em JSONB.

### Roles Disponíveis

| Role | Descrição | Acesso |
|------|-----------|--------|
| **owner** | Dono da barbearia | Acesso total sem restrições |
| **admin** | Administrador | Acesso total (exceto configurações críticas) |
| **staff** | Barbeiro comum | Acesso limitado por permissões JSONB |

---

## 🎯 PERMISSÕES DISPONÍVEIS

### 1. `clientes` (boolean)
- **Descrição**: Ver todos os clientes da barbearia
- **Padrão para staff**: `true`
- **Quando false**: Staff não vê lista de clientes

### 2. `comandas` (boolean)
- **Descrição**: Acessar e gerenciar comandas
- **Padrão para staff**: `false`
- **Quando false**: Staff não acessa `/api/comandas`
- **Impacto**: Staff não pode abrir, editar ou fechar comandas

### 3. `gerenciar_agenda` (boolean)
- **Descrição**: Ver agenda de todos os profissionais
- **Padrão para staff**: `false`
- **Quando false**: Staff vê **apenas sua própria agenda**
- **Quando true**: Staff vê agenda de todos (útil para recepcionista)

### 4. `relatorios` (boolean)
- **Descrição**: Acessar dashboard e relatórios financeiros
- **Padrão para staff**: `false`
- **Quando false**: Staff não acessa `/api/dashboard`
- **Impacto**: Não vê faturamento, estatísticas, etc.

---

## 🚫 RESTRIÇÕES AUTOMÁTICAS PARA STAFF

### Independente das Permissões

1. **Agenda**:
   - ✅ Vê apenas sua própria agenda (se `gerenciar_agenda=false`)
   - ✅ Pode criar agendamentos **apenas para si mesmo**
   - ✅ Pode modificar/cancelar **apenas seus próprios agendamentos**
   - ❌ NÃO pode criar agendamentos para outros barbeiros
   - ❌ NÃO pode modificar agendamentos de outros

2. **Conclusão de Agendamentos**:
   - ❌ Staff **NÃO pode concluir agendamentos manualmente**
   - ✅ Agendamento é concluído **automaticamente** quando ADM/CAIXA fecha a comanda
   - ✅ Comissão é creditada automaticamente no fechamento da comanda

3. **Áreas Administrativas** (sempre bloqueadas):
   - ❌ Gerenciar profissionais (`/api/profissionais` POST/PUT/DELETE)
   - ❌ Gerenciar serviços (`/api/servicos` POST/PUT/DELETE)
   - ❌ Acessar estoque (`/api/estoque`)
   - ❌ Acessar transações financeiras (`/api/transacoes`)
   - ❌ Gerenciar caixa (`/api/caixa`)

---

## 🛠️ COMO USAR

### 1. Criar Profissional com Acesso de Staff

```bash
POST /api/profissionais
Authorization: Bearer <token_owner>
Content-Type: application/json

{
  "nome": "João Silva",
  "especialidade": "Barba e Cabelo",
  "telefone": "67991234567",
  "notificar_whatsapp": true,
  "comissao_servico_percentual": 50,
  "permissoes": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  },
  "criar_acesso": true,
  "email": "joao@barbearia.com",
  "senha": "SenhaSegura123"
}
```

**Resposta**:
```json
{
  "id": "abc123...",
  "nome": "João Silva",
  "permissoes": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  },
  "ativo": true
}
```

### 2. Ver Permissões de um Profissional

```bash
GET /api/profissionais/{id}/permissoes
Authorization: Bearer <token>
```

**Resposta**:
```json
{
  "profissional_id": "abc123...",
  "profissional_nome": "João Silva",
  "permissoes": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  },
  "descricoes": {
    "clientes": "Ver todos os clientes da barbearia",
    "comandas": "Acessar e gerenciar comandas",
    "gerenciar_agenda": "Ver agenda de todos os profissionais",
    "relatorios": "Acessar dashboard e relatórios financeiros"
  }
}
```

### 3. Atualizar Permissões

```bash
PATCH /api/profissionais/{id}/permissoes
Authorization: Bearer <token_owner_ou_admin>
Content-Type: application/json

{
  "comandas": true,
  "gerenciar_agenda": true
}
```

**Resposta**:
```json
{
  "sucesso": true,
  "profissional": "João Silva",
  "permissoes_anteriores": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  },
  "permissoes_novas": {
    "clientes": true,
    "comandas": true,
    "gerenciar_agenda": true,
    "relatorios": false
  }
}
```

---

## 🔍 EXEMPLOS DE CENÁRIOS

### Cenário 1: Barbeiro Básico

**Perfil**: Apenas corta cabelo, não precisa acessar comandas

```json
{
  "permissoes": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": false,
    "relatorios": false
  }
}
```

**O que ele pode fazer**:
- ✅ Ver sua própria agenda
- ✅ Criar agendamentos para si mesmo
- ✅ Confirmar/cancelar seus agendamentos
- ✅ Ver lista de clientes
- ✅ Bloquear horários (almoço, folga)

**O que ele NÃO pode fazer**:
- ❌ Ver agenda de outros barbeiros
- ❌ Criar agendamento para outro barbeiro
- ❌ Acessar comandas
- ❌ Concluir agendamento manualmente
- ❌ Ver relatórios/dashboard

### Cenário 2: Barbeiro + Caixa

**Perfil**: Corta cabelo E fecha comandas

```json
{
  "permissoes": {
    "clientes": true,
    "comandas": true,
    "gerenciar_agenda": false,
    "relatorios": false
  }
}
```

**Adicional ao Cenário 1**:
- ✅ Abrir, editar e fechar comandas
- ✅ Adicionar itens (serviços/produtos) na comanda
- ✅ Registrar pagamento

### Cenário 3: Recepcionista

**Perfil**: Gerencia agenda de todos, mas não acessa financeiro

```json
{
  "permissoes": {
    "clientes": true,
    "comandas": false,
    "gerenciar_agenda": true,
    "relatorios": false
  }
}
```

**O que ele pode fazer**:
- ✅ Ver agenda de **todos os barbeiros**
- ✅ Criar agendamentos para qualquer barbeiro
- ✅ Modificar/cancelar agendamentos de todos

**Limitações**:
- ❌ Não acessa comandas (não fecha atendimentos)
- ❌ Não vê relatórios financeiros

### Cenário 4: Gerente

**Perfil**: Supervisiona tudo, menos configurações críticas

```json
Role: "admin"
```

**O que ele pode fazer**:
- ✅ Tudo que staff com permissões totais faz
- ✅ Gerenciar profissionais
- ✅ Gerenciar serviços
- ✅ Acessar estoque
- ✅ Acessar financeiro

---

## 🧪 TESTANDO PERMISSÕES

### Teste Automatizado

```bash
node test-permissoes.js
```

**Resultado esperado**:
```
✅ Testes passaram: 19
❌ Testes falharam: 0

🎉 ====== TODOS OS TESTES PASSARAM ======
```

### Teste Manual

1. **Login como staff**:
```bash
POST /api/auth/login
{
  "email": "joao@barbearia.com",
  "senha": "SenhaSegura123"
}
```

2. **Tentar acessar comandas** (deve falhar se `comandas=false`):
```bash
GET /api/comandas
Authorization: Bearer <token_staff>

# Resposta esperada:
{
  "erro": "Acesso negado",
  "mensagem": "Você não tem permissão para acessar comandas",
  "permissao_necessaria": "comandas"
}
```

3. **Ver apenas própria agenda**:
```bash
GET /api/agendamentos
Authorization: Bearer <token_staff>

# Retorna apenas agendamentos do profissional vinculado ao usuário staff
```

4. **Tentar criar agendamento para outro barbeiro** (deve falhar):
```bash
POST /api/agendamentos
Authorization: Bearer <token_staff>
{
  "profissional_id": "<id_de_outro_barbeiro>",
  "data_hora": "2026-06-23 15:00:00",
  "servico_id": "..."
}

# Resposta esperada:
{
  "erro": "Você só pode criar agendamentos para você mesmo"
}
```

---

## 🔧 TROUBLESHOOTING

### Problema: Staff consegue acessar área proibida

**Causa**: Rota não protegida corretamente

**Solução**:
```javascript
import { requerPermissao } from '../middleware/permissoes.js';

router.get('/area-protegida', autenticar, requerPermissao('comandas'), async (req, res) => {
  // código
});
```

### Problema: Staff não consegue ver sua própria agenda

**Causa**: Usuário não vinculado ao profissional

**Verificar**:
```sql
SELECT u.id, u.nome, u.profissional_id, p.nome as prof_nome
FROM usuarios u
LEFT JOIN profissionais p ON p.id = u.profissional_id
WHERE u.role = 'staff';
```

**Solução**:
```sql
UPDATE usuarios 
SET profissional_id = '<id_do_profissional>'
WHERE id = '<id_do_usuario>' AND role = 'staff';
```

### Problema: Permissões não estão sendo aplicadas

**Verificar middleware**:
```javascript
// Certifique-se que o middleware está ANTES das rotas:
router.use(autenticar);
router.use(injetarContextoPermissoes);  // ← importante!

router.get('/', async (req, res) => {
  // req.contexto estará disponível
});
```

---

## 📊 ESTRUTURA DO BANCO

### Tabela `usuarios`

```sql
CREATE TABLE usuarios (
  id UUID PRIMARY KEY,
  barbearia_id UUID NOT NULL,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) DEFAULT 'owner',  -- owner | admin | staff
  profissional_id UUID REFERENCES profissionais(id)  -- vinculo para staff
);
```

### Tabela `profissionais`

```sql
CREATE TABLE profissionais (
  id UUID PRIMARY KEY,
  barbearia_id UUID NOT NULL,
  nome VARCHAR(255) NOT NULL,
  especialidade VARCHAR(120),
  telefone VARCHAR(30),
  ativo BOOLEAN DEFAULT true,
  permissoes JSONB DEFAULT '{"clientes":true,"comandas":false,"gerenciar_agenda":false,"relatorios":false}'
);
```

---

## 🎓 BOAS PRÁTICAS

### 1. Princípio do Menor Privilégio
- Sempre inicie staff com permissões mínimas
- Adicione permissões conforme necessário
- Revise permissões periodicamente

### 2. Auditoria
- Registre mudanças de permissões
- Monitore acessos negados nos logs
- Busque por `[ANTI-DUPLICATA]` ou `Acesso negado` nos logs

### 3. Onboarding de Novos Barbeiros
1. Criar profissional com permissões padrão
2. Criar usuário staff vinculado
3. Testar login e acesso
4. Treinar sobre limitações do sistema
5. Ajustar permissões conforme confiança

### 4. Segurança
- Senhas com mínimo 8 caracteres
- Não compartilhar credenciais entre barbeiros
- Trocar senha periodicamente
- Desativar usuário quando barbeiro sair

---

## 📚 REFERÊNCIAS

- **Código fonte**: `server/middleware/permissoes.js`
- **Testes**: `test-permissoes.js`
- **Schema**: `server/db/schema.sql`
- **Rotas protegidas**: `server/routes/*.js`

---

**Desenvolvido por**: Kiro AI Assistant  
**Data**: 2026-06-22  
**Testado em**: PostgreSQL 14+, Node.js 18+  
**Commit**: f5f882c
