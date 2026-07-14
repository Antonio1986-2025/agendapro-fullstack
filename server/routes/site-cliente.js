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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// Caminho absoluto para o diretório public/
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');
const TEMPLATE_PATH = join(PUBLIC_DIR, 'site-barbearia-template.html');

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
      return res.redirect(`/agendar.html?b=${slug}`);
    }

    // Enviar o template como arquivo estático — o JS do cliente
    // detecta o slug da URL e carrega os dados via API pública.
    // Isso funciona porque o CSS e JS estão em /site-template/
    // e acessam a API em /api/publico/:slug
    res.sendFile(TEMPLATE_PATH, (err) => {
      if (err) {
        console.error('Erro ao enviar template:', err.message);
        // Fallback: redirecionar para agendar.html
        res.redirect(`/agendar.html?b=${slug}`);
      }
    });

  } catch (err) {
    console.error('Erro site cliente:', err.message);
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
