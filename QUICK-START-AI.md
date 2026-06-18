# 🚀 Quick Start - Agente IA

## ⚡ Ativação Rápida (5 minutos)

### **Passo 1: Configurar OpenAI** ✅
Já está configurado no `.env`:
```env
OPENAI_API_KEY=sk-proj-...
```

### **Passo 2: Iniciar o Servidor**
```bash
npm start
```

### **Passo 3: Testar o Agente**
```bash
node test-ai.js
```

### **Passo 4: Conectar WhatsApp**

1. Acesse: `http://localhost:3000`
2. Faça login com suas credenciais
3. Vá em **Configurações** → **WhatsApp**
4. Clique em **Conectar WhatsApp**
5. Escaneie o QR Code com seu celular
6. Aguarde a mensagem "✅ WhatsApp conectado"

### **Passo 5: Ativar o Agente IA**

Na mesma tela:
1. Marque **"Agente IA Ativado"**
2. (Opcional) Personalize o prompt
3. Clique em **Salvar**

---

## 🧪 Testar com Cliente Real

Envie mensagem pelo WhatsApp para o número conectado:

```
Você: Olá!

Bot: Olá! Sou o assistente virtual da [Sua Barbearia]. 
     Como posso ajudar você hoje? 😊

Você: Quero agendar um corte

Bot: Ótimo! Para qual data você gostaria de agendar?

Você: Amanhã às 14h

Bot: [Verifica disponibilidade e cria agendamento]
     ✅ Agendamento confirmado! ...
```

---

## ✅ Checklist de Funcionamento

- [ ] Servidor rodando sem erros
- [ ] WhatsApp conectado (status "connected")
- [ ] Agente IA ativado nas configurações
- [ ] Teste com `node test-ai.js` passou
- [ ] Profissionais cadastrados
- [ ] Serviços cadastrados
- [ ] Cliente consegue conversar com o bot

---

## 🐛 Problemas Comuns

### **Bot não responde**
- Verifique se "Agente IA" está ativado
- Veja os logs do servidor: `npm start`
- Verifique se a chave OpenAI é válida

### **Erro "OPENAI_API_KEY não encontrada"**
- Reinicie o servidor: `Ctrl+C` e `npm start`
- Verifique o arquivo `.env`

### **WhatsApp desconecta sozinho**
- Normal após reiniciar o servidor
- Reconecta automaticamente
- Se não reconectar, escaneie o QR novamente

---

## 📞 Suporte

Se tiver problemas:
1. Veja os logs: `npm start` (terminal)
2. Teste isolado: `node test-ai.js`
3. Leia: `AGENTE-IA.md` (documentação completa)

---

**Pronto! Seu agente IA está funcionando! 🎉**
