/**
 * ============================================================
 * MIDDLEWARE DE CONTROLE DE PERMISSÕES
 * ============================================================
 * 
 * Sistema de autorização baseado em roles e permissões JSONB.
 * 
 * ROLES:
 * - owner: Dono da barbearia (acesso total)
 * - admin: Administrador (acesso total exceto configurações críticas)
 * - staff: Barbeiro comum (acesso limitado conforme permissões)
 * 
 * PERMISSÕES (campo JSONB em profissionais):
 * {
 *   "clientes": true,              // Ver todos os clientes
 *   "comandas": false,             // Acessar comandas
 *   "gerenciar_agenda": false,     // Ver agenda de outros barbeiros
 *   "relatorios": false            // Acessar relatórios
 * }
 */

import { query } from '../config/database.js';

/**
 * Carrega permissões do usuário staff (barbeiro)
 * Retorna permissões do profissional vinculado
 */
async function carregarPermissoesStaff(usuarioId, barbeariaId) {
  const { rows } = await query(
    `SELECT p.permissoes, p.id as profissional_id, p.nome as profissional_nome
       FROM usuarios u
       JOIN profissionais p ON p.id = u.profissional_id
      WHERE u.id = $1 AND u.barbearia_id = $2 AND u.role = 'staff'`,
    [usuarioId, barbeariaId]
  );
  
  if (rows.length === 0) {
    return {
      profissional_id: null,
      profissional_nome: null,
      permissoes: {
        clientes: true,
        comandas: false,
        gerenciar_agenda: false,
        relatorios: false,
      },
    };
  }
  
  return {
    profissional_id: rows[0].profissional_id,
    profissional_nome: rows[0].profissional_nome,
    permissoes: rows[0].permissoes || {
      clientes: true,
      comandas: false,
      gerenciar_agenda: false,
      relatorios: false,
    },
  };
}

/**
 * Middleware: Verifica se usuário tem permissão específica
 * 
 * Uso:
 * router.get('/api/comandas', autenticar, requerPermissao('comandas'), async (req, res) => { ... });
 */
export function requerPermissao(permissao) {
  return async (req, res, next) => {
    // Owner e Admin sempre têm permissão
    if (req.role === 'owner' || req.role === 'admin') {
      return next();
    }
    
    // Staff: verificar permissões
    if (req.role === 'staff') {
      const { permissoes } = await carregarPermissoesStaff(req.userId, req.barbeariaId);
      
      if (!permissoes[permissao]) {
        return res.status(403).json({
          erro: 'Acesso negado',
          mensagem: `Você não tem permissão para acessar ${permissao}`,
          permissao_necessaria: permissao,
        });
      }
      
      // Adiciona permissões no req para uso posterior
      req.permissoes = permissoes;
      return next();
    }
    
    // Role desconhecida
    return res.status(403).json({ erro: 'Role inválida' });
  };
}

/**
 * Middleware: Requer role específica
 * 
 * Uso:
 * router.post('/api/profissionais', autenticar, requerRole(['owner', 'admin']), async (req, res) => { ... });
 */
export function requerRole(rolesPermitidas) {
  return (req, res, next) => {
    if (!Array.isArray(rolesPermitidas)) {
      rolesPermitidas = [rolesPermitidas];
    }
    
    if (!rolesPermitidas.includes(req.role)) {
      return res.status(403).json({
        erro: 'Acesso negado',
        mensagem: 'Você não tem permissão para realizar esta ação',
        role_necessaria: rolesPermitidas.join(' ou '),
        sua_role: req.role,
      });
    }
    
    next();
  };
}

/**
 * Middleware: Injeta contexto de permissões no req
 * Usado em rotas que precisam filtrar dados baseado em permissões
 * 
 * Uso:
 * router.get('/api/agendamentos', autenticar, injetarContextoPermissoes, async (req, res) => {
 *   // req.contexto contém: role, profissional_id, permissoes
 * });
 */
