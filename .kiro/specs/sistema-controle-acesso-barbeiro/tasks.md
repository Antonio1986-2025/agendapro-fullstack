# Implementation Tasks

## Task 1: Database Schema Migrations

**Status**: pending  
**Priority**: high  
**Estimate**: 1 hour

### Description
Adicionar colunas necessárias ao banco de dados para suportar bloqueio de horários, permissões JSONB e vínculo usuario-profissional.

### Implementation Steps
1. Criar arquivo `server/db/migrations/add-permissions-system.sql`
2. Adicionar coluna `tipo_bloqueio` em `agendamentos`
3. Adicionar coluna `permissoes` JSONB em `profissionais` com default
4. Adicionar coluna `profissional_id` em `usuarios`
5. Criar índices para performance: `idx_agendamentos_profissional_data`, `idx_comissoes_profissional_status`
6. Executar migração com idempotência (ADD IF NOT EXISTS)

### Acceptance Criteria
- [ ] Coluna `agendamentos.tipo_bloqueio` aceita NULL, 'intervalo', 'compromisso', 'folga'
- [ ] Coluna `profissionais.permissoes` tem default correto para barbeiro comum
- [ ] Coluna `usuarios.profissional_id` permite NULL
- [ ] Índices criados melhoram performance de queries filtradas
- [ ] Migração pode ser executada múltiplas vezes sem erro

### Testing
```sql
-- Verificar estrutura
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'agendamentos' AND column_name = 'tipo_bloqueio';

-- Verificar índices
SELECT indexname FROM pg_indexes WHERE tablename = 'agendamentos';
```

---

## Task 2: Middleware de Verificação de Permissões

**Status**: pending  
**Priority**: high  
**Estimate**: 2 hours

### Description
Criar middleware `verificarPermissao(permissao)` no backend para validar permissões JSONB antes de executar ações protegidas.

### Implementation Steps
1. Abrir `server/middleware/auth.js`
2. Adicionar função `verificarPermissao(permissaoRequerida)`
3. Implementar lógica:
   - Se role = 'owner' ou 'admin' → permitir (bypass)
   - Se role = 'staff' → carregar permissoes JSONB do profissional
   - Validar permissoes[permissaoRequerida] === true
   - Se falhar → retornar HTTP 403 + log de acesso negado
4. Anexar `req.permissoes` para uso nos route handlers
5. Adicionar log com formato: `[ACESSO NEGADO] Usuario: {id}, Endpoint: {path}, Permissao: {perm}`

### Acceptance Criteria
- [ ] Owner e Admin têm acesso total (bypass de permissões)
- [ ] Staff sem permissão recebe HTTP 403
- [ ] Staff com permissão consegue acessar
- [ ] Tentativas negadas são registradas em log (level WARN)
- [ ] req.permissoes é anexado ao request para uso posterior

