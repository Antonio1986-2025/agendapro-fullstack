/**
 * Rota SaaS — Site público da barbearia
 *
 * GET /b/:slug → Site profissional da barbearia (template premium dark/gold)
 *
 * O slug é detectado pelo JavaScript via window.location.pathname.
 * Dados carregados via API pública (/api/publico/:slug).
 */

import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

const TEMPLATE_PATH = join(__dirname, '..', '..', 'public', 'site-barbearia-template.html');

// Cache do template em memória (carregado uma vez no startup)
let templateHtml = null;

try {
  if (existsSync(TEMPLATE_PATH)) {
    templateHtml = readFileSync(TEMPLATE_PATH, 'utf-8');
    console.log('✅ Site template carregado: ' + (templateHtml.length / 1024).toFixed(1) + 'KB');
  } else {
    console.error('❌ Template não encontrado: ' + TEMPLATE_PATH);
  }
} catch (err) {
  console.error('❌ Erro ao ler template:', err.message);
}

// GET /b/:slug — Site público da barbearia
router.get('/:slug', (req, res) => {
  // Verifica se template está em cache
  if (!templateHtml) {
    return res.redirect('/agendar.html?b=' + req.params.slug);
  }

  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(templateHtml);
});

export default router;
