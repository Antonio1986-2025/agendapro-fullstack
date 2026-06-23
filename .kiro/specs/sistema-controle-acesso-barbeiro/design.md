# Design Document

## Overview

Este documento descreve o design técnico do Sistema de Controle de Acesso e Permissões para Barbeiros no AgendaPro SaaS. O sistema implementa RBAC (Role-Based Access Control) com permissões granulares armazenadas em JSONB, validação de acesso em múltiplas camadas (backend + frontend), e automação do fluxo de comanda/agendamento/comissão.

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Browser)                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ barbeiro.html  │  │ clientes.html  │  │  config.html   │ │
│  │ - Agenda       │  │ - CRUD clientes│  │ - Senha/Tema   │ │
│  │ - Comissões    │  │ - Filtro busca │  │ - Telefone     │ │
│  │ - Bloqueios    │  └────────────────┘  └────────────────┘ │
│  └────────────────┘                                          │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              api.js (Frontend Helper)                 │   │
│  │  - getUser() → retorna user + permissoes             │   │
│  │  - hasPermission(perm) → valida frontend             │   │
│  │  - get/post/patch/delete com token JWT               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP + JWT Token
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │             Middleware Layer                            │ │
│  │  ┌──────────────┐  ┌────────────────────────────────┐ │ │
│  │  │  autenticar  │──│  verificarPermissao(perm)      │ │ │
│  │  │  - JWT decode│  │  - Valida permissoes JSONB     │ │ │
│  │  │  - Load user │  │  - Filtra por profissional_id  │ │ │
│  │  └──────────────┘  └────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│           │                                                  │
│           ▼                                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  Routes Layer                           │ │
│  │  /api/agendamentos → agendamentos.js                   │ │
│  │  /api/comandas     → comandas.js                       │ │
│  │  /api/comissoes    → comissoes.js                      │ │
│  │  /api/clientes     → clientes.js                       │ │
│  │  /api/auth         → auth.js                           │ │
│  └────────────────────────────────────────────────────────┘ │
│           │                                                  │
│           ▼                                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               Database Layer (PostgreSQL)               │ │
│  │  - usuarios (id, role, profissional_id)                │ │
│  │  - profissionais (id, permissoes JSONB)                │ │
│  │  - agendamentos (tipo_bloqueio, status)                │ │
│  │  - comandas (status, fechamento)                       │ │
│  │  - comissoes (profissional_id, status)                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```


### Permission Validation Flow

```
┌────────────────┐
│ HTTP Request   │
│ + JWT Token    │
└───────┬────────┘
        │
        ▼
┌──────────────────────────┐
│ autenticar middleware    │
│ - Decode JWT             │
│ - Load user from DB      │
│ - Attach req.user        │
│ - Load permissoes JSONB  │
└───────┬──────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│ verificarPermissao(perm) middleware  │
│                                      │
│ IF role = 'owner' OR 'admin':       │
│    → Allow (bypass permission check)│
│                                      │
│ ELSE:                                │
│    permissoes = profissional.permissoes JSONB │
│    IF permissoes[perm] === true:    │
│       → Allow                        │
│    ELSE:                             │
│       → HTTP 403 Forbidden           │
│       → Log tentativa de acesso      │
└───────┬──────────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ Route Handler            │
│ - Execute business logic │
│ - Apply profissional_id  │
│   filter if needed       │
└──────────────────────────┘
```


## Data Model

### Database Schema Changes

```sql
-- Adicionar coluna tipo_bloqueio em agendamentos
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS tipo_bloqueio VARCHAR(30);
-- Valores aceitos: NULL | 'intervalo' | 'compromisso' | 'folga'

-- Garantir que profissionais tenha permissoes JSONB
ALTER TABLE profissionais 
ADD COLUMN IF NOT EXISTS permissoes JSONB 
DEFAULT '{"clientes":true,"comandas":false,"gerenciar_agenda":false,"relatorios":false}';