### Testing
```javascript
// Unit test
describe('verificarPermissao', () => {
  it('should allow owner to access protected resource', async () => {
    const req = { user: { role: 'owner' } };
    const res = mockResponse();
    const next = jest.fn();
    
    await verificarPermissao('comandas')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
  
  it('should deny staff without permission', async () => {
    const req = { user: { role: 'staff', profissional_id: 'prof-123' } };
    const res = mockResponse();
    query.mockResolvedValue({ rows: [{ permissoes: { comandas: false } }] });
    
    await verificarPermissao('comandas')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

---

## Task 3: Filtrar Agendamentos por Profissional (Backend)

**Status**: pending  
**Priority**: high  
**Estimate**: 1 hour

### Description
Modificar endpoint GET /api/agendamentos para filtrar resultados por profissional_id quando usuário for staff.

### Implementation Steps
1. Abrir `server/routes/agendamentos.js`
2. Localizar route handler `router.get('/', autenticar, ...)`
3. Adicionar lógica condicional:
   - Se `req.user.role === 'staff'` E `req.user.profissional_id` existe
   - Adicionar filtro SQL: `AND profissional_id = $X`
   - Owner/Admin veem todos os agendamentos
4. Manter filtros existentes (data, status) funcionando
5. Garantir que query retorna apenas agendamentos da barbearia_id do usuário

### Acceptance Criteria
- [ ] Barbeiro staff vê apenas agendamentos onde profissional_id = seu profissional_id
- [ ] Owner/Admin veem todos os agendamentos da barbearia
- [ ] Filtro por data continua funcionando
- [ ] Query usa índice idx_agendamentos_profissional_data para performance
- [ ] Se profissional_id é NULL, staff recebe array vazio

### Testing
```javascript
// Integration test
it('should filter agendamentos for staff', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .get('/api/agendamentos?data=2024-06-20')
    .set('Authorization', `Bearer ${token}`);
  
  expect(res.status).toBe(200);
  res.body.forEach(ag => {
    expect(ag.profissional_id).toBe('prof-123');
  });
});
```

---

## Task 4: Bloquear "Concluir" para Barbeiro (Backend)

**Status**: pending  
**Priority**: high  
**Estimate**: 30 minutes

### Description
Modificar endpoint PATCH /api/agendamentos/:id/status para impedir que staff marque agendamentos como "concluído".

### Implementation Steps
1. Abrir `server/routes/agendamentos.js`
2. Localizar route handler `router.patch('/:id/status', ...)`
3. Adicionar validação ANTES de executar UPDATE:
   ```javascript
   if (status === 'concluido' && req.user.role === 'staff') {
     return res.status(403).json({ 
       erro: 'Apenas ADM/CAIXA pode marcar como concluído. Agendamento é concluído automaticamente ao fechar comanda.' 
     });
   }
   ```
4. Validar que staff só pode alterar status de seus próprios agendamentos
5. Permitir staff alterar para: 'confirmado', 'cancelado'

### Acceptance Criteria
- [ ] Staff recebe HTTP 403 ao tentar status = 'concluido'
- [ ] Staff consegue alterar para 'confirmado' e 'cancelado'
- [ ] Staff só altera agendamentos do próprio profissional_id
- [ ] Owner/Admin podem marcar qualquer agendamento como concluído
- [ ] Mensagem de erro é clara sobre o fluxo correto

### Testing
```javascript
it('should block staff from marking as concluido', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .patch('/api/agendamentos/ag-456/status')
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'concluido' });
  
  expect(res.status).toBe(403);
  expect(res.body.erro).toContain('Apenas ADM/CAIXA');
});
```

---

## Task 5: Automação Fechamento de Comanda

**Status**: pending  
**Priority**: high  
**Estimate**: 2 hours

### Description
Modificar endpoint PATCH /api/comandas/:id/finalizar para automaticamente marcar agendamento como concluído e criar registros de comissão em uma transação atômica.

### Implementation Steps
1. Abrir `server/routes/comandas.js`
2. Localizar/criar route `router.patch('/:id/finalizar', autenticar, verificarPermissao('comandas'), ...)`
3. Implementar transação SQL:
   ```javascript
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     
     // 1. Buscar comanda e itens
     // 2. Finalizar comanda (status = 'finalizada', fechamento = NOW())
     // 3. Marcar agendamento como 'concluido'
     // 4. Para cada item: criar registro em comissoes
     
     await client.query('COMMIT');
   } catch (err) {
     await client.query('ROLLBACK');
     throw err;
   }
   ```
4. Calcular valor_comissao = (valor_item * percentual) / 100
5. Criar comissão com status = 'pendente'

### Acceptance Criteria
- [ ] Comanda finalizada (status = 'finalizada', fechamento preenchido)
- [ ] Agendamento marcado como 'concluido'
- [ ] Comissões criadas para cada item com profissional_id
- [ ] Se transação falhar, fazer rollback completo
- [ ] Comissões criadas com status = 'pendente'
- [ ] Endpoint protegido com verificarPermissao('comandas')

### Testing
```javascript
it('should auto-complete agendamento when closing comanda', async () => {
  const token = generateToken({ role: 'admin' });
  
  // Criar agendamento e comanda primeiro
  const agId = await createTestAgendamento();
  const comandaId = await createTestComanda(agId);
  
  const res = await request(app)
    .patch(`/api/comandas/${comandaId}/finalizar`)
    .set('Authorization', `Bearer ${token}`)
    .send({ forma_pagamento: 'dinheiro' });
  
  expect(res.status).toBe(200);
  
  // Verificar agendamento
  const ag = await query('SELECT status FROM agendamentos WHERE id = $1', [agId]);
  expect(ag.rows[0].status).toBe('concluido');
  
  // Verificar comissões criadas
  const comissoes = await query('SELECT * FROM comissoes WHERE comanda_id = $1', [comandaId]);
  expect(comissoes.rows.length).toBeGreaterThan(0);
});
```

---

## Task 6: Endpoint Criar Agendamento/Bloqueio

**Status**: pending  
**Priority**: high  
**Estimate**: 1.5 hours

### Description
Criar/modificar endpoint POST /api/agendamentos para permitir criação de agendamentos normais e bloqueios, com validação de permissões.

### Implementation Steps
1. Abrir `server/routes/agendamentos.js`
2. Criar route `router.post('/', autenticar, async (req, res) => { ... })`
3. Validar body: `profissional_id`, `data_hora`, opcional: `cliente_id`, `servico_id`, `tipo_bloqueio`, `observacoes`
4. Se `tipo_bloqueio` existe → validar que staff só pode bloquear para si mesmo
5. Se `tipo_bloqueio` NULL → validar que staff só pode criar para si mesmo
6. Owner/Admin podem criar para qualquer profissional
7. Se bloqueio: definir status = 'confirmado', cliente_id = NULL
8. Se agendamento normal: criar cliente se necessário, criar comanda automaticamente

### Acceptance Criteria
- [ ] Staff só cria agendamentos/bloqueios para si mesmo (profissional_id = req.user.profissional_id)
- [ ] Owner/Admin criam para qualquer profissional
- [ ] Bloqueios têm cliente_id NULL e tipo_bloqueio preenchido
- [ ] Agendamentos normais criam comanda automaticamente
- [ ] Validação retorna HTTP 403 se staff tentar criar para outro profissional
- [ ] tipo_bloqueio aceita: 'intervalo', 'compromisso', 'folga'

### Testing
```javascript
it('should allow staff to create bloqueio for themselves', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .post('/api/agendamentos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      profissional_id: 'prof-123',
      data_hora: '2024-06-20T14:00:00',
      tipo_bloqueio: 'intervalo',
      observacoes: 'Almoço'
    });
  
  expect(res.status).toBe(201);
  expect(res.body.cliente_id).toBeNull();
  expect(res.body.tipo_bloqueio).toBe('intervalo');
});

