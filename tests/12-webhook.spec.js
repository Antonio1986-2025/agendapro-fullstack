import { test, expect } from '@playwright/test';
import { seedDemoData } from './helpers/seed.js';

test.describe('Webhook Evolution', () => {
  let auth, barbeariaId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    auth = { headers: { Authorization: `Bearer ${r.token}` } };

    const me = await (await request.get('/api/auth/me', auth)).json();
    barbeariaId = me.barbearia_id;

    if (!barbeariaId) {
      const users = await (await request.get('/api/auth/usuarios', auth)).json();
      const owner = users.find(u => u.role === 'owner');
      if (owner) barbeariaId = owner.barbearia_id;
    }
  });

  test('POST /api/whatsapp/webhook/evolution/:barbeariaId aceita payload e retorna 200', async ({ request }) => {
    if (!barbeariaId) return;

    const res = await request.post(`/api/whatsapp/webhook/evolution/${barbeariaId}`, {
      data: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Ola, quero agendar' },
          pushName: 'Cliente Teste',
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('POST /api/whatsapp/webhook/evolution/:barbeariaId ignora mensagens de grupo', async ({ request }) => {
    if (!barbeariaId) return;

    const res = await request.post(`/api/whatsapp/webhook/evolution/${barbeariaId}`, {
      data: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@g.us', fromMe: false },
          message: { conversation: 'Ola grupo' },
        },
      },
    });
    expect(res.status()).toBe(200);
  });

  test('POST /api/whatsapp/webhook/evolution/:barbeariaId ignora mensagens enviadas (fromMe)', async ({ request }) => {
    if (!barbeariaId) return;

    const res = await request.post(`/api/whatsapp/webhook/evolution/${barbeariaId}`, {
      data: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true },
          message: { conversation: 'Ola' },
        },
      },
    });
    expect(res.status()).toBe(200);
  });

  test('POST /api/whatsapp/webhook/evolution/:barbeariaId com evento diferente retorna 200', async ({ request }) => {
    if (!barbeariaId) return;

    const res = await request.post(`/api/whatsapp/webhook/evolution/${barbeariaId}`, {
      data: {
        event: 'connection.update',
        data: { status: 'open' },
      },
    });
    expect(res.status()).toBe(200);
  });

  test('POST /api/whatsapp/webhook/evolution/:barbeariaId com audio retorna 200', async ({ request }) => {
    if (!barbeariaId) return;

    const res = await request.post(`/api/whatsapp/webhook/evolution/${barbeariaId}`, {
      data: {
        event: 'messages.upsert',
        data: {
          key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
          message: {
            audioMessage: { mimetype: 'audio/mp4' },
          },
          pushName: 'Cliente Audio',
        },
      },
    });
    expect(res.status()).toBe(200);
  });
});
