import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// 🛡️ PROTEÇÃO: Dashboard com relatórios requer permissão
router.use(requerPermissao('relatorios'));

// GET /api/dashboard  -> metricas resumidas
router.get('/', async (req, res) => {
  const id = req.barbeariaId;

  const [hoje, mes, clientes, profissionais, proximos] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1 AND data_hora::date = CURRENT_DATE
          AND status <> 'cancelado'`,
      [id]
    ),
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1
          AND date_trunc('month', data_hora) = date_trunc('month', CURRENT_DATE)
          AND status <> 'cancelado'`,
      [id]
    ),
    query(`SELECT COUNT(*)::int AS total FROM clientes WHERE barbearia_id = $1`, [id]),
    query(`SELECT COUNT(*)::int AS total FROM profissionais WHERE barbearia_id = $1 AND ativo = true`, [id]),
    query(
      `SELECT a.id, a.data_hora, a.status,
              c.nome AS cliente_nome, p.nome AS profissional_nome, s.nome AS servico_nome
         FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.barbearia_id = $1 AND a.data_hora >= now() AND a.status <> 'cancelado'
        ORDER BY a.data_hora ASC LIMIT 5`,
      [id]
    ),
  ]);

  res.json({
    hoje: { agendamentos: hoje.rows[0].total, faturamento: Number(hoje.rows[0].faturamento) },
    mes: { agendamentos: mes.rows[0].total, faturamento: Number(mes.rows[0].faturamento) },
    clientes_ativos: clientes.rows[0].total,
    profissionais: profissionais.rows[0].total,
    proximos: proximos.rows,
  });
});

// GET /api/dashboard/relatorios?dias=30  -> metricas detalhadas para relatorios
router.get('/relatorios', async (req, res) => {
  const id = req.barbeariaId;
  const dias = Math.min(Math.max(parseInt(req.query.dias) || 30, 1), 90);

  const [
    periodoAtual,
    periodoAnterior,
    faturamentoDiario,
    servicos,
    clientesNoPeriodo,
    presenca,
    ocupacao,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total_agendamentos,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND status <> 'cancelado'`,
      [id, dias]
    ),
    query(
      `SELECT COUNT(*)::int AS total_agendamentos,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND data_hora::date < CURRENT_DATE - (($2 - 1) || ' days')::interval
          AND status <> 'cancelado'`,
      [id, dias]
    ),
    query(
      `SELECT data_hora::date AS data,
              COALESCE(SUM(preco),0)::numeric AS valor
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND status <> 'cancelado'
        GROUP BY data_hora::date
        ORDER BY data_hora::date`,
      [id, dias]
    ),
    query(
      `SELECT s.nome,
              COUNT(*)::int AS quantidade,
              COALESCE(SUM(a.preco),0)::numeric AS faturamento
         FROM agendamentos a
         JOIN servicos s ON s.id = a.servico_id
        WHERE a.barbearia_id = $1
          AND a.data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND a.status <> 'cancelado'
        GROUP BY s.id, s.nome
        ORDER BY COUNT(*) DESC
        LIMIT 10`,
      [id, dias]
    ),
    query(
      `SELECT COUNT(DISTINCT cliente_id)::int AS total
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND status <> 'cancelado'`,
      [id, dias]
    ),
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'concluido')::int AS concluidos
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND data_hora < now()
          AND status IN ('concluido', 'cancelado')`,
      [id, dias]
    ),
    query(
      `SELECT COALESCE(SUM(duracao_minutos),0)::int AS minutos_ocupados,
              (SELECT COUNT(*)::int FROM profissionais
                WHERE barbearia_id = $1 AND ativo = true) AS prof_ativos
         FROM agendamentos
        WHERE barbearia_id = $1
          AND data_hora::date >= CURRENT_DATE - ($2 || ' days')::interval
          AND status <> 'cancelado'`,
      [id, dias]
    ),
  ]);

  const atual = periodoAtual.rows[0];
  const anterior = periodoAnterior.rows[0];
  const fatTotal = Number(atual.faturamento);
  const fatAnt = Number(anterior.faturamento);
  const variacao = fatAnt > 0 ? ((fatTotal - fatAnt) / fatAnt) * 100 : 0;
  const agTotal = atual.total_agendamentos;
  const agAnt = anterior.total_agendamentos;
  const variacaoAg = agAnt > 0 ? ((agTotal - agAnt) / agAnt) * 100 : 0;

  const presencaRow = presenca.rows[0];
  const presencaPerc = presencaRow.total > 0
    ? Math.round((presencaRow.concluidos / presencaRow.total) * 100)
    : 0;

  const ocupRow = ocupacao.rows[0];
  const minutosOcup = ocupRow.minutos_ocupados;
  const profAtivos = ocupRow.prof_ativos || 1;
  const minutosDisponiveis = dias * profAtivos * 8 * 60;
  const ocupacaoPerc = minutosDisponiveis > 0
    ? Math.round((minutosOcup / minutosDisponiveis) * 100)
    : 0;

  res.json({
    faturamento: fatTotal,
    faturamento_anterior: fatAnt,
    variacao_percentual: Math.round(variacao * 10) / 10,
    agendamentos: agTotal,
    agendamentos_anterior: agAnt,
    variacao_agendamentos: Math.round(variacaoAg * 10) / 10,
    clientes: clientesNoPeriodo.rows[0].total,
    presenca_percentual: presencaPerc,
    ocupacao_percentual: Math.min(ocupacaoPerc, 100),
    faturamento_diario: faturamentoDiario.rows.map(r => ({
      data: r.data,
      valor: Number(r.valor),
    })),
    servicos_mais_vendidos: servicos.rows.map(r => ({
      nome: r.nome,
      quantidade: r.quantidade,
      faturamento: Number(r.faturamento),
    })),
  });
});

export default router;