it('should block staff from creating bloqueio for others', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .post('/api/agendamentos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      profissional_id: 'prof-999',  // Outro profissional
      data_hora: '2024-06-20T14:00:00',
      tipo_bloqueio: 'intervalo'
    });
  
  expect(res.status).toBe(403);
});
```

---

## Task 7: Proteger Endpoints de Comandas

**Status**: pending  
**Priority**: high  
**Estimate**: 30 minutes

### Description
Aplicar middleware `verificarPermissao('comandas')` em todos os endpoints de comandas.

### Implementation Steps
1. Abrir `server/routes/comandas.js`
2. Adicionar `verificarPermissao('comandas')` em:
   - GET /api/comandas
   - GET /api/comandas/:id
   - POST /api/comandas
   - PATCH /api/comandas/:id
   - PATCH /api/comandas/:id/finalizar
   - DELETE /api/comandas/:id
3. Importar middleware: `import { verificarPermissao } from '../middleware/auth.js'`
4. Manter filtro WHERE barbearia_id em todas as queries

### Acceptance Criteria
- [ ] Staff sem permissão "comandas: true" recebe HTTP 403
- [ ] Staff com permissão consegue acessar
- [ ] Owner/Admin acessam sem restrições
- [ ] Tentativas negadas são registradas em log

### Testing
```javascript
it('should block staff without comandas permission', async () => {
  const token = generateToken({ 
    role: 'staff', 
    profissional_id: 'prof-123',
    permissoes: { comandas: false }
  });
  
  const res = await request(app)
    .get('/api/comandas')
    .set('Authorization', `Bearer ${token}`);
  
  expect(res.status).toBe(403);
});
```

---

## Task 8: Filtrar Comissões por Profissional (Backend)

**Status**: pending  
**Priority**: medium  
**Estimate**: 45 minutes

### Description
Modificar endpoints GET /api/comissoes e GET /api/comissoes/saldo para filtrar por profissional_id quando usuário for staff.

### Implementation Steps
1. Abrir `server/routes/comissoes.js` (criar se não existir)
2. Implementar GET /api/comissoes com filtro condicional:
   - Se staff: WHERE profissional_id = req.user.profissional_id
   - Se owner/admin: retornar todas da barbearia
3. Implementar GET /api/comissoes/saldo com mesma lógica
4. Calcular saldo pendente e pago usando SUM() + CASE

### Acceptance Criteria
- [ ] Staff vê apenas comissões do próprio profissional_id
- [ ] Owner/Admin veem comissões de todos
- [ ] Saldo calculado corretamente (pendente + pago)
- [ ] Query usa índice idx_comissoes_profissional_status

### Testing
```javascript
it('should filter comissoes for staff', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .get('/api/comissoes')
    .set('Authorization', `Bearer ${token}`);
  
  expect(res.status).toBe(200);
  res.body.forEach(com => {
    expect(com.profissional_id).toBe('prof-123');
  });
});

