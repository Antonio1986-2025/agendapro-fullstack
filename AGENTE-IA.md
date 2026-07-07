# Agente IA - Agendapro

## Visao Geral

O Agente IA e um assistente virtual que interage com clientes via WhatsApp. Usa OpenAI (GPT-4o-mini) com padrao **Slot Filling** para guiar o cliente ate um agendamento completo. O estado e persistido em Postgres e sobrevive a restarts, deploys e conversas paralelas.

**Stack:** OpenAI Function Calling + Evolution API (Baileys) + Postgres (slot state)

---

## Arquitetura

```
┌──────────────┐
│  Cliente WA  │
└──────┬───────┘
       │ Mensagem WhatsApp
       ▼
┌──────────────────────────┐
│    Evolution API         │
│  (Baileys - instancia    │
│   por barbearia)         │
└──────────┬───────────────┘
           │ HTTP POST (webhook)
           ▼
┌──────────────────────────────────┐
│ POST /api/whatsapp/webhook/      │
│       evolution/:barbeariaId     │
│                                  │
│ whatsapp.js:31 → filtra evento,  │
│ extrai texto/audio/imagem,       │
│ enfileira por telefone           │
└──────────┬───────────────────────┘
           ▼
┌──────────────────────────────────┐
│ processarWebhookEvolution()      │
│                                  │
│ 1. Transcreve audio (Whisper)    │
│ 2. Salva em whatsapp_mensagens   │
│ 3. Carrega historico + estado    │
│ 4. Envia "digitando..."          │
│ 5. Chama processarMensagem()     │
│ 6. Envia resposta via Evolution  │
│ 7. Salva historico (30 msg max)  │
└──────────┬───────────────────────┘
           ▼
┌──────────────────────────────────┐
│ processarMensagem()              │
│                                  │
│ while (iteracao < MAX_ITERACOES) │
│   OpenAI (tool_choice:required)  │
│   → executa tools                │
│   → detecta loop                 │
│   → atualiza estado              │
└──────────────────────────────────┘
```

### Arquivos Principais

| Arquivo | Linhas | Proposito |
|---|---|---|
| `server/services/ai.js` | 2580 | Orquestrador: tools, loop, system prompt, execucao |
| `server/services/workflow-state.js` | 463 | Maquina de estado slot-filling, persiste em Postgres |
| `server/routes/whatsapp.js` | 747 | Webhook Evolution, processa audio/historico, invoca ai.js |
| `server/services/evolution-provider.js` | 624 | Provider Evolution API: instancias, envio/recebimento |

---

## Modelo de Estado (Slot Filling)

### Estrutura

```javascript
{
  versao: 2,
  fluxo_ativo: null,           // 'agendamento' | null
  iniciado_em: null,           // ISO string
  goal: {
    tipo: 'criar_agendamento',
    descricao: 'Coletar dados e criar um agendamento completo',
  },
  slots: {
    cliente:      { preenchido: false, valor: null },
    servico:      { preenchido: false, valor: null },
    profissional: { preenchido: false, valor: null },
    para_quem:    { preenchido: false, valor: null },
    data:         { preenchido: false, valor: null },
    horario:      { preenchido: false, valor: null },
  },
  ultimo_slot_preenchido: null,
  agendamento_criado_id: null,  // idempotencia
  agendamento_criado_em: null,  // ISO string
  ultima_atualizacao: null,     // ISO string
}
```

### Ordem de Preenchimento

```
cliente → servico → profissional → para_quem → data → horario
```

### Funcoes Principais (workflow-state.js)

| Funcao | Descricao |
|---|---|
| `carregarEstado(barbeariaId, telefone)` | Le do banco ou retorna estado novo |
| `salvarEstado(barbeariaId, telefone, estado)` | Persiste no banco (coluna `contexto` da tabela `ai_conversas`) |
| `iniciarFluxo(estado, fluxo, clienteData?)` | Cria novo estado com fluxo ativo |
| `resetarFluxo(estado, agendamentoId?)` | Limpa tudo, mantendo ID criado |
| `definirSlot(estado, slotName, valor)` | Preenche um slot |
| `limparSlot(estado, slotName)` | Limpa um slot (ex: ao mudar data, limpa horario) |
| `checklistCompleto(estado)` | Verifica se todos os slots estao preenchidos |
| `proximoSlot(estado)` | Nome do proximo slot pendente ou `'completo'` |
| `calcularProgresso(estado)` | `{ concluido, percentual, preenchidos, total }` |
| `temAgendamentoRecente(estado, minutos)` | Protecao contra duplicacao (5 min padrao) |
| `fluxoEstagnado(estado, minutos)` | Detecta fluxo parado ha 30+ min |
| `formatarEstadoParaPrompt(estado)` | Texto legivel para o system prompt |

