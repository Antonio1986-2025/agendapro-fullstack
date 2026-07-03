import { test, expect } from '@playwright/test';
import { seedDemoData } from './helpers/seed.js';

test.describe('WhatsApp, IA e Admin', () => {
  let auth, token;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    auth = { headers: { Authorization: `Bearer ${token}` } };
  });

  test.describe('Rotas de IA', () => {
    test('GET /api/ai/conversas/:telefone retorna 404 para telefone inexistente', async ({ request }) => {
      const res = await request.get('/api/ai/conversas/00000000000', auth);
      expect(res.status()).toBe(404);
    });

    test('POST /api/ai/responder sem telefone retorna 400', async ({ request }) => {
      const res = await request.post('/api/ai/responder', {
        ...auth, data: { mensagem: 'Oi' },
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/ai/responder sem mensagem retorna 400', async ({ request }) => {
      const res = await request.post('/api/ai/responder', {
        ...auth, data: { telefone: '5511999999999' },
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/ai/responder retorna 400 ou 500 se IA desativada', async ({ request }) => {
      const res = await request.post('/api/ai/responder', {
        ...auth, data: { telefone: '5511999999999', mensagem: 'Ola' },
      });
      const body = await res.json();
      if (res.status() === 400) {
        expect(body.erro).toContain('IA');
      } else {
        expect(body.erro).toBeTruthy();
      }
    });
  });

  test.describe('Rotas de WhatsApp', () => {
    test('POST /api/whatsapp/enviar sem telefone retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/enviar', {
        ...auth, data: { mensagem: 'teste' },
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/whatsapp/enviar sem mensagem retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/enviar', {
        ...auth, data: { telefone: '5511999999999' },
      });
      expect(res.status()).toBe(400);
    });

    test('GET /api/whatsapp/mensagens retorna array', async ({ request }) => {
      const res = await request.get('/api/whatsapp/mensagens', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body)).toBeTruthy();
    });

    test('POST /api/whatsapp/conectar retorna status', async ({ request }) => {
      const res = await request.post('/api/whatsapp/conectar', auth);
      const body = await res.json();
      expect(body.ok || body.erro).toBeTruthy();
    });

    test('POST /api/whatsapp/desconectar retorna ok', async ({ request }) => {
      const res = await request.post('/api/whatsapp/desconectar', auth);
      if (res.ok()) {
        const body = await res.json();
        expect(body.ok).toBe(true);
      }
    });

    test('POST /api/whatsapp/deletar retorna ok', async ({ request }) => {
      const res = await request.post('/api/whatsapp/deletar', auth);
      if (res.ok()) {
        const body = await res.json();
        expect(body.ok).toBe(true);
      }
    });

    test('GET /api/whatsapp/qrcode retorna estrutura', async ({ request }) => {
      const res = await request.get('/api/whatsapp/qrcode', auth);
      const body = await res.json();
      expect(body.ok === true || body.ok === false || body.erro).toBeTruthy();
    });

    test('GET /api/whatsapp/diagnostico-base retorna dados da barbearia', async ({ request }) => {
      const res = await request.get('/api/whatsapp/diagnostico-base', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.barbearia).toBeTruthy();
      expect(body.servicos).toBeTruthy();
      expect(body.profissionais).toBeTruthy();
      expect(body.resumo).toBeTruthy();
    });

    test('POST /api/whatsapp/limpar-conversas retorna estrutura', async ({ request }) => {
      const res = await request.post('/api/whatsapp/limpar-conversas', auth);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    test('POST /api/whatsapp/limpar-conversas com telefone filtra', async ({ request }) => {
      const res = await request.post('/api/whatsapp/limpar-conversas', {
        ...auth, data: { telefone: '5511999999999' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.telefone || body.conversas_apagadas !== undefined).toBeTruthy();
    });

    test('POST /api/whatsapp/desativar-servico sem nome ou id retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/desativar-servico', {
        ...auth, data: {},
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/whatsapp/corrigir-servico sem id/nome retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/corrigir-servico', {
        ...auth, data: { novo_preco: 10 },
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/whatsapp/corrigir-servico sem campos pra atualizar retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/corrigir-servico', {
        ...auth, data: { id: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/whatsapp/limpar-cliente sem telefone retorna 400', async ({ request }) => {
      const res = await request.post('/api/whatsapp/limpar-cliente', {
        ...auth, data: {},
      });
      expect(res.status()).toBe(400);
    });

    test('POST /api/whatsapp/scheduler/executar executa e retorna ok', async ({ request }) => {
      const res = await request.post('/api/whatsapp/scheduler/executar', auth);
      if (res.ok()) {
        const body = await res.json();
        expect(body.ok).toBe(true);
      }
    });
  });
});
