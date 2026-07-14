/**
 * Rota SaaS — Site público da barbearia
 *
 * GET /b/:slug → Template premium para qualquer barbearia cadastrada.
 *
 * A rota é 100% estática (sem query ao banco).
 * Toda personalização acontece no client-side JavaScript que:
 *   1. Detecta o slug da URL: window.location.pathname
 *   2. Busca dados via GET /api/publico/:slug
 *   3. Popula o HTML com nome, serviços, profissionais, etc.
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

const TEMPLATE_PATH = join(__dirname, '..', '..', 'public', 'site-barbearia-template.html');

// Cache
let html = null;
try {
  if (existsSync(TEMPLATE_PATH)) {
    html = readFileSync(TEMPLATE_PATH, 'utf-8');
    console.log('✅ Site template: ' + (html.length / 1024).toFixed(1) + 'KB');
  }
} catch (e) {
  console.error('❌ Template:', e.message);
}

router.get('/:slug', (req, res) => {
  if (!html) return res.redirect('/agendar.html?b=' + req.params.slug);
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.send(html);
});

export default router;
