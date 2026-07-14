/**
 * Rota SaaS — Site público da barbearia
 *
 * GET /b/:slug → Site profissional da barbearia (template premium dark/gold)
 *
 * Os dados da barbearia são injetados no HTML e também carregados
 * dinamicamente pelo JavaScript via API pública.
 */

import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { query } from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

const TEMPLATE_PATH = join(__dirname, '..', '..', 'public', 'site-barbearia-template.html');

// Cache do template em memória
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
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!templateHtml) {
    return res.redirect('/agendar.html?b=' + slug);
  }

  // Buscar dados da barbearia para injetar no template
  let barbearia = null;
  let servicosNomes = '';
  try {
    const { rows } = await query(
      `SELECT nome, telefone, endereco, instagram, horario_config
       FROM barbearias WHERE slug = $1 AND ativo = true`,
      [slug]
    );
    if (rows[0]) {
      barbearia = rows[0];
      // Buscar nomes dos serviços para meta tags
      const servs = await query(
        'SELECT nome FROM servicos WHERE barbearia_id = (SELECT id FROM barbearias WHERE slug = $1) AND ativo = true LIMIT 5',
        [slug]
      );
      servicosNomes = servs.rows.map(s => s.nome).join(', ');
    }
  } catch (e) {
    console.error('Erro ao buscar dados da barbearia:', e.message);
  }

  // Montar HTML com dados injetados
  let html = templateHtml;

  if (barbearia) {
    const nome = barbearia.nome;
    const telefone = (barbearia.telefone || '').replace(/\D/g, '');
    const endereco = barbearia.endereco || '';
    const instagram = barbearia.instagram || '';

    // Meta tags dinâmicas
    const metaTitle = `${nome} — Agendamento Online`;
    const metaDesc = servicosNomes
      ? `${nome} — ${servicosNomes}. Agende seu horário online!`
      : `${nome} — Agende seu horário online. Cortes, barba e mais.`;

    html = html
      .replace(/<title>.*?<\/title>/, `<title>${metaTitle}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${metaDesc}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${metaTitle}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${metaDesc}">`);

    // Injetar dados da barbearia como JSON no <head> para o JS usar
    const dataScript = `<script>
window.__BARBEARIA__ = ${JSON.stringify({
  nome, telefone, endereco, instagram,
  slug,
  whatsapp: telefone.replace(/^55/, ''),
})};
</script>`;
    html = html.replace('</head>', dataScript + '\n</head>');

    // Atualizar WhatsApp links no template
    if (telefone) {
      html = html.replace(/556730459452/g, telefone);
    }
  }

  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(html);
});

export default router;
