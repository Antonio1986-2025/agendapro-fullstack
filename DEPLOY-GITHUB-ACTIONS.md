# 🚀 Deploy Automático via GitHub Actions

Este guia mostra como configurar deploy automático na VPS através do GitHub Actions.

---

## ✅ Vantagens

- 🔄 **Deploy automático** a cada `git push`
- 🛡️ **Seguro** - credenciais nunca no código
- 📝 **Logs detalhados** de cada deploy
- ⚡ **Rápido** - 2-3 minutos por deploy
- 🔁 **Rollback fácil** - reverta commits se necessário

---

## 📋 Pré-requisitos

Na VPS você precisa ter:
- ✅ Node.js instalado
- ✅ PM2 instalado (`npm install -g pm2`)
- ✅ Git instalado
- ✅ Projeto clonado em algum diretório

---

## 🔐 Passo 1: Gerar Chave SSH

Execute isso **na sua máquina local** (não na VPS):

```bash
# Gerar nova chave SSH
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/vps_deploy

# Isso cria 2 arquivos:
# ~/.ssh/vps_deploy       → Chave PRIVADA (vai no GitHub)
# ~/.ssh/vps_deploy.pub   → Chave PÚBLICA (vai na VPS)
```

---

## 🔑 Passo 2: Adicionar Chave Pública na VPS

```bash
# Copiar chave pública para VPS
ssh-copy-id -i ~/.ssh/vps_deploy.pub seu-usuario@seu-ip-vps

# OU manualmente:
# 1. Copie o conteúdo de ~/.ssh/vps_deploy.pub
cat ~/.ssh/vps_deploy.pub

# 2. Na VPS, adicione ao authorized_keys:
ssh seu-usuario@seu-ip-vps
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Cole a chave pública aqui
chmod 600 ~/.ssh/authorized_keys
exit
```

### ✅ Testar conexão SSH:
```bash
ssh -i ~/.ssh/vps_deploy seu-usuario@seu-ip-vps
# Se conectar sem pedir senha, funcionou! ✅
```

---

## 🔐 Passo 3: Configurar Secrets no GitHub

### 3.1 Ir para Configurações
1. Acesse seu repositório no GitHub
2. Vá em **Settings** (Configurações)
3. No menu lateral: **Secrets and variables** → **Actions**
4. Clique em **New repository secret**

### 3.2 Adicionar os seguintes secrets:

#### **VPS_SSH_KEY** (Chave privada)
```bash
# Copiar conteúdo da chave privada:
cat ~/.ssh/vps_deploy

# Copie TUDO (incluindo as linhas BEGIN e END)
# Cole no GitHub como secret VPS_SSH_KEY
```

#### **VPS_HOST** (IP da VPS)
```
exemplo: 123.45.67.89
```

#### **VPS_USER** (Usuário SSH)
```
exemplo: root
ou: ubuntu
```

#### **VPS_PATH** (Caminho do projeto na VPS)
```
exemplo: /root/agendapro-fullstack
ou: /home/ubuntu/agendapro
```

#### **DATABASE_URL** (PostgreSQL)
```
postgresql://postgres.yavvktjanvbejsrramnc:Aaa30269041%23@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

#### **SUPABASE_URL**
```
https://yavvktjanvbejsrramnc.supabase.co
```

#### **SUPABASE_ANON_KEY**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### **SUPABASE_SERVICE_KEY**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### **OPENAI_API_KEY**
```
sk-proj-SUA_CHAVE_OPENAI_COMPLETA_AQUI
```

#### **JWT_SECRET**
```bash
# Gerar um secret aleatório:
openssl rand -base64 32

# Cole o resultado no GitHub
```

---

## 🎯 Resumo dos Secrets

| Nome | Descrição | Exemplo |
|------|-----------|---------|
| `VPS_SSH_KEY` | Chave privada SSH | `-----BEGIN OPENSSH PRIVATE KEY-----` |
| `VPS_HOST` | IP ou domínio da VPS | `123.45.67.89` |
| `VPS_USER` | Usuário SSH | `root` ou `ubuntu` |
| `VPS_PATH` | Caminho completo do projeto | `/root/agendapro` |
| `DATABASE_URL` | URL do PostgreSQL | `postgresql://...` |
| `SUPABASE_URL` | URL do Supabase | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Anon key do Supabase | `eyJhbGc...` |
| `SUPABASE_SERVICE_KEY` | Service key do Supabase | `eyJhbGc...` |
| `OPENAI_API_KEY` | Chave da OpenAI | `sk-proj-...` |
| `JWT_SECRET` | Secret aleatório | `dGVzdGUxMjM...` |

---

## 🚀 Passo 4: Fazer o Primeiro Deploy

Depois de configurar todos os secrets:

```bash
# 1. Garantir que está na branch main
git checkout main

# 2. Adicionar o workflow
git add .github/workflows/deploy-vps.yml
git commit -m "🚀 Adiciona workflow de deploy automático"

# 3. Enviar para GitHub
git push origin main
```

**O deploy começa automaticamente!** 🎉

---

## 📊 Passo 5: Acompanhar o Deploy

1. Vá no GitHub: **Actions** (aba)
2. Você verá o workflow rodando
3. Clique nele para ver logs em tempo real
4. Aguarde ~2-3 minutos

### ✅ Deploy bem-sucedido:
```
✅ Deploy concluído com sucesso!
📊 Status do PM2:
┌─────┬─────────────┬─────────┬─────────┐
│ id  │ name        │ status  │ cpu     │
├─────┼─────────────┼─────────┼─────────┤
│ 0   │ agendapro   │ online  │ 0%      │
└─────┴─────────────┴─────────┴─────────┘
```

---

## 🔄 Usar no Dia a Dia

