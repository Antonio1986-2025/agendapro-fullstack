# 🎯 Agente IA - Orientado a Objetivo

Este documento descreve a nova arquitetura do agente de IA, agora **orientado a objetivo** ao invés de fluxo fixo.

---

## 🎯 Filosofia: Agente Orientado a Objetivo

### **❌ Antes (Fluxo Fixo):**
```
1. Cliente pergunta serviço → Lista serviços
2. Cliente escolhe → Pergunta data
3. Cliente escolhe data → Pergunta horário
4. Cliente escolhe horário → Confirma
```
Se cliente sair do fluxo, agente fica perdido.

### **✅ Agora (Orientado a Objetivo):**
```
🎯 OBJETIVO: Concluir agendamento completo e válido

Cliente pode:
- Sair do contexto (perguntar sobre preços, localização, etc.)
- Voltar
- Mudar de ideia
- Fazer pergunta solta

Agente sempre:
- Responde a pergunta naturalmente
- Volta ao objetivo de forma fluida
- Mantém contexto de tudo já coletado
```

---

## 📋 Dados Obrigatórios para Agendar

O agente DEVE coletar e validar TODOS os 6 dados antes de criar o agendamento:

| # | Dado | Como Coleta | Validação |
|---|------|-------------|-----------|
| 1 | **NOME COMPLETO** | Pergunta ao cliente | Mínimo nome + sobrenome |
| 2 | **TELEFONE** | Automático (do WhatsApp) | Já vem na mensagem |
| 3 | **SERVIÇO** | Cliente diz → Agente busca na base | Deve existir em `servicos` |
| 4 | **PROFISSIONAL** | Cliente escolhe da lista | Deve existir em `profissionais` |
| 5 | **PRA QUEM É** | Pergunta direta | Próprio cliente ou outra pessoa |
| 6 | **HORÁRIO** | Verifica disponibilidade real | Não pode estar ocupado |

---

## 🛠️ Ferramentas (Tools) Disponíveis

### **1. `listarServicos()`**
Lista TODOS os serviços ativos da barbearia.

```javascript
{
  servicos: [
    { id, nome, duracao_minutos, preco, categoria }
  ]
}
```

### **2. `buscarServicoPorNome(termo)`** 🆕
Busca serviços que correspondem a um termo. Útil quando cliente diz "corte" para listar opções.

```javascript
buscarServicoPorNome("corte")
// Retorna: Corte Masculino, Corte Feminino, etc.
```

```javascript
{
  termo_buscado: "corte",
  encontrados: 2,
  servicos: [...],
  unico_match: false  // se true, agente pode confirmar direto
}
```

### **3. `listarProfissionais()`**
Lista todos os barbeiros ativos.

### **4. `verificarDisponibilidade(data, profissional_id?)`**
Retorna horários LIVRES e OCUPADOS de uma data.

```javascript
{
  data: "2026-06-25",
  data_formatada: "quinta-feira, 25 de junho",
  eh_hoje: false,
  disponibilidade: [
    {
      profissional_id: "...",
      profissional_nome: "Carlos",
      horarios_livres: ["09:00", "09:30", "10:00", ...],
      horarios_ocupados: ["10:30", "14:00"],
      total_livres: 12
    }
  ]
}
```

### **5. `buscarCliente(telefone)`**
Verifica se cliente existe na base.

```javascript
{
  encontrado: true,
  cliente: { id, nome, telefone, total_visitas }
}
```

### **6. `cadastrarCliente(nome, telefone)`**
Cadastra novo cliente. Detecta se já existe.

```javascript
{
  ja_existia: false,
  cliente: { id, nome, telefone }
}
```

### **7. `criarAgendamento(...)`** ⭐
SÓ cria se TODOS dados estiverem validados.

```javascript
{
  sucesso: true,
  agendamento: {
    id, data_hora, cliente_nome, servico_nome,
    profissional_nome, preco, duracao_minutos, observacoes
  }
}
```

**Suporta `observacoes`** para registrar quando agendamento é para terceiro:
- "Agendado por João para o filho Pedro"

### **8. `listarAgendamentosCliente(telefone)`**
Lista agendamentos futuros do cliente.

### **9. `cancelarAgendamento(agendamento_id)`**
Cancela após confirmação.

### **10. `reagendarAgendamento(...)`**
Altera data/hora.

### **11. `consultarInformacoesBarbearia()`** 🆕
Retorna info da barbearia (endereço, horário, etc.) para perguntas tipo "onde fica?".

---

## 💬 Exemplo de Conversa Completa

### **Cenário 1: Cliente quer agendar para si mesmo**

```
Cliente: Oi, queria agendar
Agente: [buscarCliente] → identifica como João (cliente recorrente)
       Olá João! 👋 Que bom te ver de novo. 
       Qual serviço deseja agendar?

Cliente: corte
Agente: [buscarServicoPorNome("corte")] → encontra 3 opções
       Temos algumas opções de corte:
       1. Corte Masculino - R$ 35,00
       2. Corte Feminino - R$ 50,00
       3. Corte Infantil - R$ 25,00
       Qual deles?

Cliente: Espera, qual o horário de funcionamento?
Agente: [consultarInformacoesBarbearia]
       Funcionamos de segunda a sábado, 8h às 19h. ⏰
       Voltando ao agendamento, qual corte você prefere?

Cliente: o masculino
Agente: Perfeito! Corte Masculino, R$ 35.
       Com qual barbeiro? [listarProfissionais]
       - Carlos
       - Pedro
       - Roberto

Cliente: Carlos. Pra mim mesmo.
Agente: [verificarDisponibilidade("2026-06-25", carlos_id)]
       O agendamento é para você mesmo, certo? ✅
       Para qual dia gostaria? Tenho horários livres amanhã (25/06):
       9h, 9h30, 10h, 14h, 14h30...

Cliente: 14h
Agente: 📝 Confirmando seu agendamento:
       👤 Cliente: João Silva
       ✂️ Serviço: Corte Masculino - R$ 35,00
       💈 Profissional: Carlos
       📅 Data: amanhã, 25/06 (quinta-feira)
       🕐 Horário: 14:00
       
       Confirma? ✅

Cliente: pode ser
Agente: [criarAgendamento]
       ✅ Agendamento confirmado!
       Te esperamos amanhã às 14h. 😊
```