export async function injetarContextoPermissoes(req, res, next) {
  req.contexto = {
    role: req.role,
    profissional_id: null,
    profissional_nome: null,
    permissoes: null,
  };
  
  // Owner/Admin: contexto completo
  if (req.role === 'owner' || req.role === 'admin') {
    req.contexto.permissoes = {
      clientes: true,
      comandas: true,
      gerenciar_agenda: true,
      relatorios: true,
    };
    return next();
  }
  
  // Staff: carrega permissões e profissional vinculado
  if (req.role === 'staff') {
    const { profissional_id, profissional_nome, permissoes } = await carregarPermissoesStaff(req.userId, req.barbeariaId);
    req.contexto.profissional_id = profissional_id;
    req.contexto.profissional_nome = profissional_nome;
    req.contexto.permissoes = permissoes;
  }
  
  next();
}

/**
 * Helper: Aplica filtro de agenda baseado em role
 * 
 * Retorna SQL WHERE adicional para filtrar agendamentos:
 * - Owner/Admin: vê tudo
 * - Staff com gerenciar_agenda: vê tudo
 * - Staff sem gerenciar_agenda: vê apenas sua própria agenda
 */
export function filtroAgendaPorRole(contexto) {
  if (contexto.role === 'owner' || contexto.role === 'admin') {
    return { sql: '', params: [] };
  }
  
  if (contexto.role === 'staff') {
    // Staff com permissão: vê tudo
    if (contexto.permissoes?.gerenciar_agenda) {
      return { sql: '', params: [] };
    }
    
    // Staff sem permissão: apenas sua própria agenda
    if (contexto.profissional_id) {
      return {
        sql: ` AND a.profissional_id = $PLACEHOLDER`,
        params: [contexto.profissional_id],
      };
    }
  }
  
  // Fallback: sem filtro (segurança: autenticar já garante barbearia_id)
  return { sql: '', params: [] };
}

/**
 * Helper: Valida se staff pode criar agendamento para outro profissional
 */
export function validarCriacaoAgendamento(contexto, profissionalIdAlvo) {
  // Owner/Admin: pode criar para qualquer um
  if (contexto.role === 'owner' || contexto.role === 'admin') {
    return { ok: true };
  }
  
  // Staff: só pode criar para si mesmo
  if (contexto.role === 'staff') {
    if (contexto.profissional_id !== profissionalIdAlvo) {
      return {
        ok: false,
        erro: 'Você só pode criar agendamentos para você mesmo',
      };
    }
  }
  
  return { ok: true };
}

/**
 * Helper: Valida se staff pode modificar agendamento
 */
export function validarModificacaoAgendamento(contexto, profissionalIdAgendamento) {
  // Owner/Admin: pode modificar qualquer um
  if (contexto.role === 'owner' || contexto.role === 'admin') {
    return { ok: true };
  }
  
  // Staff: só pode modificar seus próprios agendamentos
  if (contexto.role === 'staff') {
    if (contexto.profissional_id !== profissionalIdAgendamento) {
      return {
        ok: false,
        erro: 'Você só pode modificar seus próprios agendamentos',
      };
    }
  }
  
  return { ok: true };
}

/**
 * Helper: Valida se staff pode concluir agendamento manualmente
 */
export function validarConclusaoManual(contexto) {
  // Owner/Admin: pode concluir manualmente
  if (contexto.role === 'owner' || contexto.role === 'admin') {
    return { ok: true };
  }
  
  // Staff: NÃO pode concluir manualmente
  if (contexto.role === 'staff') {
    return {
      ok: false,
      erro: 'Barbeiros não podem concluir agendamentos manualmente. O agendamento é concluído automaticamente quando a comanda é fechada pelo caixa.',
    };
  }
  
  return { ok: true };
}

export default {
  requerPermissao,
  requerRole,
  injetarContextoPermissoes,
  filtroAgendaPorRole,
  validarCriacaoAgendamento,
  validarModificacaoAgendamento,
  validarConclusaoManual,
};
