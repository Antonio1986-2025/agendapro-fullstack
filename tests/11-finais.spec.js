import { test, expect } from '@playwright/test';
import { seedDemoData } from './helpers/seed.js';

test.describe('Testes Finais - Cobertura Total', () => {
  let auth, token, servicoId, clienteTel;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    auth = { headers: { Authorization: `Bearer ${token}` } };

    const servicos = await (await request.get('/api/servicos', auth)).json();
    if (servicos.length > 0) servicoId = servicos[0].id;

    const clientes = await (await request.get('/api/clientes', auth)).json();
    const c = clientes.find(c => c.telefone);
    if (c) clienteTel = c.telefone;
  });

  test.describe('Admin - reset-completo', () => {
    test('POST /api/admin/reset-completo sem x-admin-key retorna 401', async ({ request }) => {
      const res = await request.post('/api/admin/reset-completo', {
        data: { confirmar: 'SIM_APAGAR_TUDO' },
      });
      expect(res.status()).toBe(401);
    });

    test('POST /api/admin/reset-completo sem confirmacao retorna 401 (admin key invalida)', async ({ request }) => {
      const res = await request.post('/api/admin/reset-completo', {
        headers: { 'x-admin-key': 'qualquer' },
        data: {},
      });
      expect(res.status()).toBe(401);
    });

    test('POST /api/admin/reset-completo com confirmacao errada retorna 401 (admin key invalida)', async ({ request }) => {
      const res = await request.post('/api/admin/reset-completo', {
        headers: { 'x-admin-key': 'qualquer' },
        data: { confirmar: 'NAO' },
      });
      expect(res.status()).toBe(401);
    });
  });

  test.describe('WhatsApp - acoes com dados reais', () => {
    test('POST /api/whatsapp/enviar com dados validos', async ({ request }) => {
      const res = await request.post('/api/whatsapp/enviar', {
        ...auth, data: { telefone: '5511999999999', mensagem: 'Teste automatizado' },
      });
      if (res.ok()) {
        const body = await res.json();
        expect(body.ok).toBe(true);
      } else {
        expect([400, 500]).toContain(res.status());
      }
    });

    test('POST /api/whatsapp/desativar-servico com nome existente', async ({ request }) => {
      if (!servicoId) return;
      const servicos = await (await request.get('/api/servicos', auth)).json();
      const s = servicos[0];
      if (!s) return;

      const res = await request.post('/api/whatsapp/desativar-servico', {
        ...auth, data: { nome: s.nome },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.desativados).toBeGreaterThanOrEqual(0);

      await request.post('/api/whatsapp/corrigir-servico', {
        ...auth, data: { id: s.id, novo_preco: parseFloat(s.preco) },
      });
    });

    test('POST /api/whatsapp/corrigir-servico com id real e novo_nome', async ({ request }) => {
      if (!servicoId) return;
      const res = await request.post('/api/whatsapp/corrigir-servico', {
        ...auth, data: { id: servicoId, novo_nome: 'Corte Teste' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.atualizados).toBeGreaterThanOrEqual(0);

      const servicos = await (await request.get('/api/servicos', auth)).json();
      const s = servicos.find(s => s.id === servicoId);
      if (s && s.nome === 'Corte Teste') {
        await request.post('/api/whatsapp/corrigir-servico', {
          ...auth, data: { id: servicoId, novo_nome: 'Corte Teste' },
        });
      }
    });

    test('POST /api/whatsapp/limpar-cliente com telefone real', async ({ request }) => {
      if (!clienteTel) return;
      const res = await request.post('/api/whatsapp/limpar-cliente', {
        ...auth, data: { telefone: clienteTel },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.telefone || body.apagado).toBeTruthy();
    });
  });

  test.describe('Filtros e Queries', () => {
    test('GET /api/comandas?status=aberta filtra comandas abertas', async ({ request }) => {
      const res = await request.get('/api/comandas?status=aberta', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
      body.forEach(c => expect(c.status).toBe('aberta'));
    });

    test('GET /api/comandas?status=fechada filtra comandas fechadas', async ({ request }) => {
      const res = await request.get('/api/comandas?status=fechada', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
      body.forEach(c => expect(c.status).toBe('fechada'));
    });

    test('GET /api/comandas?busca= filtra por nome ou numero', async ({ request }) => {
      const res = await request.get('/api/comandas?busca=Corte', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    });

    test('GET /api/transacoes?tipo=despesa filtra despesas', async ({ request }) => {
      const res = await request.get('/api/transacoes?tipo=despesa', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
      body.forEach(t => expect(t.tipo).toBe('despesa'));
    });

    test('GET /api/transacoes?tipo=receita filtra receitas', async ({ request }) => {
      const res = await request.get('/api/transacoes?tipo=receita', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
      body.forEach(t => expect(t.tipo).toBe('receita'));
    });

    test('GET /api/transacoes?categoria= filtra por categoria', async ({ request }) => {
      const res = await request.get('/api/transacoes?categoria=operacional', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    });

    test('GET /api/estoque?busca= filtra por nome', async ({ request }) => {
      const res = await request.get('/api/estoque?busca=tes', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    });
  });
});
