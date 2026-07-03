import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Funcionalidades Avancadas', () => {
  let token, auth, profId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    auth = { headers: { Authorization: `Bearer ${token}` } };

    const profs = await (await request.get('/api/profissionais', auth)).json();
    profId = profs[0].id;
  });

  test('GET /api/comandas/:id retorna detalhes com itens', async ({ request }) => {
    const cmd = await request.post('/api/comandas', {
      ...auth, data: { cliente_nome: 'Teste Detalhes' },
    });
    expect(cmd.ok()).toBeTruthy();
    const comanda = await cmd.json();

    const item = await request.post(`/api/comandas/${comanda.id}/itens`, {
      ...auth, data: { descricao: 'Corte', valor: 50, tipo: 'servico', profissional_id: profId },
    });
    expect(item.ok()).toBeTruthy();

    const det = await request.get(`/api/comandas/${comanda.id}`, auth);
    expect(det.ok()).toBeTruthy();
    const d = await det.json();
    expect(d.id).toBe(comanda.id);
    expect(d.cliente_nome).toBe('Teste Detalhes');
    expect(Array.isArray(d.itens)).toBeTruthy();
    expect(d.itens.length).toBe(1);
    expect(d.itens[0].descricao).toBe('Corte');
  });

  test('DELETE /api/comandas/:id/itens/:itemId remove item e atualiza total', async ({ request }) => {
    const cmd = await request.post('/api/comandas', {
      ...auth, data: { cliente_nome: 'Teste Remover Item' },
    });
    expect(cmd.ok()).toBeTruthy();
    const comanda = await cmd.json();

    await request.post(`/api/comandas/${comanda.id}/itens`, {
      ...auth, data: { descricao: 'Corte', valor: 50, tipo: 'servico' },
    });
    await request.post(`/api/comandas/${comanda.id}/itens`, {
      ...auth, data: { descricao: 'Barba', valor: 20, tipo: 'servico' },
    });

    const det = await request.get(`/api/comandas/${comanda.id}`, auth);
    let d = await det.json();
    expect(d.itens.length).toBe(2);

    const del = await request.delete(`/api/comandas/${comanda.id}/itens/${d.itens[0].id}`, auth);
    expect(del.ok()).toBeTruthy();

    const det2 = await request.get(`/api/comandas/${comanda.id}`, auth);
    d = await det2.json();
    expect(d.itens.length).toBe(1);
    expect(d.itens[0].descricao).toBe('Barba');
    expect(parseFloat(d.valor)).toBe(20);
  });

  test('POST /api/comissoes/pagar paga comissoes e GET /acertos lista historico', async ({ request }) => {
    let lista = await (await request.get('/api/comissoes', auth)).json();
    let pendentes = lista.filter(c => c.status === 'pendente');

    if (pendentes.length === 0) {
      const cmd = await request.post('/api/comandas', {
        ...auth, data: { cliente_nome: 'Teste Pagar Comissao' },
      });
      expect(cmd.ok()).toBeTruthy();
      const comanda = await cmd.json();

      await request.post(`/api/comandas/${comanda.id}/itens`, {
        ...auth, data: { descricao: 'Corte', valor: 100, tipo: 'servico', profissional_id: profId },
      });

      const cx = await (await request.get('/api/caixa', auth)).json();
      let pagou = false;
      if (cx && cx.status === 'aberto') {
        const pagar = await request.patch(`/api/comandas/${comanda.id}/pagar`, {
          ...auth, data: { forma_pagamento: 'dinheiro', valor_recebido: 100 },
        });
        pagou = pagar.ok();
      } else {
        await request.post('/api/caixa/fechar', auth);
        const abrir = await request.post('/api/caixa/abrir', {
          ...auth, data: { valor_inicial: 50 },
        });
        if (abrir.ok()) {
          const pagar = await request.patch(`/api/comandas/${comanda.id}/pagar`, {
            ...auth, data: { forma_pagamento: 'dinheiro', valor_recebido: 100 },
          });
          pagou = pagar.ok();
        }
      }

      if (pagou) {
        lista = await (await request.get('/api/comissoes', auth)).json();
        pendentes = lista.filter(c => c.status === 'pendente');
      }
    }

    if (pendentes.length === 0) return;

    const ids = pendentes.map(c => c.id);
    const pagar = await request.post('/api/comissoes/pagar', {
      ...auth, data: { ids },
    });
    expect(pagar.ok()).toBeTruthy();
    const result = await pagar.json();
    expect(result.ok).toBe(true);

    const final = await (await request.get('/api/comissoes', auth)).json();
    for (const id of ids) {
      const c = final.find(c => c.id === id);
      if (c) expect(c.status).toBe('pago');
    }

    const acertos = await request.get('/api/comissoes/acertos', auth);
    expect(acertos.ok()).toBeTruthy();
    const acertosList = await acertos.json();
    expect(Array.isArray(acertosList)).toBeTruthy();
    if (acertosList.length > 0) {
      expect(acertosList[0].profissional_nome).toBeTruthy();
      expect(acertosList[0].total_comissoes).toBeGreaterThanOrEqual(1);
    }
  });

  test('PATCH /api/auth/usuarios/:id/desativar toggle ativo/inativo', async ({ request }) => {
    const email = `toggle-${Date.now()}@teste.com`;
    const conv = await request.post('/api/auth/convidar', {
      ...auth, data: { nome: 'Toggle User', email, senha: '123456' },
    });
    expect(conv.ok()).toBeTruthy();

    const users = await (await request.get('/api/auth/usuarios', auth)).json();
    const user = users.find(u => u.email === email);
    expect(user).toBeTruthy();
    const originalStatus = user.ativo;

    const des1 = await request.patch(`/api/auth/usuarios/${user.id}/desativar`, auth);
    expect(des1.ok()).toBeTruthy();

    const users2 = await (await request.get('/api/auth/usuarios', auth)).json();
    const u2 = users2.find(u => u.email === email);
    expect(u2.ativo).toBe(!originalStatus);

    const des2 = await request.patch(`/api/auth/usuarios/${user.id}/desativar`, auth);
    expect(des2.ok()).toBeTruthy();

    const users3 = await (await request.get('/api/auth/usuarios', auth)).json();
    const u3 = users3.find(u => u.email === email);
    expect(u3.ativo).toBe(originalStatus);
  });

  test('PATCH /api/auth/usuarios/:id/vincular vincula profissional ao usuario', async ({ request }) => {
    const email = `vincular-${Date.now()}@teste.com`;
    const conv = await request.post('/api/auth/convidar', {
      ...auth, data: { nome: 'Vincular User', email, senha: '123456' },
    });
    expect(conv.ok()).toBeTruthy();

    const prof = await request.post('/api/profissionais', {
      ...auth, data: { nome: 'Prof Vinculo', especialidade: 'Teste' },
    });
    expect(prof.ok()).toBeTruthy();
    const p = await prof.json();

    const users = await (await request.get('/api/auth/usuarios', auth)).json();
    const user = users.find(u => u.email === email);
    expect(user).toBeTruthy();

    const vinc = await request.patch(`/api/auth/usuarios/${user.id}/vincular`, {
      ...auth, data: { profissional_id: p.id },
    });
    expect(vinc.ok()).toBeTruthy();

    const users2 = await (await request.get('/api/auth/usuarios', auth)).json();
    const u2 = users2.find(u => u.email === email);
    expect(u2.profissional_id).toBe(p.id);

    const desvinc = await request.patch(`/api/auth/usuarios/${user.id}/vincular`, {
      ...auth, data: { profissional_id: null },
    });
    expect(desvinc.ok()).toBeTruthy();

    const users3 = await (await request.get('/api/auth/usuarios', auth)).json();
    const u3 = users3.find(u => u.email === email);
    expect(u3.profissional_id).toBeNull();
  });

  test('DELETE /api/transacoes/:id deleta transacao', async ({ request }) => {
    const tr = await request.post('/api/transacoes', {
      ...auth, data: {
        tipo: 'despesa', categoria: 'operacional', descricao: 'Transacao para deletar', valor: 99.90,
        data: new Date().toISOString().split('T')[0],
      },
    });
    if (!tr.ok()) {
      const err = await tr.text();
      console.log('Erro ao criar transacao:', err);
    }
    expect(tr.ok()).toBeTruthy();
    const t = await tr.json();

    const del = await request.delete(`/api/transacoes/${t.id}`, auth);
    expect(del.status()).toBe(204);

    const del2 = await request.delete(`/api/transacoes/${t.id}`, auth);
    expect(del2.status()).toBe(404);
  });

  test('GET /api/admin/listar-tudo requer x-admin-key', async ({ request }) => {
    const semChave = await request.get('/api/admin/listar-tudo');
    expect(semChave.status()).toBe(401);

    const chaveErrada = await request.get('/api/admin/listar-tudo', {
      headers: { 'x-admin-key': 'chave_errada' },
    });
    expect(chaveErrada.status()).toBe(401);
  });
});
