# 🎯 Agente IA v4.0 - Slot Filling Pattern

Sistema de agente conversacional **à prova de erros** baseado em **Slot Filling Pattern**.

## 🏗️ Arquitetura

### **Princípios:**
1. **Workflow State ≠ Session State** (separados)
2. **State Persistence** (postgres - sobrevive a restart)
3. **Slot Filling** (cada dado em um "slot" com validação)
4. **Idempotência** (não duplica agendamentos)
5. **Reset automático** após sucesso

### **Inspirado em:**
- Google Dialogflow CX (Slot Filling)
- LangGraph (state persistence)
- OpenAI Cookbook (function calling)
- LedgerAgent paper (idempotência)

---

## 📋 Estado da Conversa

Persistido em `ai_conversas.contexto` (JSONB):

```json
{
  "fluxo_ativo": "agendamento",
  "iniciado_em": "2026-06-22T17:00:00Z",
  
  "slots": {
    "cliente":      { "preenchido": true, "valor": { "id", "nome" } },
    "servico":      { "preenchido": true, "valor": { "id", "nome", "preco", "duracao" } },
    "profissional": { "preenchido": true, "valor": { "id", "nome" } },
    "para_quem":    { "preenchido": true, "valor": { "tipo", "cliente_alvo_id", "nome_pessoa?" } },
    "data":         { "preenchido": false, "valor": null },
    "horario":      { "preenchido": false, "valor": null }
  },
  
  "agendamento_criado_id": null,
  "agendamento_criado_em": null,
  
  "ultima_atualizacao": "2026-06-22T17:05:00Z"
}
```

---

## 🛠️ Tools Disponíveis

### **Fluxo de Agendamento:**
| Tool | Função |
|------|--------|
| `iniciarAgendamento()` | Inicia fluxo + identifica cliente |
| `definirServico(servico)` | Valida e preenche slot |
| `definirProfissional(profissional)` | Valida e preenche slot |
| `definirParaQuem(tipo, nome?)` | Marca para quem é |
| `definirData(data)` | Parse natural + valida |
| `definirHorario(horario)` | Verifica disponibilidade real |
| `finalizarAgendamento()` | 🔒 Cria agendamento (só se 100% completo) |
| `cancelarFluxoAtual()` | Cancela fluxo em andamento |

### **Queries (não modificam estado):**
| Tool | Função |
|------|--------|
| `listarServicos()` | Lista serviços ativos |
| `listarProfissionais()` | Lista profissionais ativos |
| `consultarHorariosLivres(data, prof?)` | Horários disponíveis |
| `consultarInfoBarbearia()` | Endereço, horário, contato |

### **Outros Fluxos:**
| Tool | Função |
|------|--------|
| `listarMeusAgendamentos()` | Agendamentos futuros do cliente |
| `cancelarAgendamentoExistente(id)` | Cancela um agendamento |

**Total: 14 tools**

---

## 🎬 Fluxo Visual

```
Cliente: "Quero corte"
         ↓
  iniciarAgendamento ──── identifica cliente automaticamente
         ↓
  📋 ESTADO: { cliente: ✅, demais: ❌ }
         ↓
  Sistema mostra próximo slot: SERVIÇO
         ↓
  listarServicos → Cliente escolhe
         ↓
  definirServico("Corte e Barba") ──── valida na base
         ↓
  📋 ESTADO: { cliente: ✅, servico: ✅, demais: ❌ }
         ↓
  ... (continua até completar) ...
         ↓
  📋 ESTADO: TODOS ✅
         ↓
  Cliente confirma "sim"
         ↓
  finalizarAgendamento ──── verifica 100% completo
         ↓
  ✅ Cria agendamento + comanda
  ✅ Notifica barbeiro
  ✅ RESETA estado
  ✅ Salva agendamento_criado_id (idempotência 5min)
         ↓
  Cliente recebe confirmação
```

---

## 🛡️ Garantias

### **1. À prova de alucinação**
Estado é JSON estruturado salvo no banco. LLM não inventa dados — só preenche slots via tools validadas.

### **2. À prova de duplicação**
`agendamento_criado_id` salvo após criar. Se cliente disser "sim" duas vezes, retorna o agendamento existente.

### **3. À prova de fluxo quebrado**
- Se servidor cair: estado já está em postgres
- Se cliente sumir e voltar: retoma de onde parou
- Se LLM passar UUID errado: tool valida e retorna erro claro

### **4. À prova de incompleto**
`finalizarAgendamento` SÓ funciona se todos os 6 slots estiverem ✅.

### **5. À prova de mudança de ideia**
Tools `definir*` sobrescrevem slots. Cliente pode mudar serviço, profissional, data ou horário a qualquer momento.

### **6. À prova de desistência**
`cancelarFluxoAtual` reseta tudo limpamente.

---

## 🎯 System Prompt Dinâmico

A cada turno, o prompt inclui o estado atual:

