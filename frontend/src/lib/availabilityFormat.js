// frontend/src/lib/availabilityFormat.js
const daysFull=['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
const pad=(n)=>String(n).padStart(2,'0');
const hm=(d)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dmy=(d)=>`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;

// Identifica repetição (mesmo dia+horário) como semanal
function keyFor(s, e) {
  const sd = new Date(s), ed = new Date(e);
  return `${sd.getDay()}-${hm(sd)}-${hm(ed)}`;
}

/**
 * Converte a lista crua em uma nova lista com `prettyLabel`:
 * - semanal (repetição): "Segunda-Feira 10:00 até 11:00"
 * - data específica:      "21-10-2025 10:00 até 11:00"
 */
export function prettifyAvailabilities(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  const counts = {};
  for (const av of arr) {
    const k = keyFor(av.startTime, av.endTime);
    counts[k] = (counts[k] || 0) + 1;
  }
  return arr.map(av => {
    const s = new Date(av.startTime);
    const e = new Date(av.endTime);
    const k = keyFor(av.startTime, av.endTime);
    const weekly = (counts[k] || 0) > 1;
    const label = weekly
      ? `${daysFull[s.getDay()]} ${hm(s)} até ${hm(e)}`
      : `${dmy(s)} ${hm(s)} até ${hm(e)}`;
    return { ...av, prettyLabel: label };
  });
}

// Alternativa simples para um item só:
export function formatDisponibilidade(av) {
  try {
    const s = new Date(av.startTime), e = new Date(av.endTime);
    return `${daysFull[s.getDay()]} ${hm(s)} até ${hm(e)}`;
  } catch {
    return String(av?.startTime||'') + ' até ' + String(av?.endTime||'');
  }
}