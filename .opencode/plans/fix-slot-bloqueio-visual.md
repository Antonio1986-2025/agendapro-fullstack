# Plano: Agendamento Ocupa Dois Horários com rowspan

## Problema
Um agendamento de 60min às 18:00 deveria ocupar visualmente as duas linhas (18:00 e 18:30) como um único bloco, mas atualmente renderiza como duas células separadas.

## Solução
Usar `rowspan` no `<td>` do agendamento para que ele se estenda verticalmente sobre as linhas seguintes. Na linha coberta pelo rowspan, não renderizar `<td>` para aquele profissional (a célula de cima já cobre).

## Arquivo a modificar
`public/agenda-mobile.html`

## Mudanças

### 1. Substituir `mapaBloqueio` por `rowspanMap` + `skipCells`

Na construção do mapa (linha ~360):

```javascript
const mapa = {};
const rowspanMap = {};   // { "JOAO": { "18:00": 2 } }
const skipCells = {};     // { "18:30+JOAO": true } — prof a pular nesta hora
ags.filter(a => a.status !== 'cancelado').forEach(a => {
  const h = formatarHora(a.data_hora);
  const pn = a.profissional_nome || 'Sem profissional';
  if (!mapa[pn]) mapa[pn] = {};
  mapa[pn][h] = a;
  const duracaoMin = a.duracao_minutos || 30;
  const slots = Math.ceil(duracaoMin / 30);
  if (slots > 1) {
    if (!rowspanMap[pn]) rowspanMap[pn] = {};
    rowspanMap[pn][h] = slots;
    for (let i = 1; i < slots; i++) {
      let [hh, mm] = h.split(':').map(Number);
      mm += 30 * i;
      while (mm >= 60) { mm -= 60; hh++; }
      const slotH = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      skipCells[`${slotH}+${pn}`] = true;
    }
  }
});
```

### 2. Modificar a renderização da tabela (linha ~390)

Trocar o loop `profissionais.forEach` para:

```javascript
profissionais.forEach(p => {
  if (skipCells[`${hora}+${p.nome}`]) return; // célula coberta por rowspan acima

  const ag = mapa[p.nome] && mapa[p.nome][hora];
  if (ag) {
    const cli = ag.cliente_nome || 'Cliente';
    const serv = ag.servico_nome || '';
    const rs = rowspanMap[p.nome]?.[hora] || 1;
    const spanAttr = rs > 1 ? ` rowspan="${rs}"` : '';
    const spanClass = rs > 1 ? ' cell-ag-span' : '';
    html += `<td${spanAttr} onclick="setStatus('${ag.id}','confirmado')"><div class="cell-ag${spanClass}"><span class="ag-cliente">${cli}</span>${serv ? `<span class="ag-servico">${serv}</span>` : ''}<span class="ag-preco">R$ ${Number(ag.preco||0).toFixed(2)}</span></div></td>`;
  } else {
    html += `<td onclick="abrirModal()"><span class="cell-livre">+ LIVRE</span></td>`;
  }
});
```

### 3. Adicionar CSS para célula com rowspan (linha ~82)

Após `.cell-ag`:
```css
.cell-ag-span { height: 100%; min-height: 100px; background: var(--primary-light); border-left: 3px solid var(--primary-600); }
```

### 4. Remover CSS `.cell-cont` (linha ~81)

Remover a classe `.cell-cont` que não será mais usada.

## Resultado Esperado
- 18:00 com Corte + Barba (60min) → um único bloco colorido que se estende de 18:00 até 18:30
- 18:30 não aparece como célula separada para esse profissional
- Serviços de 30min continuam normais (1 célula)