---

## Ferramentas (Tools)

### Fluxo de Agendamento (8)

| Ferramenta | Descricao | Parametros |
|---|---|---|
| `iniciarAgendamento` | Inicia fluxo, reseta estado anterior, identifica cliente pelo telefone | — |
| `cadastrarClientePrincipal` | Cadastra o cliente que esta conversando | `{ nome }` |
| `definirServico` | Define servico (UUID, nome ou posicao) | `{ servico }` |
| `definirProfissional` | Define profissional (UUID, nome ou posicao) | `{ profissional }` |
| `definirParaQuem` | Define se e para o proprio ou terceiro | `{ tipo, nome_pessoa? }` |
| `definirData` | Define data (linguagem natural) | `{ data }` |
| `definirHorario` | Define horario, verifica disponibilidade real | `{ horario }` |
| `finalizarAgendamento` | Cria o agendamento no banco (checklist 100%) | — |

### Consulta (4)

| Ferramenta | Descricao | Parametros |
|---|---|---|
| `listarServicos` | Lista servicos ativos da barbearia | — |
| `listarProfissionais` | Lista profissionais ativos (com `formatado`) | — |
| `consultarHorariosLivres` | Horarios disponiveis em uma data | `{ data, profissional?, duracao_minutos? }` |
| `consultarInfoBarbearia` | Endereco, horarios, contato | — |

### Gerenciamento (3)

| Ferramenta | Descricao | Parametros |
|---|---|---|
| `listarMeusAgendamentos` | Lista agendamentos futuros do cliente | — |
| `cancelarAgendamentoExistente` | Cancela (so com confirmacao explicita) | `{ agendamento_id, confirmacao_explicita }` |
| `reagendarAgendamento` | Altera data/horario, mantem servico/profissional | `{ agendamento_id, nova_data, novo_horario }` |

### Auxiliares (5)

| Ferramenta | Descricao | Parametros |
|---|---|---|
| `registrarSolicitacaoEspecial` | Servico nao catalogado, notifica responsaveis | `{ servico_solicitado, observacoes? }` |
| `cancelarFluxoAtual` | Cancela fluxo em andamento sem afetar agendamentos | — |
| `verificarEstadoAtual` | Le o estado direto do banco (fonte da verdade) | — |
| `buscarHistoricoCliente` | Total visitas, ultimo servico, ultimo profissional | — |
| `responderCliente` | **Tool obrigatoria** — envia a mensagem final ao cliente | `{ mensagem }` |

**DATA_TOOLS** (tools que consultam a base, validadas antes de `responderCliente`):
`listarServicos`, `listarProfissionais`, `consultarHorariosLivres`, `consultarInfoBarbearia`, `buscarHistoricoCliente`, `listarMeusAgendamentos`, `verificarEstadoAtual`

---

## System Prompt

Montado dinamicamente por `montarSystemPrompt()` (ai.js:2092):

1. **Cabecalho:** "Voce e o atendente virtual da barbearia [nome]..."
2. **Data/hora atual** (pt-BR, dia da semana)
3. **4 Regras Absolutas:**
   - Zero alucinacao — tudo consultado no banco
   - Sempre usar o nome do cliente
   - Checklist e a verdade — ignorar memoria
   - Usar campo `formatado` quando disponivel
4. **Cliente atual:** telefone, pushName, dados (nome, visitas, ultimo servico)
5. **Estado formatado:** fluxo ativo, checklist com emojis (✅/❌), progresso, proximo passo
6. **Instrucoes de fluxo:** ordem, regras, perguntas alvo para cada slot
7. **Reclamacoes e objecoes:** acolher, resolver ou transferir
8. **Cancelar/Remarcar:** nunca cancelar de cara, oferecer remarcar primeiro
9. **Audio/Imagem/Servico novo:** orientacoes
10. **Transferir para humano:** quando usar
11. **(Opcional) Prompt personalizado da barbearia**

---

## Loop de Execucao

```
MAX_ITERACOES = 12
temperature = 0.3
max_tokens = 1200

while (iteracao < MAX_ITERACOES):
  1. Envia mensagens + tools para OpenAI (tool_choice: 'required')
  2. Se resposta sem tool_calls → retorna resposta
  3. Executa tools chamadas
  4. Detecta loop: mesma assinatura (tool + args + resultado) repetida?
     → Retorna fallback "Desculpe, tive uma confusao..."
  5. Short-circuit: finalizarAgendamento pendente? → forca execucao
  6. Short-circuit: responderCliente chamada? → retorna resposta
  7. Atualiza system prompt com novo estado
  8. proxima iteracao

Se excedeu MAX_ITERACOES:
  → Forca chamada final sem tools (tool_choice: 'none')
  → Sanitiza XML de tool_calls
  → Retorna response ou fallback
```

