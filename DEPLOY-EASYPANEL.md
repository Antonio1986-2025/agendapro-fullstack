# 🚀 Deploy do AgendaPro Fullstack na Hostinger (EasyPanel)

Esta versao usa **Supabase** como banco de dados (PostgreSQL cloud).
O deploy precisa de **1 servico** no EasyPanel: apenas o App.
(O banco ja esta rodando no Supabase — sem necessidade de criar PostgreSQL no EasyPanel.)

---

## 📦 Visao geral

```
EasyPanel (sua VPS)
└── Servico 1: App (Node.js, build via Dockerfile, vem do GitHub)
        │
        └── conecta no Supabase (cloud) via SUPABASE_DB_* ou DATABASE_URL
```

---

## PASSO 1 — Subir o codigo no GitHub

```bash
git add .
git commit -m "integracao Supabase"
git push
```

---

## PASSO 2 — Criar o App no EasyPanel

1. **+ Create → App**
2. Nome: `agendapro`
3. **Source**: GitHub → repo `agendapro-fullstack` → branch `main`
4. **Build**: metodo **Dockerfile** (caminho `Dockerfile`, raiz `/`)
5. Clique **Deploy** (vai falhar a 1a vez por falta das variaveis — normal)

### Variaveis de ambiente (Environment)

Na aba **Environment** do app, adicione:

| Variavel | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://yavvktjanvbejsrramnc.supabase.co` |
| `SUPABASE_ANON_KEY` | (anon key do Supabase) |
| `SUPABASE_SERVICE_KEY` | (service role key do Supabase) |
| `SUPABASE_DB_HOST` | `db.yavvktjanvbejsrramnc.supabase.co` |
| `SUPABASE_DB_PORT` | `5432` |
| `SUPABASE_DB_USER` | `postgres` |
| `SUPABASE_DB_PASSWORD` | `"Aaa30269041#"` (com aspas para preservar o #) |
| `SUPABASE_DB_NAME` | `postgres` |
| `SUPABASE_DB_SSL` | `true` |
| `NODE_OPTIONS` | `--dns-result-order=ipv4first` |
| `JWT_SECRET` | um texto aleatorio longo (ex: gere em https://generate-secret.vercel.app/48) |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `TZ` | `America/Sao_Paulo` |
| `AUTO_MIGRATE` | `true` |

> As chaves do Supabase (URL, anon, service_role) estao no dashboard do Supabase em Settings > API.
> A senha do banco foi definida na criacao do projeto.

6. Salve e clique **Deploy** de novo.

---

## PASSO 3 — Configurar o dominio

1. Aba **Domains** do app `agendapro`
2. Adicione o dominio (subdominio gratis do EasyPanel ou o seu proprio)
3. **Porta: `3000`**
4. Ative **HTTPS** (SSL automatico)

Acesse a URL → deve abrir a tela de **login** do AgendaPro.

---

## PASSO 4 — Criar a primeira barbearia

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

```bash
npm install
npm run dev
# App em http://localhost:3000
```

---

## 🔧 Problemas comuns

| Sintoma | Causa / Solucao |
|---------|-----------------|
| App reinicia em loop | Variaveis Supabase erradas — confira SUPABASE_DB_HOST e senha |
| 502 Bad Gateway | Porta do dominio diferente de `3000` |
| "db desconectado" no /api/health | Supabase pode estar em manutencao ou credenciais incorretas |
| Login nao funciona | Rode o seed ou crie conta pela tela |
| Horarios errados | Confirme `TZ=America/Sao_Paulo` nas variaveis |
