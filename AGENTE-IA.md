# 🤖 Agente IA - Documentação Completa

## Visão Geral

O Agente IA é um assistente virtual inteligente que interage com clientes via WhatsApp, usando a API da OpenAI (GPT-4o-mini) para processar linguagem natural e executar ações automatizadas no sistema.

## 🎯 Funcionalidades

### **9 Ferramentas (Tools) Disponíveis**

| Ferramenta | Descrição | Quando Usar |
|------------|-----------|-------------|
| **listarServicos** | Lista todos os serviços da barbearia | Cliente pergunta sobre serviços ou preços |
| **listarProfissionais** | Lista todos os barbeiros | Cliente pergunta sobre profissionais |
| **verificarDisponibilidade** | Mostra horários ocupados | Cliente quer ver horários livres |
| **buscarCliente** | Busca cliente por telefone | Antes de criar agendamento |
| **cadastrarCliente** | Cadastra novo cliente | Quando cliente não existe |
| **criarAgendamento** | Cria agendamento confirmado | Após confirmar todos os detalhes |
| **listarAgendamentosCliente** | Lista agendamentos futuros | Cliente pergunta seus horários |
| **cancelarAgendamento** | Cancela um agendamento | Cliente quer cancelar |
| **reagendarAgendamento** | Muda data/hora | Cliente quer remarcar |

---

## 🔧 Configuração

### **1. Chave da OpenAI**

Adicione no arquivo `.env`:

```env
OPENAI_API_KEY=sk-proj-...
```

### **2. Ativar no WhatsApp Config**

No painel da barbearia:
1. Vá em **Configurações** → **WhatsApp**
2. Conecte o WhatsApp (Baileys)
3. Ative **"Agente IA"**
4. (Opcional) Personalize o prompt do sistema

### **3. Verificar Conexão**

```bash
node test-ai.js
```

---

## 📊 Fluxo de Funcionamento

```
┌─────────────────┐
│ Cliente envia   │
│ mensagem no WA  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Baileys recebe  │
│ e dispara hook  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ processarMensagem()     │
│ - Carrega histórico     │
│ - Monta prompt sistema  │
│ - Envia para OpenAI     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ OpenAI analisa e decide │
│ se precisa usar tools   │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Sem tools  Com tools
    │         │
    │    ┌────┴────────────────┐
    │    │ executarTool()      │
    │    │ - Consulta banco    │
    │    │ - Retorna resultado │
    │    └────┬────────────────┘
    │         │
    │         ▼
    │    ┌────────────────────┐
    │    │ OpenAI processa    │
    │    │ resultados e gera  │
    │    │ resposta natural   │
    │    └────┬───────────────┘
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────────┐
│ Resposta formatada  │
│ é enviada ao cliente│
└─────────────────────┘
```

---

## 💬 Exemplos de Conversas

### **Exemplo 1: Listar Serviços**

```
Cliente: Quanto custa cortar cabelo?

IA:
  [Tool: listarServicos]
  
🤖 Olá! Aqui estão nossos serviços:

✂️ Corte de Cabelo
   💰 R$ 35.00 • ⏱️ 30 min

✂️ Barba
   💰 R$ 25.00 • ⏱️ 20 min

✂️ Corte + Barba
   💰 R$ 55.00 • ⏱️ 50 min

Gostaria de agendar? 😊
```

### **Exemplo 2: Criar Agendamento Completo**

```
Cliente: Quero agendar um corte

IA: Ótimo! Vou te ajudar. Primeiro, qual seu nome completo?

Cliente: João Silva

IA:
  [Tool: buscarCliente] → não encontrado
  [Tool: cadastrarCliente]
  
✅ Cadastrado! Agora, para quando você gostaria de agendar?

Cliente: Amanhã de manhã

IA:
  [Tool: verificarDisponibilidade]
  
📅 Disponibilidade para sexta-feira, 19 de junho:

🔴 Horários ocupados:
   09:00 - Carlos (Corte)
   10:30 - João (Barba)

👥 Profissionais disponíveis:
   • Carlos (Cortes clássicos)
   • Pedro (Barbas e degradês)

Que horário você prefere?

Cliente: 11h com o Carlos

IA:
  [Tool: listarServicos]
  [Tool: criarAgendamento]
  
✅ Agendamento confirmado!

✂️ Serviço: Corte de Cabelo
👤 Profissional: Carlos
📅 Data: sexta-feira, 19 de junho
🕐 Horário: 11:00
⏱️ Duração: 30 minutos
💰 Valor: R$ 35.00

Qualquer dúvida, é só me chamar! 😊
```

### **Exemplo 3: Cancelar Agendamento**

```
Cliente: Preciso cancelar meu horário

IA:
  [Tool: listarAgendamentosCliente]
  
📅 Seus agendamentos:

1. 🟡 Corte de Cabelo
   📅 19/06/2026 às 11:00
   👤 Carlos • R$ 35.00
   🆔 ID: abc-123-def

Confirma que quer cancelar este agendamento?

Cliente: Sim, cancela

IA:
  [Tool: cancelarAgendamento]
  
✅ Agendamento cancelado com sucesso! 
Você pode agendar novamente quando quiser.
```