Agora todo `git push` faz deploy automático:

```bash
# 1. Fazer mudanças no código
nano server/services/ai.js

# 2. Commitar
git add .
git commit -m "Melhora prompt do agente"

# 3. Enviar
git push origin main

# 4. Deploy automático inicia! 🚀
# Acompanhe em: github.com/seu-repo/actions
```

---

## 🔧 Deploy Manual (Sem Esperar Push)

Se quiser fazer deploy sem fazer commit:

1. Vá em **Actions** no GitHub
2. Clique em **🚀 Deploy para VPS**
3. Clique em **Run workflow**
4. Selecione branch `main`
5. Clique em **Run workflow**

---

## 🐛 Troubleshooting

### ❌ Erro: "Permission denied (publickey)"

**Problema:** Chave SSH não foi configurada corretamente.

**Solução:**
```bash
# 1. Verificar se chave está na VPS
ssh seu-usuario@seu-ip-vps
cat ~/.ssh/authorized_keys
# Deve conter a chave pública

# 2. Verificar secret VPS_SSH_KEY no GitHub
# Deve conter a chave PRIVADA completa
```

### ❌ Erro: "Directory not found"

**Problema:** `VPS_PATH` está incorreto.

**Solução:**
```bash
# Na VPS, verificar caminho correto:
ssh seu-usuario@seu-ip-vps
pwd
# Copie o resultado e atualize VPS_PATH no GitHub
```

### ❌ Erro: "npm: command not found"

**Problema:** Node.js não instalado na VPS.

**Solução:**
```bash
ssh seu-usuario@seu-ip-vps
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pm2
```

### ❌ Erro: "pm2: command not found"

**Problema:** PM2 não instalado globalmente.

**Solução:**
```bash
ssh seu-usuario@seu-ip-vps
npm install -g pm2
pm2 startup
# Copie e execute o comando sugerido
```

### ❌ Deploy passou mas app não funciona

**Verificar logs:**
```bash
ssh seu-usuario@seu-ip-vps
pm2 logs agendapro --lines 50
```

**Verificar .env:**
```bash
ssh seu-usuario@seu-ip-vps
cd /caminho/projeto
cat .env
# Verificar se OPENAI_API_KEY está correto
```

---

## 📊 Monitoramento

### Ver logs em tempo real:
```bash
ssh seu-usuario@seu-ip-vps
pm2 logs agendapro
```

### Ver status:
```bash
ssh seu-usuario@seu-ip-vps
pm2 status
```

### Ver últimas 100 linhas:
```bash
ssh seu-usuario@seu-ip-vps
pm2 logs agendapro --lines 100 --nostream
```

---

## 🔁 Rollback (Desfazer Deploy)

Se um deploy quebrou algo:

### Método 1: Reverter commit
```bash
# 1. Reverter último commit
git revert HEAD
git push origin main
# Deploy automático reverte! ✅

# 2. OU: Voltar para commit anterior
git reset --hard COMMIT_ANTERIOR
git push origin main --force
```

### Método 2: Rollback manual na VPS
```bash
ssh seu-usuario@seu-ip-vps
cd /caminho/projeto

# Voltar para commit anterior
git log --oneline  # Ver commits
git reset --hard COMMIT_ID
npm install --production
pm2 restart agendapro
```

---

## ⚙️ Customizar Workflow

Edite `.github/workflows/deploy-vps.yml` para:

### Executar apenas em tags:
```yaml
on:
  push:
    tags:
      - 'v*'  # Apenas tags tipo v1.0.0
```

### Executar testes antes:
```yaml
- name: 🧪 Executar testes
  run: npm test
```

### Notificar no Telegram:
```yaml
- name: 📱 Notificar sucesso
  if: success()
  run: |
    curl -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
      -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
      -d "text=✅ Deploy concluído com sucesso!"
```

---

## 📈 Benefícios

### Antes (Deploy Manual):
```
1. SSH na VPS
2. cd projeto
3. git pull
4. npm install
5. npm run migrate
6. pm2 restart
```
⏱️ Tempo: 5-10 minutos

### Agora (Deploy Automático):
```
git push
```
⏱️ Tempo: 10 segundos (você) + 2 minutos (automático)

---

## 🎯 Checklist Final

- [ ] Chave SSH gerada
- [ ] Chave pública na VPS (`~/.ssh/authorized_keys`)
- [ ] Chave privada no GitHub secret (`VPS_SSH_KEY`)
- [ ] Todos os 10 secrets configurados no GitHub
- [ ] Workflow arquivo existe (`.github/workflows/deploy-vps.yml`)
- [ ] Node.js instalado na VPS
- [ ] PM2 instalado na VPS
- [ ] Projeto clonado na VPS
- [ ] Primeiro push funcionou
- [ ] App está rodando (`pm2 status`)

---

## 🎉 Resultado

Agora você tem:

✅ **Deploy automático** a cada push  
✅ **Logs detalhados** no GitHub Actions  
✅ **Credenciais seguras** (nunca no código)  
✅ **Rollback fácil** (reverter commits)  
✅ **Monitoramento** via PM2  

**Produtividade aumentada!** 🚀

---

## 🆘 Precisa de Ajuda?

1. **Verificar logs do GitHub Actions:**
   - GitHub → Actions → Último workflow
   - Clique para ver logs detalhados

2. **Verificar logs da VPS:**
   ```bash
   ssh seu-usuario@seu-ip-vps
   pm2 logs agendapro --lines 100
   ```

3. **Testar SSH manualmente:**
   ```bash
   ssh -i ~/.ssh/vps_deploy seu-usuario@seu-ip-vps
   ```

---

**Desenvolvido em 20/06/2026**  
**Versão: 1.0**  
**Status: ✅ PRONTO PARA USAR**