it('should calculate saldo only for staff profissional', async () => {
  const token = generateToken({ role: 'staff', profissional_id: 'prof-123' });
  const res = await request(app)
    .get('/api/comissoes/saldo')
    .set('Authorization', `Bearer ${token}`);
  
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('pendente');
  expect(res.body).toHaveProperty('pago');
});
```

---

## Task 9: Frontend - Helpers de Permissão (api.js)

**Status**: pending  
**Priority**: high  
**Estimate**: 1 hour

### Description
Adicionar funções helper em api.js para gerenciar permissões no frontend.

### Implementation Steps
1. Abrir `public/api.js`
2. Adicionar método `getUser()` que decodifica JWT e retorna payload
3. Adicionar método `hasPermission(permissao)` que valida permissao no JWT
4. Adicionar métodos auxiliares: `isStaff()`, `isAdmin()`
5. Modificar `get/post/patch/delete` para incluir permissoes no localStorage após login

### Acceptance Criteria
- [ ] getUser() retorna objeto com: sub, role, barbearia_id, profissional_id, permissoes
- [ ] hasPermission('comandas') retorna true/false baseado em permissoes
- [ ] isStaff() retorna true se role === 'staff'
- [ ] isAdmin() retorna true se role === 'owner' ou 'admin'
- [ ] Funções funcionam mesmo se token não existe (retornam false)

### Testing
```javascript
// Manual test in browser console
const user = API.getUser();
console.log(user);  // { sub: '...', role: 'staff', profissional_id: '...', permissoes: {...} }

console.log(API.hasPermission('comandas'));  // false (para barbeiro comum)
console.log(API.hasPermission('clientes'));  // true

