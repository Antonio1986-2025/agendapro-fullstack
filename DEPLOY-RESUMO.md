# 🚀 Deploy Automático - Resumo Executivo

## ✅ O Que Foi Criado

Preparei todo o sistema de **deploy automático via GitHub Actions** para sua VPS.

---

## 📦 Arquivos Disponíveis

### **1. Workflow do GitHub Actions**
📁 `.github/workflows/deploy-vps.yml`
- ✅ Criado localmente (pronto para usar)
- ⚠️ Não enviado para GitHub (token sem permissão `workflow`)
- 🎯 Solução: Copiar manualmente ou atualizar token

### **2. Documentação Completa**
📄 **DEPLOY-GITHUB-ACTIONS.md** (12 páginas)
- ✅ Enviado para GitHub ✅
- Guia completo passo a passo
- Configuração de SSH
- Configuração de secrets
- Troubleshooting
- Exemplos práticos

### **3. Guia Rápido de Secrets**
📄 **GITHUB-SECRETS-SETUP.txt**
- ✅ Enviado para GitHub ✅
- Lista de 10 secrets necessários
- Valores prontos (placeholders seguros)
- Checklist de configuração

### **4. Guia de Ativação**
📄 **COMO-ATIVAR-DEPLOY-AUTOMATICO.md**
- ✅ Enviado para GitHub ✅
- Explica o problema do token
- 2 opções de solução
- Próximos passos claros

---

## 🎯 Como Ativar Agora

### **Opção A: Copiar Workflow Manualmente (RECOMENDADO)**

1. **Abra o GitHub no navegador:**
   ```
   https://github.com/Antonio1986-2025/agendapro-fullstack
   ```

2. **Crie o workflow:**
   - Clique em **Add file** → **Create new file**
   - Nome: `.github/workflows/deploy-vps.yml`
   - Copie o conteúdo de: `.github/workflows/deploy-vps.yml` (arquivo local)
   - **Commit changes**

3. **Configure os Secrets:**
   - **Settings** → **Secrets and variables** → **Actions**
   - Adicione os 10 secrets (veja `GITHUB-SECRETS-SETUP.txt`)

4. **Configure SSH:**
   ```bash
   # Gerar chave
   ssh-keygen -t ed25519 -C "github" -f ~/.ssh/vps_deploy
   
   # Adicionar chave pública na VPS
   ssh-copy-id -i ~/.ssh/vps_deploy.pub usuario@ip-vps
   
   # Copiar chave PRIVADA para GitHub secret VPS_SSH_KEY
   cat ~/.ssh/vps_deploy
   ```

5. **Testar:**
   ```bash
   echo "# Teste" >> README.md
   git add .
   git commit -m "Teste deploy"
   git push origin main
   ```

---

### **Opção B: Atualizar Token do GitHub**

1. **Criar novo token:**
   - https://github.com/settings/tokens
   - **Generate new token (Classic)**
   - Marque: `repo` + `workflow`
   - Copie o token

2. **Atualizar no Git:**
   ```bash
   # Windows
   git config --global credential.helper manager
   
   # Próximo push pede senha - use o novo token
   git push origin main
   ```

---

## 📋 10 Secrets Necessários

| # | Nome | O que é |
|---|------|---------|
| 1 | `VPS_SSH_KEY` | Chave privada SSH |
| 2 | `VPS_HOST` | IP da VPS (ex: 123.45.67.89) |
| 3 | `VPS_USER` | Usuário SSH (ex: root) |
| 4 | `VPS_PATH` | Caminho do projeto (ex: /root/agendapro) |
| 5 | `DATABASE_URL` | URL do PostgreSQL |
| 6 | `SUPABASE_URL` | URL do Supabase |
| 7 | `SUPABASE_ANON_KEY` | Anon key |
| 8 | `SUPABASE_SERVICE_KEY` | Service key |
| 9 | `OPENAI_API_KEY` | Chave OpenAI (sua chave) |
| 10 | `JWT_SECRET` | Secret aleatório |

**Valores detalhados:** Veja `GITHUB-SECRETS-SETUP.txt`

---

## 🎉 Resultado Final

Depois de configurar:

### **Você faz:**
```bash
git push origin main
```

### **GitHub faz automaticamente:**
1. 📥 Conecta na VPS via SSH
2. 📦 Faz `git pull` do código novo
3. 📝 Atualiza arquivo `.env`
4. 🔧 Instala dependências
5. 🗄️ Roda migrations
6. 🔄 Reinicia PM2
7. ✅ Mostra status e logs

**Tempo total:** 2-3 minutos ⚡

---

## 📊 Status Atual

| Item | Status |
|------|--------|
| Workflow criado | ✅ Pronto (local) |
| Documentação | ✅ No GitHub |
| Guias | ✅ No GitHub |
| Secrets | ⏳ Aguardando configuração |
| SSH | ⏳ Aguardando configuração |
| Deploy automático | ⏳ Aguardando ativação |

---

## 🚀 Próximo Passo

**Escolha uma opção:**

### 👉 **Opção A** (Mais Fácil)
Copiar workflow manualmente no GitHub

### 👉 **Opção B** (Mais Técnico)
Atualizar token do Git com permissão `workflow`

**Documentação completa:** `COMO-ATIVAR-DEPLOY-AUTOMATICO.md`

---

## 💡 Dica

Enquanto não ativa deploy automático, pode fazer deploy manual:

```bash
# Na VPS
ssh usuario@ip-vps
cd /caminho/projeto
./deploy-vps.sh
```

Mas o automático é **muito** mais prático! 🎯

---

## 📚 Links Úteis

- **Workflow:** `.github/workflows/deploy-vps.yml` (arquivo local)
- **Guia completo:** `DEPLOY-GITHUB-ACTIONS.md`
- **Secrets:** `GITHUB-SECRETS-SETUP.txt`
- **Ativação:** `COMO-ATIVAR-DEPLOY-AUTOMATICO.md`
- **Repositório:** https://github.com/Antonio1986-2025/agendapro-fullstack

---

**Status:** ✅ Tudo pronto, aguardando ativação manual
**Tempo de setup:** 10-15 minutos
**Resultado:** Deploy automático a cada `git push` 🚀