```
[SLOT-FILLING v4.0] Você é o atendente virtual da barbearia "X".

📋 CHECKLIST:
✅ Cliente: Caio Eduardo (id: ...)
✅ Serviço: Corte e Barba - R$90 (60min)
❌ Profissional: ainda não escolhido
❌ Para quem: ainda não definido
❌ Data: ainda não escolhida
❌ Horário: ainda não escolhido

🎯 PRÓXIMO PASSO: Liste os profissionais (listarProfissionais) e pergunte qual o cliente prefere.
```

Assim o LLM **sempre** sabe onde está, sem depender de histórico.

---

## 🔄 Reset Automático

Após `finalizarAgendamento` retornar sucesso:
- ✅ Todos os slots voltam para `preenchido: false`
- ✅ `fluxo_ativo` volta para `null`
- ✅ `agendamento_criado_id` é mantido por 5 minutos (idempotência)

Próxima conversa começa do zero, mas:
- Cliente repetir "sim" → detecta `agendamento_criado_id` recente → retorna o mesmo agendamento (não duplica)

---

## 📊 Histórico Curto

Como o estado já carrega o contexto, não precisamos de muito histórico:
- Antes: 30 mensagens (poluído)
- Agora: 8 mensagens (suficiente)

Resultado: **Menos tokens gastos + Sem confusão por histórico antigo.**

---

## 🧪 Cenários de Teste

### **Cenário 1: Agendamento simples**
```
Cliente: oi
Agente: Olá! Como posso ajudar?

Cliente: quero corte
[iniciarAgendamento → cliente identificado]
Agente: Temos: 1. Corte Masculino...

Cliente: 1
[definirServico("1")]
Agente: Com qual barbeiro?

Cliente: Joao
[definirProfissional("Joao")]
Agente: É para você?

Cliente: sim
[definirParaQuem("proprio_cliente")]
Agente: Qual data?

Cliente: amanhã
[definirData("amanhã")]
Agente: Qual horário?

Cliente: 14h
[definirHorario("14h") → verifica → disponível]
Agente: Resumo: ... Confirma?

Cliente: sim
[finalizarAgendamento → cria → reseta]
Agente: ✅ Agendamento confirmado!
```

### **Cenário 2: Mudança de ideia**
```
Cliente: quero corte e barba
[iniciarAgendamento + definirServico("corte e barba")]

Cliente: na verdade, só corte
[definirServico("corte") → sobrescreve]
Agente: Ok, mudei para Corte. Continuamos?
```

### **Cenário 3: Duplicação evitada**
```
Cliente: sim (confirma)
[finalizarAgendamento → cria → reseta]
Agente: ✅ Confirmado!

Cliente: sim (de novo)
[sem fluxo ativo, mas tem agendamento_criado_id recente]
Agente: Seu agendamento já está confirmado! Posso ajudar com mais algo?
```

### **Cenário 4: Pergunta fora do contexto**
```
[Estado: serviço ✅, profissional ❌]

Cliente: vocês ficam onde?
[consultarInfoBarbearia]
Agente: Estamos em [endereço]. Voltando: qual barbeiro você prefere?
```

### **Cenário 5: Horário ocupado**
```
Cliente: 15h
[definirHorario("15h") → verifica → ocupado]
Agente: 15h está ocupado. Tenho 14h, 14:30 ou 16h. Qual?
```

---

## 🔧 Manutenção

### **Limpar estado de um cliente:**
```javascript
fetch('/api/whatsapp/limpar-conversas', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ telefone: '5567...' })
})
```

### **Verificar estado atual:**
Consulta SQL:
```sql
SELECT contexto FROM ai_conversas 
WHERE barbearia_id = '...' AND cliente_telefone = '...';
```

### **Logs no servidor:**
```
🤖 PROCESSAR MENSAGEM
📋 Fluxo: agendamento
📋 Próximo slot: profissional
🔧 listarProfissionais
   ✅ 4 profissionais
🔧 definirProfissional {"profissional":"Joao"}
   ✅ Profissional definido: Joao
✅ Resposta: Perfeito! Vou agendar com Joao...
```

---

## 📈 Comparação vs versão anterior

| Aspecto | v3.x (histórico) | v4.0 (slot filling) |
|---------|------------------|---------------------|
| Armazena estado | Histórico de mensagens | JSON estruturado em DB |
| À prova de erros | 🟡 Depende do modelo | ✅ Garantido |
| Recuperação | 🔴 Difícil | ✅ Natural |
| Validação | 🟡 Parcial | ✅ Em cada slot |
| Duplicação | 🔴 Possível | ✅ Impossível |
| Custo tokens | Maior | Menor |
| Manutenção | Difícil | Fácil |
| Debug | Confuso | Claro (estado é JSON) |

---

## 🚀 Próximos Passos Possíveis

1. **Suporte a reagendamento** (fluxo similar)
2. **Detecção de intenção** (cancelar vs agendar vs perguntar)
3. **Memória de longo prazo** (preferências do cliente)
4. **Slots adicionais** (forma de pagamento, observações)
5. **A/B testing** de prompts

---

**Versão:** 4.0  
**Padrão:** Slot Filling  
**Status:** ✅ Em produção