console.log(API.isStaff());  // true
console.log(API.isAdmin());  // false
```

---

## Task 10: Frontend - Remover Botão "Concluir" (barbeiro.html)

**Status**: pending  
**Priority**: high  
**Estimate**: 30 minutes

### Description
Remover botão "Concluir" da renderização de agendamentos confirmados na tela do barbeiro.

### Implementation Steps
1. Abrir `public/barbeiro.html`
2. Localizar função `renderizar()` ou equivalente
3. Remover linha que renderiza botão "Concluir":
   ```javascript
   // REMOVER esta linha:
   ${a.status === 'confirmado' ? `<button onclick="mudarStatus('${a.id}','concluido')"><i class="fas fa-check-double"></i></button>` : ''}
   ```
4. Manter botões "Confirmar" e "Cancelar"
5. Adicionar tooltip explicativo se necessário

### Acceptance Criteria
- [ ] Botão "Concluir" não aparece mais
- [ ] Botão "Confirmar" (agendado → confirmado) continua funcionando
- [ ] Botão "Cancelar" continua funcionando
- [ ] Visual do card de agendamento continua consistente

### Testing
- Manual: Logar como barbeiro, verificar que botão "Concluir" não existe
- Verificar console do browser para erros JavaScript

---

## Task 11: Frontend - Funcionalidade Bloquear Horário (barbeiro.html)

**Status**: pending  
**Priority**: high  
**Estimate**: 2 hours

### Description
Adicionar modal e funcionalidade para barbeiro bloquear horários na própria agenda.

### Implementation Steps
1. Abrir `public/barbeiro.html`
2. Adicionar botão FAB "Bloquear Horário" com ícone fa-ban
3. Criar modal com campos:
   - Data (date input)
   - Horário (time input, step 30min)
   - Tipo de bloqueio (select: intervalo/compromisso/folga)
   - Observações (text input opcional)
4. Implementar função `salvarBloqueio()` que chama POST /api/agendamentos
5. Adicionar CSS para visual diferenciado de bloqueios na lista
6. Modificar função `renderizar()` para identificar bloqueios (tipo_bloqueio !== null)

### Acceptance Criteria
- [ ] Botão FAB aparece na tela do barbeiro
- [ ] Modal abre com formulário de bloqueio
- [ ] Salvamento cria agendamento com cliente_id NULL
- [ ] Bloqueios aparecem visualmente distintos na agenda
- [ ] Labels descritivos: "🍽️ Intervalo", "📅 Compromisso", "🏖️ Folga"
- [ ] Erros de validação são exibidos no modal

### Testing
```javascript
// Manual test
1. Logar como barbeiro
2. Clicar em botão "Bloquear Horário"
3. Preencher data, hora, tipo
4. Salvar
5. Verificar que bloqueio aparece na agenda
6. Verificar no banco: cliente_id IS NULL, tipo_bloqueio preenchido
```

---

## Task 12: Frontend - Filtrar Navegação por Permissões

**Status**: pending  
**Priority**: medium  
**Estimate**: 1.5 hours

### Description
Ocultar links de navegação (sidebar e bottom-nav) que barbeiro não tem permissão para acessar.

### Implementation Steps
1. Criar função `filtrarNavegacao()` que será chamada em todas as páginas
2. Adicionar script em `barbeiro.html`, `clientes-mobile.html`, etc:
   ```javascript
   document.addEventListener('DOMContentLoaded', function() {
     const user = API.getUser();
     if (user && user.role === 'staff') {
       // Ocultar links não permitidos
       const ocultar = [
         'dashboard-mobile.html',
         'servicos-mobile.html',
         'profissionais-mobile.html',
         'estoque-mobile.html',
         'financeiro-mobile.html',
         'relatorios-mobile.html',
         'equipe.html',
         'horarios-especiais.html'
       ];
       
       ocultar.forEach(href => {
         document.querySelectorAll(`a[href="${href}"]`).forEach(link => {
           link.style.display = 'none';
         });
       });
     }
   });
   ```
3. Ocultar seções "Gestão" e "Outros" da sidebar para staff
4. Mostrar apenas: Minha Agenda, Clientes, Configurações

### Acceptance Criteria
- [ ] Staff vê apenas links permitidos: Agenda, Clientes, Configurações
- [ ] Owner/Admin veem todos os links
- [ ] Links ocultos no DOM (display: none)
- [ ] Navegação mobile e desktop filtradas
- [ ] Tentativa de acesso direto via URL é bloqueada pelo backend

### Testing
- Manual: Logar como barbeiro, verificar que apenas 3 links aparecem
- Logar como admin, verificar que todos os links aparecem

---

## Task 13: Frontend - Tela Configurações para Barbeiro

**Status**: pending  
**Priority**: medium  
**Estimate**: 2 hours

### Description
Criar versão simplificada da tela de configurações mostrando apenas opções permitidas para barbeiro.

### Implementation Steps
1. Abrir `public/configuracoes-mobile.html`
2. Adicionar script que detecta role do usuário
3. Se staff: ocultar seções não permitidas (Negócio, WhatsApp, Agente IA, Sistema)
4. Se staff: adicionar seção "Meu Perfil" com:
   - Alterar senha (modal)
   - Editar telefone (modal)
   - Toggle tema claro/escuro (já existe)
   - Preferências de notificação WhatsApp
5. Implementar modais para alterar senha e telefone
6. Criar endpoints backend se necessário: PATCH /api/usuarios/me

### Acceptance Criteria
- [ ] Staff vê apenas: Meu Perfil, Tema, Notificações, Sair
- [ ] Modal "Alterar Senha" funcional (valida senha atual + nova senha)
- [ ] Modal "Editar Telefone" funcional (atualiza profissionais.telefone)
- [ ] Toggle tema continua funcionando
- [ ] Owner/Admin veem tela completa normal

### Testing
```javascript
// Manual test
1. Logar como barbeiro
2. Ir para Configurações
3. Verificar que apenas seções permitidas aparecem
4. Clicar em "Alterar Senha" → modal abre
5. Alterar senha com sucesso
6. Logout e login com nova senha → sucesso
```

---

## Task 14: Endpoint Alterar Senha e Telefone

**Status**: pending  
**Priority**: medium  
**Estimate**: 1 hour

### Description
Criar endpoint PATCH /api/usuarios/me para permitir que barbeiro altere própria senha e telefone.

### Implementation Steps
1. Abrir `server/routes/auth.js`
2. Criar route `router.patch('/me', autenticar, async (req, res) => { ... })`
3. Aceitar body: `{ senha_atual, nova_senha, telefone }`
4. Validações:
   - Se `nova_senha` fornecida: validar senha_atual com bcrypt
   - Se `nova_senha`: hash e UPDATE usuarios.senha_hash
   - Se `telefone` e usuário tem profissional_id: UPDATE profissionais.telefone
5. Staff só pode atualizar próprio registro (WHERE id = req.user.sub)
6. Não permitir alterar: role, barbearia_id, profissional_id

### Acceptance Criteria
- [ ] Barbeiro consegue alterar própria senha
- [ ] Senha atual é validada antes de permitir troca
- [ ] Barbeiro consegue atualizar telefone (atualiza em profissionais)
- [ ] Tentativa de alterar campos proibidos retorna HTTP 403
- [ ] Nova senha tem mínimo 6 caracteres

### Testing
```javascript
it('should allow staff to change own password', async () => {
  const token = generateToken({ sub: 'user-123', role: 'staff' });
  
  const res = await request(app)
    .patch('/api/usuarios/me')
    .set('Authorization', `Bearer ${token}`)
    .send({
      senha_atual: 'senha123',
      nova_senha: 'novaSenha456'
    });
  
  expect(res.status).toBe(200);
  
  // Tentar login com nova senha
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'barbeiro@test.com', senha: 'novaSenha456' });
  
  expect(loginRes.status).toBe(200);
});
```

---

## Task 15: Vincular Usuários Staff a Profissionais (Migração de Dados)

**Status**: pending  
**Priority**: low  
**Estimate**: 30 minutes

### Description
Executar script SQL para vincular usuários staff existentes aos respectivos registros de profissionais baseado em nome.

### Implementation Steps
1. Criar arquivo `server/db/migrations/vincular-usuarios-profissionais.sql`
2. Escrever query UPDATE que faz match por nome:
   ```sql
   UPDATE usuarios u
   SET profissional_id = p.id
   FROM profissionais p
   WHERE u.role = 'staff' 
     AND u.barbearia_id = p.barbearia_id
     AND LOWER(u.nome) = LOWER(p.nome)
     AND u.profissional_id IS NULL;
   ```
3. Adicionar comentário explicando lógica do match
4. Executar manualmente em produção (não rodar automaticamente)
5. Verificar resultados antes de commitar

### Acceptance Criteria
- [ ] Usuários staff são vinculados a profissionais correspondentes
- [ ] Match é feito por nome (case-insensitive) e barbearia_id
- [ ] Apenas usuários sem profissional_id são atualizados (profissional_id IS NULL)
- [ ] Query é idempotente (pode rodar múltiplas vezes)

### Testing
```sql
-- Antes da migração
SELECT u.nome AS usuario, p.nome AS profissional, u.profissional_id
FROM usuarios u
LEFT JOIN profissionais p ON p.id = u.profissional_id
WHERE u.role = 'staff';

