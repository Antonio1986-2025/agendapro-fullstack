/**
 * Rota SaaS — Site público da barbearia (template dinâmico)
 *
 * GET /b/:slug → site completo com dados da barbearia injetados
 *
 * Cada barbearia do AgendaPro ganha seu próprio site profissional.
 * O slug identifica a barbearia e os dados são carregados via API pública.
 */

import { Router } from 'express';
import { query } from '../config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Template do site (carregado uma vez na memória)
let siteTemplate = null;

function getTemplate() {
  if (!siteTemplate) {
    // Tentar multiplos paths (local dev vs Railway deploy)
    const paths = [
      join(__dirname, '..', '..', 'public', 'site-barbearia-template.html'),  // local: server/routes → raiz
      join(__dirname, '..', 'public', 'site-barbearia-template.html'),        // alt: server/routes → server → public
      join(process.cwd(), 'public', 'site-barbearia-template.html'),          // cwd
    ];
    for (const p of paths) {
      try {
        siteTemplate = readFileSync(p, 'utf-8');
        console.log('✅ Template carregado:', p);
        break;
      } catch (e) {
        // tenta próximo path
      }
    }
    if (!siteTemplate) {
      console.error('❌ Template não encontrado em:', paths);
      return null;
    }
  }
  return siteTemplate;
}

// GET /b/:slug — Site público da barbearia
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // Buscar dados da barbearia
    const { rows } = await query(
      `SELECT id, nome, slug, telefone, email, endereco, horario_config, instagram
       FROM barbearias WHERE slug = $1 AND ativo = true`,
      [slug]
    );

    if (!rows[0]) {
      // Fallback: redirecionar para página de agendamento público
      return res.redirect(`/agendar.html?b=${slug}`);
    }

    const barbearia = rows[0];

    // Buscar serviços e profissionais para meta tags
    const [servicos, profissionais] = await Promise.all([
      query('SELECT nome, duracao_minutos, preco FROM servicos WHERE barbearia_id = $1 AND ativo = true ORDER BY nome', [barbearia.id]),
      query('SELECT nome, especialidade FROM profissionais WHERE barbearia_id = $1 AND ativo = true ORDER BY nome', [barbearia.id]),
    ]);

    // Tentar carregar o template avançado
    let html = getTemplate();

    if (html) {
      // Substituir placeholders no template
      const nome = barbearia.nome || 'Barbearia';
      const telefone = (barbearia.telefone || '').replace(/\D/g, '');
      const endereco = barbearia.endereco || '';
      const instagram = barbearia.instagram || '';

      html = html
        .replace(/__SLUG__/g, slug)
        .replace(/__NOME__/g, nome)
        .replace(/__TELEFONE__/g, telefone)
        .replace(/__WHATSAPP__/g, telefone)
        .replace(/__ENDERECO__/g, endereco)
        .replace(/__INSTAGRAM__/g, instagram);

      // Gerar meta tags dinâmicas
      const metaTitle = `${nome} — Agendamento Online`;
      const metaDesc = `${nome} — Agende seu horário online. ${servicos.rows.slice(0, 3).map(s => s.nome).join(', ')} e mais.`;
      html = html.replace(/__META_TITLE__/g, metaTitle);
      html = html.replace(/__META_DESC__/g, metaDesc);

      // JSON-LD dinâmico
      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: nome,
        description: metaDesc,
        address: { '@type': 'PostalAddress', streetAddress: endereco, addressLocality: 'Campo Grande', addressRegion: 'MS', addressCountry: 'BR' },
        telephone: telefone,
        url: `https://agendapro-app-production.up.railway.app/b/${slug}`,
        priceRange: servicos.rows.length > 0
          ? 'R$ ' + Math.min(...servicos.rows.map(s => parseFloat(s.preco) || 0)) + ' - R$ ' + Math.max(...servicos.rows.map(s => parseFloat(s.preco) || 0))
          : '',
      });
      html = html.replace('__JSON_LD__', jsonLd);

      res.send(html);
    } else {
      // Fallback: template inline simplificado se o arquivo não existir
      res.send(renderFallbackSite(barbearia, servicos.rows, profissionais.rows));
    }

  } catch (err) {
    console.error('Erro site cliente:', err.message);
    // Último fallback: redirecionar para agendar.html
    res.redirect(`/agendar.html?b=${slug}`);
  }
});

// Fallback: site inline simplificado
function renderFallbackSite(barbearia, servicos, profissionais) {
  const nome = barbearia.nome || 'Barbearia';
  const slug = barbearia.slug;

  const servicosHtml = servicos.map(s =>
    `<div class="service-card"><h3>${s.nome}</h3><p>${s.duracao_minutos}min · R$ ${parseFloat(s.preco).toFixed(2)}</p></div>`
  ).join('\n');

  const profsHtml = profissionais.map(p =>
    `<div class="team-card"><strong>${p.nome}</strong></div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${nome} — Agendamento Online</title>
  <link rel="stylesheet" href="/design-system.css">
  <style>
    body { font-family: var(--font-family); background: var(--bg-secondary); color: var(--text-primary); }
    .container { max-width: 600px; margin: 0 auto; padding: 2rem; }
    .hero { text-align: center; padding: 4rem 0; background: linear-gradient(135deg, var(--primary-600), var(--primary-800)); color: white; border-radius: var(--radius-lg); margin-bottom: 2rem; }
    .btn { display: inline-block; padding: 0.75rem 2rem; background: white; color: var(--primary-700); border-radius: var(--radius-md); text-decoration: none; font-weight: 600; margin-top: 1rem; }
    .service-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 0.5rem; }
    .team-card { display: inline-block; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 0.5rem 1rem; margin: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <h1>${nome}</h1>
      <p>Agende seu horário online</p>
      <a href="/agendar.html?b=${slug}" class="btn">Agendar Agora</a>
    </div>
    <h2>Serviços</h2>
    ${servicosHtml || '<p>Nenhum serviço cadastrado ainda.</p>'}
    <h2 style="margin-top:2rem;">Profissionais</h2>
    ${profsHtml || '<p>Nenhum profissional cadastrado ainda.</p>'}
  </div>
</body>
</html>`;
}

export default router;
