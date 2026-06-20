#!/bin/bash

# ========================================
# INSTALAÇÃO LIMPA - AgendaPro na VPS
# ========================================

set -e  # Para na primeira falha

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "========================================="
echo "  INSTALAÇÃO LIMPA - AGENDAPRO"
echo "========================================="
echo -e "${NC}"

# ========================================
# 1. VERIFICAR REQUISITOS
# ========================================
echo -e "${YELLOW}📋 Verificando requisitos...${NC}"

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js instalado: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js não encontrado!${NC}"
    echo "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Git
if command -v git &> /dev/null; then
    echo -e "${GREEN}✅ Git instalado${NC}"
else
    echo -e "${RED}❌ Git não encontrado!${NC}"
    sudo apt-get install -y git
fi

# PM2
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2 instalado${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 não encontrado, instalando...${NC}"
    sudo npm install -g pm2
fi

echo ""

# ========================================
# 2. PERGUNTAR INFORMAÇÕES
# ========================================
echo -e "${BLUE}📝 Configuração do projeto${NC}"
echo ""

read -p "Nome da pasta do projeto [agendapro-new]: " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-agendapro-new}

read -p "Porta do servidor [3001]: " PORT
PORT=${PORT:-3001}

echo ""
echo -e "${YELLOW}🔑 Configuração do Banco de Dados (Supabase)${NC}"
read -p "DATABASE_URL: " DATABASE_URL
read -p "SUPABASE_URL: " SUPABASE_URL
read -p "SUPABASE_ANON_KEY: " SUPABASE_ANON_KEY
read -p "SUPABASE_SERVICE_KEY: " SUPABASE_SERVICE_KEY

echo ""
echo -e "${YELLOW}🤖 Configuração da OpenAI${NC}"
read -p "OPENAI_API_KEY: " OPENAI_API_KEY

echo ""
echo -e "${YELLOW}🔐 Configuração JWT${NC}"
read -p "JWT_SECRET (deixe vazio para gerar aleatório): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32)
    echo "JWT_SECRET gerado: $JWT_SECRET"
fi

echo ""

# ========================================
# 3. CRIAR DIRETÓRIO DO PROJETO
# ========================================
echo -e "${BLUE}📁 Criando diretório do projeto...${NC}"

if [ -d "$HOME/$PROJECT_NAME" ]; then
    echo -e "${YELLOW}⚠️  Diretório $PROJECT_NAME já existe!${NC}"
    read -p "Deseja sobrescrever? (s/n): " OVERWRITE
    if [ "$OVERWRITE" = "s" ]; then
        echo "Fazendo backup..."
        mv "$HOME/$PROJECT_NAME" "$HOME/${PROJECT_NAME}.backup.$(date +%Y%m%d_%H%M%S)"
    else
        echo "Operação cancelada."
        exit 1
    fi
fi

cd $HOME

# ========================================
# 4. CLONAR REPOSITÓRIO
# ========================================
echo -e "${BLUE}📥 Clonando repositório do GitHub...${NC}"

git clone https://github.com/Antonio1986-2025/agendapro-fullstack.git $PROJECT_NAME
cd $PROJECT_NAME

echo -e "${GREEN}✅ Código clonado com sucesso!${NC}"
echo ""

# ========================================
# 5. CRIAR ARQUIVO .ENV
# ========================================
echo -e "${BLUE}⚙️  Criando arquivo .env...${NC}"

cat > .env << EOF
# ===== Supabase Database =====
DATABASE_URL=$DATABASE_URL
DB_SSL=true
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# ===== OpenAI (Agente IA) =====
OPENAI_API_KEY=$OPENAI_API_KEY

# ===== Servidor =====
PORT=$PORT
NODE_ENV=production
AUTO_MIGRATE=true
TZ=America/Sao_Paulo

# ===== JWT =====
JWT_SECRET=$JWT_SECRET
JWT_EXPIRATION=7d
EOF

echo -e "${GREEN}✅ Arquivo .env criado!${NC}"
echo ""

# ========================================
# 6. INSTALAR DEPENDÊNCIAS
# ========================================
echo -e "${BLUE}📦 Instalando dependências...${NC}"

npm install --production

echo -e "${GREEN}✅ Dependências instaladas!${NC}"
echo ""

# ========================================
# 7. RODAR MIGRATIONS
# ========================================
echo -e "${BLUE}🗄️  Executando migrations do banco...${NC}"

npm run migrate

echo -e "${GREEN}✅ Migrations executadas!${NC}"
echo ""

# ========================================
# 8. PERGUNTAR SOBRE SEED
# ========================================
echo -e "${YELLOW}Deseja popular o banco com dados de demonstração? (s/n)${NC}"
read -p "Resposta: " SEED
if [ "$SEED" = "s" ]; then
    echo "Populando banco..."
    npm run seed
    echo -e "${GREEN}✅ Banco populado com dados demo!${NC}"
    echo -e "${BLUE}Login demo: demo@agendapro.com / 123456${NC}"
fi
echo ""

# ========================================
# 9. TESTAR AGENTE IA
# ========================================
echo -e "${BLUE}🧪 Testando Agente IA...${NC}"

node test-ai.js

echo ""

# ========================================
# 10. INICIAR COM PM2
# ========================================
echo -e "${BLUE}🚀 Iniciando aplicação com PM2...${NC}"

# Parar instâncias antigas
pm2 delete agendapro 2>/dev/null || true

# Iniciar nova instância
pm2 start npm --name "agendapro" -- start
pm2 save

echo -e "${GREEN}✅ Aplicação iniciada!${NC}"
echo ""

# ========================================
# 11. CONFIGURAR FIREWALL (OPCIONAL)
# ========================================
echo -e "${YELLOW}Deseja configurar firewall para porta $PORT? (s/n)${NC}"
read -p "Resposta: " FIREWALL
if [ "$FIREWALL" = "s" ]; then
    sudo ufw allow $PORT/tcp
    echo -e "${GREEN}✅ Firewall configurado!${NC}"
fi
echo ""

# ========================================
# 12. RESUMO FINAL
# ========================================
echo -e "${GREEN}"
echo "========================================="
echo "  ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "========================================="
echo -e "${NC}"
echo ""
echo -e "${BLUE}📊 Informações do projeto:${NC}"
echo "Pasta: $HOME/$PROJECT_NAME"
echo "Porta: $PORT"
echo "URL: http://$(curl -s ifconfig.me):$PORT"
echo ""
echo -e "${BLUE}🔧 Comandos úteis:${NC}"
echo "Ver logs:       pm2 logs agendapro"
echo "Status:         pm2 status"
echo "Reiniciar:      pm2 restart agendapro"
echo "Parar:          pm2 stop agendapro"
echo "Monitorar:      pm2 monit"
echo ""
echo -e "${BLUE}📱 Próximos passos:${NC}"
echo "1. Acesse: http://$(curl -s ifconfig.me):$PORT"
echo "2. Faça login (demo@agendapro.com / 123456)"
echo "3. Vá em Configurações → WhatsApp"
echo "4. Conecte seu WhatsApp (QR Code)"
echo "5. Ative 'Agente IA'"
echo "6. Teste enviando mensagem WhatsApp"
echo ""
echo -e "${YELLOW}📋 Ver logs em tempo real:${NC}"
echo "pm2 logs agendapro --lines 50"
echo ""
echo -e "${GREEN}Tudo pronto! 🎉${NC}"
