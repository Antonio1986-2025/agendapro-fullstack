# AgendaPro Fullstack 💈

Sistema SaaS multi-tenant de agendamento para barbearias.
Backend Node.js + PostgreSQL + frontend integrado, tudo em um container.

## Funcionalidades

- 🔐 **Login e cadastro** de barbearias (multi-tenant, dados isolados por barbearia)
- 📅 **Agendamentos persistentes** no banco de dados
- 🌐 **Página pública de agendamento** para clientes finais (`/agendar.html?b=slug`)
- 👥 Gestão de profissionais, serviços e clientes
- ⏰ Horários especiais (noturno +50%) configuráveis por profissional
- 📊 Dashboard com métricas reais (faturamento, agendamentos, clientes)
- 📱 **Integração WhatsApp**:
  - Confirmação automática para o cliente
  - **Aviso de novo agendamento para o barbeiro responsável**
  - Suporte a WhatsApp Cloud API (Meta) + modo log para testes

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco | PostgreSQL |
| Auth | JWT + bcrypt |
| Frontend | HTML/CSS/JS (mobile-first) |
| Deploy | Docker (Nginx-free, Node serve tudo) |

## Rodar localmente

```bash
# Com Docker (recomendado)
docker compose up --build
docker compose exec app node server/db/seed.js   # dados demo

# Acesse http://localhost:3000
# Login demo: demo@agendapro.com / 123456
```

Ou sem Docker (precisa de um PostgreSQL):
```bash
npm install
cp .env.example .env   # ajuste DATABASE_URL
npm run seed
npm start
```

## Estrutura

```
server/
├── server.js          # app Express (API + frontend estatico)
├── config/database.js # pool PostgreSQL
├── db/                # schema, migrate, seed
├── middleware/auth.js # JWT
├── routes/            # auth, agendamentos, clientes, etc.
└── services/whatsapp.js
public/                # frontend (login, agendar, dashboard, ...)
Dockerfile
docker-compose.yml
```

## Deploy

Veja **DEPLOY-EASYPANEL.md** para o passo a passo na VPS Hostinger.

## API (resumo)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/auth/registrar` | Cria barbearia + dono |
| POST | `/api/auth/login` | Login |
| GET | `/api/dashboard` | Metricas |
| GET/POST | `/api/agendamentos` | Listar/criar agendamentos |
| GET/POST | `/api/profissionais` | Profissionais |
| GET/POST | `/api/servicos` | Serviços |
| GET/POST | `/api/clientes` | Clientes |
| GET/POST | `/api/publico/:slug/agendar` | Agendamento público |
| PUT | `/api/whatsapp/config` | Configurar WhatsApp |