### **Cenário 2: Cliente agenda para o filho**

```
Cliente: Quero marcar pro meu filho
Agente: [buscarCliente] → identifica João
       Claro João! Vou agendar para seu filho.
       Qual o nome completo dele?

Cliente: Pedro Silva
Agente: Que serviço o Pedro vai fazer?

Cliente: corte infantil
Agente: [buscarServicoPorNome("corte infantil")]
       Corte Infantil - R$ 25,00 ✂️
       Com qual barbeiro?

Cliente: qualquer um
Agente: [listarProfissionais] [verificarDisponibilidade]
       Posso agendar com o Carlos (especialista em infantil).
       Tenho amanhã às 10h ou 15h. Qual prefere?

Cliente: 10h
Agente: 📝 Confirmando:
       👤 Cliente: Pedro Silva
       📍 Agendado por: João Silva
       ✂️ Serviço: Corte Infantil - R$ 25,00
       💈 Profissional: Carlos
       📅 Data: amanhã, 25/06
       🕐 Horário: 10:00
       
       Confirma? ✅

Cliente: sim
Agente: [cadastrarCliente("Pedro Silva", telefone_do_joao)]
       [criarAgendamento(cliente_id=pedro_id, observacoes="Agendado por João Silva")]
       
       ✅ Pronto!
       Pedro está agendado para amanhã às 10h com Carlos.
```

---

## 🧠 Como o Agente Pensa

O agente usa **OpenAI GPT-4o-mini** com Function Calling.

### **Loop de Iteração (até 5x):**

```
1. Recebe mensagem
2. LLM decide se precisa chamar ferramentas
3. Se sim → executa e adiciona resultado ao contexto
4. Se não → retorna resposta para o cliente
5. Repete até ter resposta final
```

Isso permite que o agente:
- Faça MÚLTIPLAS consultas em sequência (buscarCliente → listarServicos → verificarDisponibilidade)
- Use o resultado de uma para chamar outra
- Tudo em uma única interação com o cliente

---

## ⚙️ Configuração

### **Variáveis de Ambiente:**

```env
OPENAI_API_KEY=sk-proj-...
```

### **Customizar Prompt:**

Cada barbearia pode adicionar instruções extras no painel:

**Configurações → WhatsApp → Prompt do Agente IA**

Exemplo:
```
Atendemos com prioridade para clientes VIP.
Não fazemos agendamento aos domingos.
Aceitamos PIX, cartão e dinheiro.
```

O sistema combina seu prompt com o prompt base de objetivo.

---

## 📊 Vantagens vs Versão Anterior

| Aspecto | Antes | Agora |
|---------|-------|-------|
| **Contexto** | Fluxo fixo | Orientado a objetivo |
| **Sair do contexto** | Confunde | Responde e retoma |
| **Coleta de dados** | Pode esquecer | Lista 6 dados obrigatórios |
| **Validação** | Parcial | Cada dado é validado na base |
| **"Pra quem é"** | Não tinha | Suporta agendar para terceiro |
| **Sugestão de serviço** | Não tinha | `buscarServicoPorNome` |
| **Iterações** | 1 chamada de tools | Até 5 chamadas em sequência |
| **Telefone** | Manual | Automático do WhatsApp |
| **Info da barbearia** | Não consultava | `consultarInformacoesBarbearia` |

---

## 🐛 Debug

### **Ver logs no EasyPanel:**

```
🤖 ====== PROCESSANDO MENSAGEM ======
📍 Barbearia: NAVALHA
📞 Cliente: 5567998691910
💬 Mensagem: oi quero agendar
📚 Histórico: 4 mensagens

📤 Enviando para OpenAI...
🔄 Iteração 1/5
   🔧 1 tool(s)
🔧 Executando: buscarCliente
   ✅ Cliente: João Silva

🔄 Iteração 2/5
   ✅ Resposta final: Olá João! Que serviço deseja...
====================================
```

### **Identificar problemas:**

- **Agente inventa horário?** → Verifique se chamou `verificarDisponibilidade`
- **Agente não cadastra?** → Verifique se chamou `cadastrarCliente`
- **Agendamento sem validação?** → Verifique logs das tools

---

## 🚀 Roadmap (Futuras Melhorias)

- [ ] Suporte a áudio (transcrição via OpenAI)
- [ ] Suporte a imagem (cliente envia foto do corte desejado)
- [ ] Memória de longo prazo (preferências do cliente)
- [ ] Lembretes automáticos antes do agendamento
- [ ] Reconhecimento de intenção offline (rápido)
- [ ] Multi-idioma (inglês, espanhol)

---

**Versão:** 3.0 - Orientado a Objetivo  
**Data:** 22/06/2026  
**Status:** ✅ Em Produção