-- Executar migração

-- Depois da migração (verificar vínculos)
SELECT u.nome AS usuario, p.nome AS profissional, u.profissional_id
FROM usuarios u
LEFT JOIN profissionais p ON p.id = u.profissional_id
WHERE u.role = 'staff';
```

---

## Task 16: Atualizar Permissões Padrão em Profissionais Existentes

**Status**: pending  
**Priority**: low  
**Estimate**: 15 minutes

### Description
Atualizar campo permissoes em registros de profissionais que ainda têm permissões antigas (comandas: true).

### Implementation Steps
1. Criar arquivo `server/db/migrations/atualizar-permissoes-padrao.sql`
2. Escrever query UPDATE:
   ```sql
   UPDATE profissionais
   SET permissoes = '{"clientes":true,"comandas":false,"gerenciar_agenda":false,"relatorios":false}'::jsonb
   WHERE permissoes->>'comandas' = 'true'
     AND permissoes->>'gerenciar_agenda' IS NULL;
   ```
3. Executar apenas em profissionais que têm permissões antigas
4. Preservar profissionais que já têm permissões customizadas

### Acceptance Criteria
- [ ] Profissionais com permissões antigas são atualizados
- [ ] Permissões customizadas (ex: caixa) são preservadas
- [ ] Novo padrão: comandas=false para barbeiros comuns
- [ ] Query é idempotente

### Testing
```sql
-- Verificar permissões antes
SELECT id, nome, permissoes FROM profissionais;

