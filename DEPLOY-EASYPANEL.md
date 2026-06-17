# 🚀 Deploy do AgendaPro Fullstack na Hostinger (EasyPanel)

Esta versao tem **backend Node.js + PostgreSQL + frontend** num so projeto.
O deploy precisa de **2 servicos** no EasyPanel: um banco PostgreSQL e o app.

---

## 📦 Visao geral

```
EasyPanel (sua VPS)
├── Servico 1: PostgreSQL (banco de dados)
└── Servico 2: App (Node.js, build via Dockerfile, vem do GitHub)
        │
        └── conecta no banco via DATABASE_URL
```

---

## PASSO 1 — Subir o codigo no GitHub

Crie um repositorio novo (ex: `agendapro-fullstack`) e suba esta pasta.
Comandos (dentro da pasta `agendapro-fullstack`):

```bash
git init
git add .
git commit -m "AgendaPro fullstack - backend + frontend"
git branch -M main
git remote add origin https://github.com/Antonio1986-2025/agendapro-fullstack.git
git push -u origin main
```

> Crie o repo antes em https://github.com/new com o nome `agendapro-fullstack`.

---

## PASSO 2 — Criar o banco PostgreSQL no EasyPanel

1. No projeto do EasyPanel, clique **+ Create → Postgres**
2. Nome do servico: `agendapro-db`
3. Defina (anote esses valores):
   - **Password**: escolha uma senha forte
   - Database: `agendapro` (ou deixe o padrao)
4. Clique **Create**

Apos criar, o EasyPanel mostra os dados de conexao. O importante e a
**Connection URL interna**, algo como:

```
postgres://postgres:SUA_SENHA@agendapro-db:5432/agendapro
```

> Use o host **interno** (nome do servico, ex: `agendapro-db`), nao o externo.
> Servicos no mesmo projeto se enxergam pela rede interna.

---

## PASSO 3 — Criar o App no EasyPanel

1. **+ Create → App**
2. Nome: `agendapro`
3. **Source**: GitHub → repo `agendapro-fullstack` → branch `main`
4. **Build**: metodo **Dockerfile** (caminho `Dockerfile`, raiz `/`)
5. Clique **Deploy** (vai falhar a 1a vez por falta das variaveis — normal)

### Variaveis de ambiente (Environment)

Na aba **Environment** do app, adicione:

| Variavel | Valor |
|----------|-------|
| `DATABASE_URL` | `postgres://postgres:SUA_SENHA@agendapro-db:5432/agendapro` |
| `JWT_SECRET` | um texto aleatorio longo (ex: gere em https://generate-secret.vercel.app/48) |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `TZ` | `America/Sao_Paulo` |
| `AUTO_MIGRATE` | `true` |

> Com `AUTO_MIGRATE=true`, o banco e criado automaticamente no 1o start.

6. Salve e clique **Deploy** de novo.

---

## PASSO 4 — Configurar o dominio

1. Aba **Domains** do app `agendapro`
2. Adicione o dominio (subdominio gratis do EasyPanel ou o seu proprio)
3. **Porta: `3000`**
4. Ative **HTTPS** (SSL automatico)

Acesse a URL → deve abrir a tela de **login** do AgendaPro.

---

## PASSO 5 — Criar a primeira barbearia

Voce tem duas opcoes:

### Opcao A: Criar conta pela tela (recomendado)
1. Acesse a URL do app
2. Clique em **Criar conta**
3. Preencha nome da barbearia, seu nome, email e senha
4. Pronto — voce ja entra no painel

### Opcao B: Carregar dados de demonstracao
No EasyPanel, abra o **Console/Terminal** do app e rode:
```bash
node server/db/seed.js
```
Isso cria a barbearia demo (login: `demo@agendapro.com` / `123456`).

---

## ✅ Como usar depois de no ar

- **Painel da barbearia**: `https://seu-dominio/` → login
- **Pagina publica de agendamento** (link pra divulgar aos clientes):
  `https://seu-dominio/agendar.html?b=SLUG_DA_BARBEARIA`
  - O slug aparece apos o cadastro (ex: `barbearia-do-ze`)

---

## 📱 Ativar WhatsApp de verdade (opcional)

Por padrao o sistema roda em **modo log** (registra mensagens sem enviar).
Para enviar de verdade via WhatsApp Cloud API (Meta):

1. Crie um app no https://developers.facebook.com → produto WhatsApp
2. Pegue: `phone_number_id`, `access_token` e defina um `verify_token`
3. Configure no sistema via API (ou tela de config):
   ```
   PUT /api/whatsapp/config
   { "provider": "meta_cloud", "phone_number_id": "...",
     "access_token": "...", "verify_token": "...", "enabled": true }
   ```
4. No painel da Meta, configure o webhook:
   - URL: `https://seu-dominio/api/whatsapp/webhook`
   - Verify token: o mesmo que voce definiu

A partir dai:
- Cliente recebe confirmacao automatica
- **Barbeiro recebe aviso de cada novo agendamento** (precisa ter telefone cadastrado)

---

## 🔄 Atualizacoes futuras

```bash
git add .
git commit -m "mudancas"
git push
```
Com Auto Deploy ativo (Settings → Deploy on push), o EasyPanel atualiza sozinho.

---

## 🧪 Testar localmente (opcional)

Com Docker instalado:
```bash
docker compose up --build
# App em http://localhost:3000
# Rodar seed: docker compose exec app node server/db/seed.js
```

---

## 🔧 Problemas comuns

| Sintoma | Causa / Solucao |
|---------|-----------------|
| App reinicia em loop | `DATABASE_URL` errada — confira host interno e senha |
| 502 Bad Gateway | Porta do dominio diferente de `3000` |
| "db desconectado" no /api/health | Banco ainda subindo ou URL incorreta |
| Login nao funciona | Rode o seed ou crie conta pela tela |
| Horarios errados | Confirme `TZ=America/Sao_Paulo` nas variaveis |
