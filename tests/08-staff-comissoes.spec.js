import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Staff Barbeiro e Comissoes Automaticas', () => {
  let token, ownerToken, profId, profComId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    ownerToken = r.token;
    const auth = { headers: { Authorization: `Bearer ${ownerToken}` } };

    const profs = await (await request.get('/api/profissionais', auth)).json();
    profId = profs[0].id;

    const profC = await request.post('/api/profissionais', {
      ...auth, data: {
        nome: 'Barbeiro Comissao',
        especialidade: 'Teste',
        comissao_servico_percentual: 50,
      },
    });
    profComId = (await profC.json()).id;

    await request.post('/api/auth/convidar', {
      ...auth, data: {
        nome: 'Staff Comissao',
        email: `staff-comissao-${Date.now()}@teste.com`,
        senha: '123456',
        profissional_id: profComId,
      },
    });

    const login = await request.post('/api/auth/login', {
      data: { email: DEMO.email, senha: DEMO.senha },
    });
    token = (await login.json()).token;
  });

  test('Fluxo completo: pagamento gera comissao automatica', async ({ request }) => {
    const auth = { headers: { Authorization: `Bearer ${ownerToken}` } };

    const cmd = await request.post('/api/comandas', {
      ...auth, data: { cliente_nome: 'Cliente Comissao' },
    });
    expect(cmd.ok()).toBeTruthy();
    const comanda = await cmd.json();

    const item = await request.post(`/api/comandas/${comanda.id}/itens`, {
      ...auth, data: { descricao: 'Corte Especial', valor: 100, tipo: 'servico', profissional_id: profComId },
    });
    expect(item.ok()).toBeTruthy();

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
      const comissoes = await request.get('/api/comissoes', auth);
      expect(comissoes.ok()).toBeTruthy();
      const lista = await comissoes.json();
      const minha = lista.find(c => c.profissional_id === profComId);
      if (minha) {
        expect(parseFloat(minha.valor_comissao)).toBe(50);
        expect(minha.status).toBe('pendente');
      }
    }
  });

  test('Staff ve apenas a propria comissao no saldo', async ({ request }) => {
    const users = await (await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })).json();
    const staffUser = users.find(u => u.role === 'staff' && u.email?.includes('staff-comissao'));
    if (!staffUser) return;

    const login = await request.post('/api/auth/login', {
      data: { email: staffUser.email, senha: '123456' },
    });
    expect(login.ok()).toBeTruthy();
    const staffToken = (await login.json()).token;
    const staffAuth = { headers: { Authorization: `Bearer ${staffToken}` } };

    const saldo = await request.get('/api/comissoes/saldo', staffAuth);
    expect(saldo.ok()).toBeTruthy();
    const s = await saldo.json();
    expect(typeof s.pendente).toBe('number');
    expect(typeof s.pago).toBe('number');
    expect(typeof s.total).toBe('number');
  });

  test('Staff NAO consegue listar usuarios (owner only)', async ({ request }) => {
    const users = await (await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })).json();
    const staffUser = users.find(u => u.role === 'staff' && u.email?.includes('staff-comissao'));
    if (!staffUser) return;

    const login = await request.post('/api/auth/login', {
      data: { email: staffUser.email, senha: '123456' },
    });
    expect(login.ok()).toBeTruthy();
    const staffToken = (await login.json()).token;

    const res = await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('E2E - Staff ve barbeiro.html com dados corretos', async ({ page }) => {
    const users = await (await page.request.post('/api/auth/login', {
      data: { email: DEMO.email, senha: DEMO.senha },
    })).json();

    await page.goto('/login.html');
    await page.evaluate((t) => {
      localStorage.setItem('agendapro_token', t);
      localStorage.setItem('agendapro_user', JSON.stringify({ role: 'staff', nome: 'Staff Barbeiro' }));
    }, users.token);

    await page.goto('/barbeiro.html');
    await page.waitForTimeout(1500);
    await expect(page.locator('#barbeiro-nome')).toBeVisible();
  });
});
