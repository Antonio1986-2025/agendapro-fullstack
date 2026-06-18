#!/bin/bash

# ========================================
# Script de Deploy - AgendaPro VPS
# ========================================

echo "🚀 ====== DEPLOY AGENDAPRO VPS ======"
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para imprimir com cor
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

# 1. Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    print_error "Execute este script na raiz do projeto!"
    exit 1
fi

print_success "Diretório correto"

# 2. Fazer backup do arquivo anterior
echo ""
echo "📦 Fazendo backup..."
if [ -f "server/services/ai.js" ]; then
    cp server/services/ai.js server/services/ai.js.backup.$(date +%Y%m%d_%H%M%S)
    print_success "Backup criado"
else
    print_warning "Arquivo ai.js não encontrado (primeira instalação?)"
fi

# 3. Puxar atualizações do GitHub
echo ""
echo "📥 Atualizando código do GitHub..."
git fetch origin
git pull origin main

if [ $? -eq 0 ]; then
    print_success "Código atualizado"
else
    print_error "Erro ao atualizar código"
    exit 1
fi

# 4. Verificar se OpenAI_API_KEY está no .env
echo ""
echo "🔍 Verificando configurações..."
if grep -q "OPENAI_API_KEY" .env; then
    print_success "OPENAI_API_KEY encontrada no .env"
else
    print_warning "OPENAI_API_KEY não encontrada no .env!"
    echo "Adicione a chave OpenAI no arquivo .env:"
    echo "OPENAI_API_KEY=sk-proj-..."
    read -p "Pressione Enter para continuar mesmo assim..."
fi

# 5. Instalar/Atualizar dependências
echo ""
echo "📦 Instalando dependências..."
npm install --production

if [ $? -eq 0 ]; then
    print_success "Dependências instaladas"
else
    print_error "Erro ao instalar dependências"
    exit 1
fi

# 6. Rodar migrations (se necessário)
echo ""
echo "🗄️  Rodando migrations..."
npm run migrate 2>/dev/null || print_warning "Migrations não disponíveis ou já aplicadas"

# 7. Detectar qual gerenciador de processos está rodando
echo ""
echo "🔄 Reiniciando servidor..."

if command -v pm2 &> /dev/null; then
    echo "Usando PM2..."
    pm2 restart all
    if [ $? -eq 0 ]; then
        print_success "Servidor reiniciado com PM2"
        pm2 status
    else
        print_error "Erro ao reiniciar PM2"
    fi

elif command -v docker-compose &> /dev/null && [ -f "docker-compose.yml" ]; then
    echo "Usando Docker Compose..."
    docker-compose restart app
    if [ $? -eq 0 ]; then
        print_success "Container reiniciado"
        docker-compose ps
    else
        print_error "Erro ao reiniciar container"
    fi

elif systemctl is-active --quiet agendapro; then
    echo "Usando systemd..."
    sudo systemctl restart agendapro
    if [ $? -eq 0 ]; then
        print_success "Serviço reiniciado"
        sudo systemctl status agendapro --no-pager
    else
        print_error "Erro ao reiniciar serviço"
    fi

else
    print_warning "Gerenciador de processos não detectado"
    echo "Reinicie manualmente: npm start"
fi

# 8. Testar conexão OpenAI (opcional)
echo ""
echo "🧪 Deseja testar o Agente IA agora? (s/n)"
read -r resposta
if [ "$resposta" = "s" ] || [ "$resposta" = "S" ]; then
    node test-ai.js
fi

# 9. Mostrar logs recentes (se PM2)
if command -v pm2 &> /dev/null; then
    echo ""
    echo "📋 Últimos logs (Ctrl+C para sair):"
    sleep 2
    pm2 logs --lines 20
fi

echo ""
print_success "====== DEPLOY CONCLUÍDO! ======"
echo ""
echo "📝 Próximos passos:"
echo "   1. Acesse: http://seu-dominio:3000"
echo "   2. Vá em Configurações → WhatsApp"
echo "   3. Ative 'Agente IA'"
echo "   4. Teste enviando mensagem WhatsApp"
echo ""