-- Garantir que usuarios tenha profissional_id
ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES profissionais(id);

-- Índice para melhorar performance de queries filtradas
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data 
ON agendamentos(profissional_id, data_hora);

CREATE INDEX IF NOT EXISTS idx_comissoes_profissional_status 
ON comissoes(profissional_id, status);
```

### Permissoes JSONB Structure

```json
{
  "clientes": boolean,          // Acesso a CRUD de clientes
  "comandas": boolean,          // Acesso a visualizar/editar/fechar comandas
  "gerenciar_agenda": boolean,  // Acesso a criar agendamentos para outros barbeiros
  "relatorios": boolean         // Acesso a relatórios financeiros completos
}
```

**Valores padrão por role:**


```javascript
// Barbeiro comum (staff)
{
  "clientes": true,
  "comandas": false,
  "gerenciar_agenda": false,
  "relatorios": false
}

// Caixa (staff com permissão especial)
{
  "clientes": true,
  "comandas": true,
  "gerenciar_agenda": false,
  "relatorios": true  // opcional
}

// Owner/Admin (ignora permissoes JSONB, tem acesso total)
// Não usa campo permissoes
```

## API Design

### New Middleware: verificarPermissao

**File**: `server/middleware/auth.js`

```javascript
export function verificarPermissao(permissaoRequerida) {
  return async (req, res, next) => {
    // Owner e Admin têm acesso total
    if (req.user.role === 'owner' || req.user.role === 'admin') {
      return next();
    }

    // Carregar permissoes do profissional
    if (!req.user.profissional_id) {
      return res.status(403).json({ erro: 'Usuario sem profissional vinculado' });
    }


    const { rows } = await query(
      'SELECT permissoes FROM profissionais WHERE id = $1',
      [req.user.profissional_id]
    );

    const permissoes = rows[0]?.permissoes || {};
    
    if (permissoes[permissaoRequerida] !== true) {
      console.warn(`[ACESSO NEGADO] Usuario: ${req.user.sub}, Endpoint: ${req.path}, Permissao: ${permissaoRequerida}`);
      return res.status(403).json({ 
        erro: `Sem permissao para acessar este recurso`,
        permissao_requerida: permissaoRequerida
      });
    }

    // Attach permissoes to request for use in route handlers
    req.permissoes = permissoes;
    next();
  };
}
```

### Modified Endpoints

#### GET /api/agendamentos

**Before:**
```javascript
router.get('/', autenticar, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM agendamentos WHERE barbearia_id = $1',
    [req.barbeariaId]
  );
  res.json(rows);
});
```

**After:**
```javascript
router.get('/', autenticar, async (req, res) => {
  let sql = 'SELECT a.*, c.nome AS cliente_nome, s.nome AS servico_nome, p.nome AS profissional_nome ' +
            'FROM agendamentos a ' +
            'LEFT JOIN clientes c ON c.id = a.cliente_id ' +
            'LEFT JOIN servicos s ON s.id = a.servico_id ' +

            'LEFT JOIN profissionais p ON p.id = a.profissional_id ' +
            'WHERE a.barbearia_id = $1';
  
  const params = [req.barbeariaId];
  
  // Filtrar por profissional_id se usuario for staff (barbeiro)
  if (req.user.role === 'staff' && req.user.profissional_id) {
    sql += ' AND a.profissional_id = $2';
    params.push(req.user.profissional_id);
  }
  
  if (req.query.data) {
    sql += ' AND DATE(a.data_hora) = $' + (params.length + 1);
    params.push(req.query.data);
  }
  
  sql += ' ORDER BY a.data_hora';
  
  const { rows } = await query(sql, params);
  res.json(rows);
});
```

#### PATCH /api/agendamentos/:id/status

**New validation:**
```javascript
router.patch('/:id/status', autenticar, async (req, res) => {
  const { status } = req.body;
  
  // Barbeiro comum NÃO pode marcar como concluído
  if (status === 'concluido' && req.user.role === 'staff') {
    return res.status(403).json({ 
      erro: 'Apenas ADM/CAIXA pode marcar agendamento como concluído. O agendamento é concluído automaticamente quando a comanda é fechada.' 
    });
  }
  
  // Validar que barbeiro só pode alterar status dos próprios agendamentos
  if (req.user.role === 'staff' && req.user.profissional_id) {
    const { rows } = await query(
      'SELECT profissional_id FROM agendamentos WHERE id = $1 AND barbearia_id = $2',
      [req.params.id, req.barbeariaId]
    );
    
    if (!rows[0] || rows[0].profissional_id !== req.user.profissional_id) {

      return res.status(403).json({ erro: 'Sem permissao para alterar este agendamento' });
    }
  }
  
  await query(
    'UPDATE agendamentos SET status = $1 WHERE id = $2 AND barbearia_id = $3',
    [status, req.params.id, req.barbeariaId]
  );
  
  res.json({ ok: true });
});
```

#### POST /api/agendamentos (Criar agendamento)

**New endpoint for barbeiro to create appointments and blocks:**
```javascript
router.post('/', autenticar, async (req, res) => {
  const { profissional_id, cliente_id, servico_id, data_hora, tipo_bloqueio, observacoes } = req.body;
  
  // Se for bloqueio, validar que barbeiro está bloqueando apenas para si mesmo
  if (tipo_bloqueio && req.user.role === 'staff') {
    if (profissional_id !== req.user.profissional_id) {
      return res.status(403).json({ erro: 'Você só pode bloquear horários para si mesmo' });
    }
  }
  
  // Se for agendamento normal, validar que barbeiro está criando apenas para si
  if (!tipo_bloqueio && req.user.role === 'staff') {
    if (profissional_id !== req.user.profissional_id) {
      return res.status(403).json({ erro: 'Você só pode criar agendamentos para si mesmo' });
    }
  }
  
  // Criar agendamento/bloqueio
  const { rows } = await query(
    `INSERT INTO agendamentos (barbearia_id, cliente_id, profissional_id, servico_id, data_hora, tipo_bloqueio, observacoes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.barbeariaId, cliente_id || null, profissional_id, servico_id || null, data_hora, tipo_bloqueio || null, observacoes || null, tipo_bloqueio ? 'confirmado' : 'agendado']
  );
  
  res.status(201).json(rows[0]);
});
```


#### PATCH /api/comandas/:id/finalizar

**Modified to auto-complete agendamento and credit comissao:**
```javascript
router.patch('/:id/finalizar', autenticar, verificarPermissao('comandas'), async (req, res) => {
  const { forma_pagamento, valor_recebido, troco } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Buscar comanda e itens
    const comanda = await client.query(
      'SELECT * FROM comandas WHERE id = $1 AND barbearia_id = $2',
      [req.params.id, req.barbeariaId]
    );
    
    if (!comanda.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Comanda não encontrada' });
    }
    
    const itens = await client.query(
      'SELECT * FROM comanda_itens WHERE comanda_id = $1',
      [req.params.id]
    );
    
    // 2. Finalizar comanda
    await client.query(
      `UPDATE comandas SET status = 'finalizada', fechamento = NOW(), 
       forma_pagamento = $1, valor_recebido = $2, troco = $3 
       WHERE id = $4`,
      [forma_pagamento, valor_recebido, troco, req.params.id]
    );
    
    // 3. Marcar agendamento como concluído (se vinculado)
    if (comanda.rows[0].agendamento_id) {
      await client.query(
        "UPDATE agendamentos SET status = 'concluido' WHERE id = $1",
        [comanda.rows[0].agendamento_id]
      );
    }
    
    // 4. Criar registros de comissão
    for (const item of itens.rows) {
      if (item.profissional_id) {

        const prof = await client.query(
          'SELECT comissao_servico_percentual, comissao_produto_percentual FROM profissionais WHERE id = $1',
          [item.profissional_id]
        );
        
        const percentual = item.tipo === 'servico' 
          ? prof.rows[0].comissao_servico_percentual 
          : prof.rows[0].comissao_produto_percentual;
        
        const valor_comissao = (item.valor * percentual) / 100;
        
        await client.query(
          `INSERT INTO comissoes (barbearia_id, profissional_id, comanda_id, tipo, descricao, valor_item, percentual, valor_comissao, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente')`,
          [req.barbeariaId, item.profissional_id, req.params.id, item.tipo, item.descricao, item.valor, percentual, valor_comissao]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ ok: true, message: 'Comanda finalizada, agendamento concluído e comissões creditadas' });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao finalizar comanda:', err);
    res.status(500).json({ erro: 'Erro ao finalizar comanda' });
  } finally {
    client.release();
  }
});
```

#### GET /api/comandas

**Protect with permission:**
```javascript
router.get('/', autenticar, verificarPermissao('comandas'), async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM comandas WHERE barbearia_id = $1 ORDER BY abertura DESC',
    [req.barbeariaId]
  );
  res.json(rows);
});
```


#### GET /api/comissoes

**Filter by profissional_id for staff:**
```javascript
router.get('/', autenticar, async (req, res) => {
  let sql = 'SELECT c.*, cmd.numero AS comanda_numero FROM comissoes c ' +
            'LEFT JOIN comandas cmd ON cmd.id = c.comanda_id ' +
            'WHERE c.barbearia_id = $1';
  
  const params = [req.barbeariaId];
  
  // Barbeiro vê apenas suas comissões
  if (req.user.role === 'staff' && req.user.profissional_id) {
    sql += ' AND c.profissional_id = $2';
    params.push(req.user.profissional_id);
  }
  
  sql += ' ORDER BY c.created_at DESC';
  
  const { rows } = await query(sql, params);
  res.json(rows);
});
```

#### GET /api/comissoes/saldo

**Calculate balance only for current profissional:**
```javascript
router.get('/saldo', autenticar, async (req, res) => {
  let sql = 'SELECT ' +
            'COALESCE(SUM(CASE WHEN status = \'pendente\' THEN valor_comissao ELSE 0 END), 0) AS pendente, ' +
            'COALESCE(SUM(CASE WHEN status = \'pago\' THEN valor_comissao ELSE 0 END), 0) AS pago ' +
            'FROM comissoes WHERE barbearia_id = $1';
  
  const params = [req.barbeariaId];
  
  if (req.user.role === 'staff' && req.user.profissional_id) {
    sql += ' AND profissional_id = $2';
    params.push(req.user.profissional_id);
  }
  
  const { rows } = await query(sql, params);
  res.json(rows[0]);
});
```


## Frontend Design

### Permission Helpers (api.js)

```javascript
// Add to api.js
const API = {
  // ... existing methods ...
  
  getUser() {
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch {
      return null;
    }
  },
  
  hasPermission(permissao) {
    const user = this.getUser();
    if (!user) return false;
    
    // Owner e Admin têm acesso total
    if (user.role === 'owner' || user.role === 'admin') return true;
    
    // Staff precisa verificar permissoes
    const permissoes = user.permissoes || {};
    return permissoes[permissao] === true;
  },
  
  isStaff() {
    const user = this.getUser();
    return user && user.role === 'staff';
  },
  
  isAdmin() {
    const user = this.getUser();
    return user && (user.role === 'owner' || user.role === 'admin');
  }
};
```

### Modified barbeiro.html

**Remove "Concluir" button, add "Bloquear Horário" button:**

```javascript
// In renderizar() function
function renderizar() {
  const el = document.getElementById('agenda-lista');
  let lista = todosAgendamentos;
  if (filtroAtual !== 'todos') lista = lista.filter(a => a.status === filtroAtual);
  
  if (!lista.length) {
    el.innerHTML = '<div class="empty"><i class="fas fa-calendar-check"></i>Nenhum agendamento nesse dia</div>';
    return;
  }

  
  el.innerHTML = lista.map(a => {
    const hora = formatarHora(a.data_hora);
    const valor = a.preco ? 'R$ ' + parseFloat(a.preco).toFixed(2) : '';
    
    // Identificar bloqueios
    const isBloqueio = a.tipo_bloqueio !== null;
    const bloqueioLabel = {
      'intervalo': '🍽️ Intervalo',
      'compromisso': '📅 Compromisso',
      'folga': '🏖️ Folga'
    }[a.tipo_bloqueio] || '🚫 Bloqueado';
    
    const statusTexto = a.status === 'cancelado' 
      ? '<span style="color:var(--error);font-weight:var(--font-bold);font-size:var(--text-xs);text-transform:uppercase;display:block;margin-top:4px;">❌ CANCELADO</span>' 
      : '';
    
    return `
      <div class="ag-card st-${a.status} ${isBloqueio ? 'ag-bloqueio' : ''}">
        <div class="ag-hora">${hora}</div>
        <div class="ag-info">
          <div class="ag-cliente">${isBloqueio ? bloqueioLabel : (a.cliente_nome || 'Cliente')}</div>
          <div class="ag-serv">${isBloqueio ? (a.observacoes || 'Horário bloqueado') : (a.servico_nome || 'Serviço')} ${valor ? ' • ' + valor : ''}${statusTexto}</div>
        </div>
        <div class="ag-acoes">
          ${a.status === 'agendado' && !isBloqueio ? `<button onclick="mudarStatus('${a.id}','confirmado')" title="Confirmar"><i class="fas fa-check"></i></button>` : ''}
          ${a.status !== 'cancelado' && a.status !== 'concluido' ? `<button onclick="mudarStatus('${a.id}','cancelado')" title="Cancelar"><i class="fas fa-times"></i></button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
```

**Add "Bloquear Horário" FAB button:**

```html
<!-- Add after agenda-lista div -->
<button class="fab" onclick="abrirModalBloqueio()" title="Bloquear horário">
  <i class="fas fa-ban"></i>
</button>
```


**Add Modal for Bloqueio:**

```html
<!-- Modal Bloquear Horário -->
<div class="modal-overlay" id="modal-bloqueio">
  <div class="modal">
    <div class="modal-title">Bloquear Horário</div>
    <div id="bloqueio-alerta" class="alert"></div>
    
    <div class="field">
      <label>Data</label>
      <input class="input" type="date" id="bloqueio-data" />
    </div>
    
    <div class="field">
      <label>Horário</label>
      <input class="input" type="time" id="bloqueio-hora" step="1800" />
    </div>
    
    <div class="field">
      <label>Tipo de Bloqueio</label>
      <select class="input" id="bloqueio-tipo">
        <option value="intervalo">🍽️ Intervalo (Almoço/Lanche)</option>
        <option value="compromisso">📅 Compromisso Pessoal</option>
        <option value="folga">🏖️ Folga/Descanso</option>
      </select>
    </div>
    
    <div class="field">
      <label>Observações (opcional)</label>
      <input class="input" id="bloqueio-obs" placeholder="Ex: Consulta médica" />
    </div>
    
    <div style="display:flex; gap: var(--space-sm); margin-top: var(--space-md);">
      <button class="btn btn-secondary btn-full" onclick="fecharModalBloqueio()">Cancelar</button>
      <button class="btn btn-primary btn-full" id="btn-bloqueio" onclick="salvarBloqueio()">Bloquear</button>
    </div>
  </div>
</div>
```

**JavaScript functions for bloqueio:**

```javascript
function abrirModalBloqueio() {
  document.getElementById('bloqueio-data').value = dataISO(dataAtual);
  document.getElementById('bloqueio-hora').value = '';
  document.getElementById('bloqueio-tipo').value = 'intervalo';
  document.getElementById('bloqueio-obs').value = '';
  document.getElementById('bloqueio-alerta').className = 'alert';
  document.getElementById('modal-bloqueio').classList.add('open');
}

function fecharModalBloqueio() {
  document.getElementById('modal-bloqueio').classList.remove('open');
}

async function salvarBloqueio() {

  const data = document.getElementById('bloqueio-data').value;
  const hora = document.getElementById('bloqueio-hora').value;
  const tipo = document.getElementById('bloqueio-tipo').value;
  const obs = document.getElementById('bloqueio-obs').value;
  
  const alerta = document.getElementById('bloqueio-alerta');
  
  if (!data || !hora) {
    alerta.textContent = 'Data e horário são obrigatórios';
    alerta.className = 'alert error';
    return;
  }
  
  const btn = document.getElementById('btn-bloqueio');
  btn.disabled = true;
  btn.textContent = 'Bloqueando...';
  
  try {
    const user = API.getUser();
    await API.post('/agendamentos', {
      profissional_id: user.profissional_id,
      data_hora: `${data}T${hora}:00`,
      tipo_bloqueio: tipo,
      observacoes: obs || null,
      duracao_minutos: 30
    });
    
    fecharModalBloqueio();
    await carregar();
  } catch (e) {
    alerta.textContent = e.message;
    alerta.className = 'alert error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Bloquear';
  }
}
```

**Add CSS for bloqueio:**

```css
.ag-bloqueio {
  background: repeating-linear-gradient(
    45deg,
    var(--bg-card),
    var(--bg-card) 10px,
    var(--bg-secondary) 10px,
    var(--bg-secondary) 20px
  );
  border-left-color: var(--text-muted) !important;
}
```


### Navigation Filtering

**Modify sidebar and bottom-nav to filter based on permissions:**

```javascript
// Add to barbeiro.html (and other pages)
document.addEventListener('DOMContentLoaded', function() {
  const user = API.getUser();
  
  if (user && user.role === 'staff') {
    // Ocultar links que barbeiro não deve ver
    const linksParaOcultar = [
      'dashboard-mobile.html',
      'servicos-mobile.html',
      'profissionais-mobile.html',
      'estoque-mobile.html',
      'financeiro-mobile.html',
      'relatorios-mobile.html',
      'equipe.html',
      'horarios-especiais.html'
    ];
    
    linksParaOcultar.forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(link => {
        link.style.display = 'none';
      });
    });
    
    // Ocultar seções da sidebar
    document.querySelectorAll('.nav-section').forEach(section => {
      if (section.textContent.includes('Gestão') || section.textContent.includes('Outros')) {
        section.style.display = 'none';
      }
    });
  }
});
```

### Modified configuracoes-mobile.html for Barbeiro

**Create simplified version for staff:**

```javascript
document.addEventListener('DOMContentLoaded', async function() {
  const user = API.getUser();
  
  if (user && user.role === 'staff') {
    // Ocultar seções que barbeiro não deve ver
    const secoesParaOcultar = [
      'Negócio',
      'WhatsApp',
      'Agente de IA',
      'Sistema'
    ];
    
    document.querySelectorAll('.config-section').forEach(section => {
      const title = section.querySelector('.section-title');
      if (title && secoesParaOcultar.some(s => title.textContent.includes(s))) {
        section.style.display = 'none';
      }
    });
    
    // Adicionar seção de configurações pessoais
    const mainContent = document.querySelector('.main-content');
    const configPessoal = document.createElement('div');
    configPessoal.className = 'config-section';

    configPessoal.innerHTML = `
      <h2 class="section-title"><i class="fas fa-user section-icon"></i> Meu Perfil</h2>
      <div class="config-cards">
        <div class="config-card">
          <div class="config-item" onclick="alterarSenha()">
            <div class="config-icon"><i class="fas fa-key"></i></div>
            <div class="config-content">
              <div class="config-label">Alterar Senha</div>
              <div class="config-description">Trocar sua senha de acesso</div>
            </div>
            <i class="fas fa-chevron-right config-arrow"></i>
          </div>
          
          <div class="config-item" onclick="editarTelefone()">
            <div class="config-icon"><i class="fas fa-phone"></i></div>
            <div class="config-content">
              <div class="config-label">Telefone</div>
              <div class="config-value" id="user-telefone">Não cadastrado</div>
            </div>
            <i class="fas fa-chevron-right config-arrow"></i>
          </div>
        </div>
      </div>
    `;
    mainContent.insertBefore(configPessoal, mainContent.firstChild);
  }
});
```

## Security Considerations

### 1. Token-Based Authentication
- JWT token contém: `sub` (user_id), `role`, `barbearia_id`, `profissional_id`
- Token expira em 7 dias (configurável)
- Refresh token não implementado (pode adicionar futuramente)

### 2. Backend Validation Priority
- NUNCA confiar apenas em validações frontend
- Sempre validar permissões no backend antes de executar ações
- Filtrar dados baseado em profissional_id no SQL (não no JavaScript)

### 3. SQL Injection Prevention
- Usar parametrized queries em todas as consultas
- Nunca concatenar strings user-input diretamente no SQL

### 4. Audit Logging
- Registrar todas as tentativas de acesso negado
- Log format: `[ACESSO NEGADO] Usuario: {id}, Endpoint: {path}, Permissao: {perm}`
- Usar log level WARN para acesso negado, ERROR para múltiplas tentativas


### 5. JSONB Injection Prevention
- Validar estrutura do campo permissoes antes de usar
- Aceitar apenas keys conhecidas: clientes, comandas, gerenciar_agenda, relatorios
- Validar que valores são boolean

### 6. Rate Limiting
- Implementar rate limiting para tentativas de login (futuro)
- Bloquear temporariamente após múltiplas tentativas de acesso negado

## Testing Strategy

### Unit Tests

```javascript
// test/middleware/auth.test.js
describe('verificarPermissao middleware', () => {
  it('should allow owner to access any resource', async () => {
    const req = { user: { role: 'owner' } };
    const res = mockResponse();
    const next = jest.fn();
    
    await verificarPermissao('comandas')(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
  
  it('should deny staff without permission', async () => {
    const req = { 
      user: { role: 'staff', profissional_id: 'prof-123' },
      path: '/api/comandas'
    };
    const res = mockResponse();
    const next = jest.fn();
    
    // Mock query to return permissoes
    query.mockResolvedValue({ 
      rows: [{ permissoes: { comandas: false } }] 
    });
    
    await verificarPermissao('comandas')(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  
  it('should allow staff with permission', async () => {
    const req = { 
      user: { role: 'staff', profissional_id: 'prof-123' }
    };
    const res = mockResponse();
    const next = jest.fn();
    
    query.mockResolvedValue({ 
      rows: [{ permissoes: { comandas: true } }] 
    });
    
    await verificarPermissao('comandas')(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
```


### Integration Tests

```javascript
// test/routes/agendamentos.test.js
describe('GET /api/agendamentos', () => {
  it('should filter agendamentos by profissional_id for staff', async () => {
    const token = generateToken({ 
      role: 'staff', 
      profissional_id: 'prof-123',
      barbearia_id: 'barb-456'
    });
    
    const res = await request(app)
      .get('/api/agendamentos?data=2024-06-20')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    
    // Verificar que todos os agendamentos pertencem ao profissional
    res.body.forEach(ag => {
      expect(ag.profissional_id).toBe('prof-123');
    });
  });
  
  it('should return all agendamentos for owner', async () => {
    const token = generateToken({ 
      role: 'owner',
      barbearia_id: 'barb-456'
    });
    
    const res = await request(app)
      .get('/api/agendamentos?data=2024-06-20')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    // Owner vê agendamentos de todos os profissionais
    const profissionais = [...new Set(res.body.map(a => a.profissional_id))];
    expect(profissionais.length).toBeGreaterThan(1);
  });
});
```

### Property-Based Tests

```javascript
// test/properties/permissions.test.js
import fc from 'fast-check';

describe('Permission system properties', () => {
  it('round-trip property: parse then stringify should be idempotent', () => {
    fc.assert(
      fc.property(
        fc.record({
          clientes: fc.boolean(),
          comandas: fc.boolean(),
          gerenciar_agenda: fc.boolean(),
          relatorios: fc.boolean()
        }),
        (permissoes) => {
          const parsed = JSON.parse(JSON.stringify(permissoes));
          expect(parsed).toEqual(permissoes);
        }
      )
    );
  });
  
  it('metamorphic: adding permission should not reduce access', () => {
    fc.assert(
      fc.property(
        fc.record({
          clientes: fc.boolean(),
          comandas: fc.boolean(),
          gerenciar_agenda: fc.boolean(),
          relatorios: fc.boolean()
        }),
        (permissoes) => {

          const recursos1 = countPermissions(permissoes);
          
          // Adicionar mais uma permissão
          const permissoes2 = { ...permissoes, relatorios: true };
          const recursos2 = countPermissions(permissoes2);
          
          expect(recursos2).toBeGreaterThanOrEqual(recursos1);
        }
      )
    );
  });
});

function countPermissions(permissoes) {
  return Object.values(permissoes).filter(v => v === true).length;
}
```

## Migration Plan

### Phase 1: Database Schema (Non-Breaking)
```sql
-- Run these migrations first (safe, won't break existing code)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS tipo_bloqueio VARCHAR(30);
ALTER TABLE profissionais ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{"clientes":true,"comandas":false,"gerenciar_agenda":false,"relatorios":false}';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES profissionais(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional_data ON agendamentos(profissional_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_comissoes_profissional_status ON comissoes(profissional_id, status);
```

### Phase 2: Backend Middleware (Non-Breaking)
- Add `verificarPermissao` middleware to auth.js
- Add helpers `hasPermission`, `getUser` to api.js
- Don't apply to routes yet (allows testing without breaking)

### Phase 3: Backend Routes (Breaking - Deploy with Care)
- Modify GET /api/agendamentos to filter by profissional_id
- Modify PATCH /api/agendamentos/:id/status to block "concluido" for staff
- Modify PATCH /api/comandas/:id/finalizar to auto-complete agendamento
- Add verificarPermissao to protected routes

### Phase 4: Frontend Updates
- Remove "Concluir" button from barbeiro.html
- Add "Bloquear Horário" functionality
- Filter navigation based on role
- Simplify configuracoes-mobile.html for staff

### Phase 5: Data Migration (If Needed)
```sql
-- Vincular usuários staff existentes a profissionais
UPDATE usuarios u
SET profissional_id = p.id
FROM profissionais p
WHERE u.role = 'staff' 
  AND u.barbearia_id = p.barbearia_id
  AND LOWER(u.nome) = LOWER(p.nome)
  AND u.profissional_id IS NULL;
```

## Performance Considerations

1. **Index Usage**: Queries filtradas por profissional_id usam índice composto
2. **JSONB Performance**: Campo permissoes é pequeno, parsing é rápido
3. **Transaction Overhead**: Fechamento de comanda usa transação, mas é operação rara
4. **Caching**: Considerar cache de permissoes no token JWT (já implementado)

## Rollback Strategy

1. **Database**: Migrações são idempotentes (ADD IF NOT EXISTS)
2. **Backend**: Manter código antigo comentado por 1 sprint
3. **Frontend**: Deploy gradual (feature flag?)
4. **Monitoring**: Alertas para HTTP 403 em excesso (indica problema de permissões)
