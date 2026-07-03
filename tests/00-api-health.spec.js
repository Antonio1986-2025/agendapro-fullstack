import { test, expect } from '@playwright/test';

test.describe('API Health e Disponibilidade', () => {
  test('GET /api/health retorna online', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('online');
    expect(data.db).toBe('conectado');
    expect(data.timestamp).toBeTruthy();
  });

  test('Landing page carrega', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('.logo')).toContainText('AgendaPro');
  });

  test('Login page carrega', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page.locator('#form-login')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-senha')).toBeVisible();
    await expect(page.locator('#btn-login')).toBeVisible();
  });

  test('Pagina de agendamento publico carrega sem slug', async ({ page }) => {
    await page.goto('/agendar.html');
    await expect(page.locator('#alerta')).toBeVisible();
  });
});