-- Executar migração

-- Verificar permissões depois
SELECT id, nome, permissoes FROM profissionais;
-- Todos os barbeiros comuns devem ter comandas: false
```

---

## Task 17: Documentação e Testes E2E

**Status**: pending  
**Priority**: low  
**Estimate**: 2 hours

### Description
Criar documentação do sistema de permissões e testes end-to-end.

### Implementation Steps
1. Atualizar README.md com seção sobre Permissões
2. Documentar estrutura JSON de permissões
3. Documentar roles (owner, admin, staff) e diferenças
4. Criar script de teste E2E:
   - Criar barbearia + owner + barbeiro
   - Tentar acessos permitidos e negados
   - Validar fluxo completo: agendamento → atendimento → fechamento comanda
5. Adicionar exemplos de uso de permissões

### Acceptance Criteria
- [ ] README.md atualizado com seção Permissões
- [ ] Exemplos de JSONB permissoes documentados
- [ ] Diferenças entre roles explicadas
- [ ] Script E2E funcional (pode rodar com npm test)

### Testing
```bash
# Executar testes E2E
npm run test:e2e
```

---

## Summary

**Total Tasks**: 17  
**Estimated Time**: ~19 hours  

**Critical Path (High Priority)**:
1. Task 1: Database Schema Migrations (1h)
2. Task 2: Middleware Verificação Permissões (2h)
3. Task 3: Filtrar Agendamentos (1h)
4. Task 4: Bloquear "Concluir" (30min)
5. Task 5: Automação Comanda (2h)
6. Task 6: Endpoint Bloqueio (1.5h)
7. Task 7: Proteger Comandas (30min)
9. Task 9: Frontend Helpers (1h)
10. Task 10: Remover Botão Concluir (30min)
11. Task 11: Frontend Bloqueio (2h)

**Medium Priority**:
8. Task 8: Filtrar Comissões (45min)
12. Task 12: Filtrar Navegação (1.5h)
13. Task 13: Tela Configurações (2h)
14. Task 14: Endpoint Senha/Telefone (1h)

**Low Priority** (Production Data):
15. Task 15: Vincular Usuários (30min)
16. Task 16: Atualizar Permissões (15min)
17. Task 17: Documentação (2h)

**Recommended Order**: Execute by task number (dependencies resolved)