### Fluxo da Mensagem (Passo a Passo)

```
1. Cliente envia WhatsApp → Evolution API recebe via Baileys
2. Evolution API dispara webhook → POST /api/whatsapp/webhook/evolution/:id
3. whatsapp.js filtra: event === 'messages.upsert', !fromMe, nao grupo
4. Se audio: baixa base64 → transcreve com Whisper
5. Salva mensagem em whatsapp_mensagens
6. Verifica ai_enabled na whatsapp_config
7. Carrega historico de ai_conversas (filtra tool_calls)
8. Envia "digitando..." via Evolution API
9. processarMensagem(): carrega estado, monta prompt, executa loop
10. Resposta enviada via Evolution API (POST /message/sendText/:instance)
11. Salva historico (user + assistant) limitado a 30 mensagens
```

---

## Configuracao

### Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|---|---|---|
| `OPENAI_API_KEY` | Sim | Chave da API OpenAI |
| `OPENAI_MODEL` | Nao | Modelo (padrao: `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | Nao | Provider alternativo (compativel OpenAI) |
| `EVOLUTION_API_URL` | Sim | URL da Evolution API |
| `EVOLUTION_API_KEY` | Sim | Chave da Evolution API |
| `SISTEMA_URL` | Sim | URL publica do sistema (para webhook) |

### Ativar na Barbearia

No painel -> **Configuracoes** -> **WhatsApp**:
1. Conecte o WhatsApp (escaneie QR Code)
2. Ative **"Agente IA"**
3. (Opcional) Prompt personalizado

---

## Debugging

### Logs do Deploy

```bash
npx railway logs                           # logs do servico atual
npx railway logs --lines 50                # ultimos 50 logs
npx railway logs --service evolution-api   # logs da Evolution API
npx railway logs --http --lines 30         # requisicoes HTTP
npx railway logs --http --path "/webhook"  # filtro por path
```

### Logs do Agente

O agente gera logs com emojis para facilitar o debug:

```
📩 [Evolution] Mensagem de 556799020392 (Joao): Quero agendar
🤖 ====== PROCESSAR MENSAGEM ======
✅ OpenAI cliente inicializado
🔧 listarServicos {}
🔧 definirServico {"servico":"1"}
✅ Servico definido: Corte Masculino
📤 ====== ENVIANDO VIA EVOLUTION ======
✅ Mensagem enviada com sucesso
```

### Erros Comuns

| Sintoma | Causa | Solucao |
|---|---|---|
| `invalid input syntax for type uuid` | Webhook URL com UUID truncado | Verificar SISTEMA_URL e webhook na Evolution API |
| `rate_limit_exceeded` | Muitas requisicoes (gpt-4o) | Usar `gpt-4o-mini` ou aumentar limite |
| `429` | Rate limit do modelo | Mudar `OPENAI_MODEL` no ambiente |
| Agente nao responde | Webhook apontando para outro servico | Verificar webhook na Evolution API |
| `Instance requires property "webhook"` | Formato errado ao atualizar webhook | Enviar `{ webhook: { url, ... } }` |

---

## Manutencao

### Adicionar Nova Tool

1. Adicione a definicao no array `tools` em `processarMensagem()` (ai.js ~linha 2390)
2. Implemente o handler no `switch` de `executarTool()` (ai.js ~linha 280)
3. Se aplicavel, adicione formatacao em `formatarDadosParaTool()` (ai.js ~linha 460)
4. Se for DATA_TOOL, adicione ao array `DATA_TOOLS`
5. Teste com `node --check server/services/ai.js`

### Modificar o System Prompt

Edite a funcao `montarSystemPrompt()` (ai.js ~linha 2092). O prompt e reconstruido a cada iteracao do loop com o estado atualizado.

### Testar Localmente

```bash
node --check server/services/ai.js
node --check server/services/workflow-state.js
node --check server/services/evolution-provider.js
```

---

## Variaveis de Ambiente (Producao)

Valores atuais (Railway):

```
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
EVOLUTION_API_URL=https://evolution-api-production-3124.up.railway.app
EVOLUTION_API_KEY=46C6FBDD-248C-4047-94D7-E8D813560935
SISTEMA_URL=https://agendapro-app-production.up.railway.app
```

---

**Ultima atualizacao:** Julho 2026  
**Versao:** 2.0 (Slot Filling + 20 Tools + Evolution API)
