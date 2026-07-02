/**
 * ============================================================
 * MESSAGE QUEUE - Serialização por telefone
 * ============================================================
 *
 * Problema que resolve:
 * Quando um cliente manda 2+ mensagens em sequência rápida no
 * WhatsApp (ex: "oi" + "quero cortar cabelo"), o Baileys/Evolution
 * dispara múltiplos eventos "messages.upsert" quase simultâneos.
 * Como o handler é async e não é aguardado pelo emissor, os
 * processamentos rodam em PARALELO: ambos carregam o mesmo estado
 * do banco antes que o primeiro termine de salvar, e o segundo
 * sobrescreve o que o primeiro gravou (lost update). Isso causa
 * "perda de contexto" e agendamentos que nunca fecham o checklist.
 *
 * Solução: uma fila em memória por chave (telefone). Mensagens do
 * MESMO cliente são processadas uma de cada vez, em ordem. Clientes
 * diferentes continuam sendo processados em paralelo entre si.
 *
 * Nota: fila em memória é suficiente pra um único processo Node.
 * Se um dia rodar múltiplas réplicas/instâncias do server atrás de
 * um load balancer, isso precisa virar um lock distribuído (ex:
 * advisory lock do Postgres ou Redis) — mas pra deploy single-instance
 * (EasyPanel/Docker padrão) isso resolve o problema.
 */

const filas = new Map();

export function enfileirar(chave, tarefa) {
  const anterior = filas.get(chave) || Promise.resolve();

  const atual = anterior
    .catch(() => {})
    .then(() => tarefa())
    .catch((err) => {
      console.error(`[message-queue] Erro processando fila "${chave}":`, err.message);
    });

  filas.set(chave, atual);

  atual.finally(() => {
    if (filas.get(chave) === atual) {
      filas.delete(chave);
    }
  });

  return atual;
}

export function filasAtivas() {
  return filas.size;
}