---

## 🛠️ Desenvolvimento

### **Estrutura de Arquivos**

```
server/services/
  ├── ai.js                  # Lógica principal do agente
  ├── whatsapp.js            # Envio de mensagens
  └── baileys-provider.js    # Conexão WhatsApp

server/routes/
  └── ai.js                  # Rotas da API (/api/ai/*)

test-ai.js                   # Script de teste
```

### **Adicionar Nova Ferramenta**

1. **Adicione no array `tools`:**

```javascript
{
  type: 'function',
  function: {
    name: 'minhaNovaFerramenta',
    description: 'Descrição clara do que faz',
    parameters: {
      type: 'object',
      properties: {
        parametro1: { 
          type: 'string', 
          description: 'O que é este parâmetro' 
        }
      },
      required: ['parametro1'],
      additionalProperties: false
    },
  },
}
```

2. **Implemente em `executarTool()`:**

```javascript
case 'minhaNovaFerramenta': {
  const { parametro1 } = args;
  
  // Validação
  if (!parametro1) {
    return { erro: 'Parâmetro obrigatório' };
  }
  
  // Lógica
  const { rows } = await query(`SELECT ...`, [parametro1]);
  
  // Retorno
  return rows;
}
```

3. **Formate em `formatarRespostaTool()`:**

```javascript
case 'minhaNovaFerramenta':
  return `✅ Resultado formatado: ${resultado}`;
```

---

## 🔍 Debugging

### **Logs Detalhados**

O agente gera logs completos:

```
🤖 ====== PROCESSANDO MENSAGEM ======
📍 Barbearia: Barbearia Demo (abc-123)
💬 Mensagem: Quero agendar
📚 Histórico: 4 mensagens
📤 Enviando para OpenAI...
📥 Resposta recebida (finish_reason: tool_calls)
🔧 2 ferramenta(s) solicitada(s):
   - buscarCliente
   - listarServicos
🔧 Executando tool: buscarCliente
✅ Cliente encontrado: João Silva
🔧 Executando tool: listarServicos
✅ 3 serviços encontrados
📤 Enviando resultados das ferramentas de volta para OpenAI...
✅ Resposta final gerada (245 chars)
====================================
```

### **Erros Comuns**

| Erro | Causa | Solução |
|------|-------|---------|
| `OPENAI_API_KEY não encontrada` | Chave não configurada | Adicione no `.env` |
| `invalid_api_key` | Chave inválida/expirada | Verifique no dashboard OpenAI |
| `rate_limit_exceeded` | Muitas requisições | Aguarde alguns segundos |
| `context_length_exceeded` | Histórico muito grande | Limpado automaticamente |
| `Agente IA não configurado` | Cliente OpenAI null | Verifique logs de inicialização |

---

## 📈 Monitoramento

### **Tabelas do Banco**

```sql
-- Conversas ativas
SELECT 
  cliente_telefone,
  ultima_interacao,
  jsonb_array_length(historico) as total_mensagens
FROM ai_conversas
ORDER BY ultima_interacao DESC;

-- Mensagens enviadas/recebidas
SELECT 
  tipo,
  COUNT(*),
  DATE(created_at) as data
FROM whatsapp_mensagens
WHERE tipo IN ('recebida', 'ia_resposta')
GROUP BY tipo, DATE(created_at)
ORDER BY data DESC;
```

### **Métricas Importantes**

- Taxa de resolução (agendamentos criados / conversas)
- Tempo médio de resposta
- Ferramentas mais usadas
- Taxa de erro

---

## 🚀 Melhorias Futuras

- [ ] Suporte a imagens (enviar catálogo de serviços)
- [ ] Integração com Google Calendar
- [ ] Lembretes automáticos 24h antes
- [ ] Feedback pós-atendimento
- [ ] Analytics avançado de conversas
- [ ] Multi-idioma (inglês, espanhol)
- [ ] Voice messages (transcrição automática)

---

## 📚 Referências

- [OpenAI Function Calling Docs](https://platform.openai.com/docs/guides/function-calling)
- [GPT-4o-mini Model Card](https://platform.openai.com/docs/models/gpt-4o-mini)
- [Baileys WhatsApp Library](https://github.com/WhiskeySockets/Baileys)
- [Best Practices for AI Agents](https://platform.openai.com/docs/guides/prompt-engineering)

---

## ✅ Checklist de Deployment

- [ ] `OPENAI_API_KEY` configurada
- [ ] WhatsApp conectado (Baileys)
- [ ] Agente IA ativado nas configurações
- [ ] Testado com `node test-ai.js`
- [ ] Prompt personalizado configurado (opcional)
- [ ] Profissionais cadastrados com telefone
- [ ] Serviços cadastrados
- [ ] Monitoramento de logs ativo

---

**Última atualização:** 18 de Junho de 2026  
**Versão:** 2.0 (Reconstruído)
