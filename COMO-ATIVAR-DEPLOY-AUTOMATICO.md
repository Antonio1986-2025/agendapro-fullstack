# 🚀 Como Ativar Deploy Automático pelo GitHub

## ⚠️ Situação Atual

Criei todos os arquivos necessários para deploy automático, mas o push foi bloqueado porque:
1. ❌ Token do GitHub precisa de permissão `workflow`
2. ❌ Havia chave da OpenAI nos arquivos

## ✅ Solução Rápida

### **Opção 1: Copiar Arquivos Manualmente (MAIS FÁCIL)**

1. **Abra o GitHub no navegador:**
   - Vá em: https://github.com/Antonio1986-2025/agendapro-fullstack

2. **Criar workflow:**
   - Clique em **Add file** → **Create new file**
   - Nome do arquivo: `.github/workflows/deploy-vps.yml`
   - Copie o conteúdo do arquivo local `.github/workflows/deploy-vps.yml`
   - Clique em **Commit changes**

3. **Criar documentação:**
   - **Add file** → **Create new file**
   - Nome: `DEPLOY-GITHUB-ACTIONS.md`
   - Copie o conteúdo do arquivo local
   - Commit

4. **Criar guia de secrets:**
   - **Add file** → **Create new file**
   - Nome: `GITHUB-SECRETS-SETUP.txt`
   - Copie o conteúdo do arquivo local
   - Commit

---

### **Opção 2: Atualizar Token do GitHub**

1. **Criar novo token com permissão workflow:**
   - Vá em: https://github.com/settings/tokens
   - **Generate new token** → **Classic**
   - Nome: `Deploy Workflow Token`
   - Marque: `repo`, `workflow`
   - **Generate token**
   - Copie o token

2. **Atualizar credencial do Git:**
   ```bash
   # Windows
   git config --global credential.helper manager
   
   # Próximo push vai pedir usuário/senha
   # Use o novo token como senha
   ```

3. **Fazer push novamente:**
   ```bash
   git push origin main
   ```

---

## 📋 Arquivos Criados (Prontos para Copiar)

Todos os arquivos já estão criados localmente:

### 1. `.github/workflows/deploy-vps.yml`
- Workflow de deploy automático
- Roda a cada `git push`
- Deploy via SSH na VPS

### 2. `DEPLOY-GITHUB-ACTIONS.md`
- Documentação completa (12 páginas)
- Guia passo a passo
- Troubleshooting
- Exemplos práticos

### 3. `GITHUB-SECRETS-SETUP.txt`
- Lista de todos os secrets necessários
- Valores prontos para copiar
- Checklist de configuração

---

## 🎯 Próximos Passos

### **1. Subir arquivos para GitHub** (Opção 1 ou 2 acima)

### **2. Configurar Secrets** (IMPORTANTE!)

No GitHub:
- **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**

Adicione estes 10 secrets (veja detalhes em `GITHUB-SECRETS-SETUP.txt`):

1. `VPS_SSH_KEY` - Chave privada SSH
2. `VPS_HOST` - IP da VPS
3. `VPS_USER` - Usuário SSH
4. `VPS_PATH` - Caminho do projeto na VPS
5. `DATABASE_URL` - PostgreSQL URL
6. `SUPABASE_URL` - URL do Supabase
7. `SUPABASE_ANON_KEY` - Anon key
8. `SUPABASE_SERVICE_KEY` - Service key
9. `OPENAI_API_KEY` - Chave OpenAI (sua chave real)
10. `JWT_SECRET` - Secret aleatório

### **3. Configurar SSH**

Na sua máquina:
```bash
# Gerar chave SSH
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/vps_deploy

# Ver chave privada (vai no GitHub como VPS_SSH_KEY)
cat ~/.ssh/vps_deploy

# Ver chave pública
cat ~/.ssh/vps_deploy.pub
```

Na VPS:
```bash
# Adicionar chave pública
ssh seu-usuario@seu-ip-vps
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Cole a chave pública aqui
chmod 600 ~/.ssh/authorized_keys
```

### **4. Testar Deploy**

Depois de configurar tudo:
```bash
# Fazer qualquer mudança
echo "# Teste" >> README.md
git add .
git commit -m "Teste deploy automático"
git push origin main

# Acompanhar em:
# https://github.com/Antonio1986-2025/agendapro-fullstack/actions
```

---

## 📊 Checklist de Ativação

- [ ] Arquivos subidos para GitHub (.github/workflows/deploy-vps.yml)
- [ ] Chave SSH gerada
- [ ] Chave pública na VPS (~/.ssh/authorized_keys)
- [ ] 10 secrets configurados no GitHub
- [ ] Teste de conexão SSH funcionando
- [ ] Node.js + PM2 instalados na VPS
- [ ] Projeto clonado na VPS
- [ ] Primeiro push testado
- [ ] Workflow executou com sucesso

---

## 🆘 Se Precisar de Ajuda

### **Ver secrets necessários:**
```bash
cat GITHUB-SECRETS-SETUP.txt
```

### **Ver documentação completa:**
```bash
cat DEPLOY-GITHUB-ACTIONS.md
```

### **Ver workflow:**
```bash
cat .github/workflows/deploy-vps.yml
```

---

## 🎉 Resultado Esperado

Depois de tudo configurado:

1. **Você faz:**
   ```bash
   git push origin main
   ```

2. **GitHub faz automaticamente:**
   - Conecta na VPS via SSH
   - Faz `git pull`
   - Instala dependências
   - Roda migrations
   - Reinicia PM2
   - Mostra logs

3. **Tempo total:** 2-3 minutos ⚡

---

## 💡 Dica Rápida

Se quiser fazer deploy manual por enquanto, use o script que já existe:

```bash
# Na VPS
ssh seu-usuario@seu-ip-vps
cd /caminho/projeto
./deploy-vps.sh
```

Mas o deploy automático é MUITO mais prático! 🚀

---

**Status:** ✅ Arquivos prontos, aguardando upload manual no GitHub
**Próximo passo:** Escolher Opção 1 (manual) ou Opção 2 (atualizar token)
