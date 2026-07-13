// ============================================================================
// Domínio — regras PURAS do Controle de Pausas (sem view, sem estado global).
// Portado 1:1 da antiga classe DataCosmos. As funções que dependem do "agora"
// recebem `now` (ms) e, quando relevante, `phase` (rodízio de sábado) e
// `endedToday` (Set de pausas encerradas cedo) como parâmetros — nada de estado
// implícito. Isso mantém o núcleo testável e desacoplado da UI.
// ============================================================================

export const PALETTE = ['#4f8ef7', '#2fbf71', '#f5c542', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c', '#60a5fa', '#34d399', '#e879f9'];

// ---- Tempo ----
export function hhmmToMin(t) { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
export function addMin(hhmm, mins) {
  let t = hhmmToMin(hhmm) + mins;
  t = ((t % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
export function nowMin(now) { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); }
export function fmt(secs) { secs = Math.max(0, secs); const m = Math.floor(secs / 60); const s = secs % 60; return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); }
export function hhmmss(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
export function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// ---- Nomes ----
export function initials(n) { const p = String(n).trim().split(/\s+/); return (p.length > 1 ? (p[0][0] + p[p.length - 1][0]) : String(n).slice(0, 2)).toUpperCase(); }
export function titleName(n) { return String(n).toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase()); }

// ---- Turno / categorias de pausa ----
export function turnoInfo(turno) {
  const map = {
    integral: { label: 'Integral', color: '#22d3ee', sabado: false },
    manha: { label: 'Manhã', color: '#f5c542', sabado: true },
    tarde: { label: 'Tarde', color: '#a78bfa', sabado: true },
  };
  return map[turno] || map.manha;
}
// Cor por categoria: Pausa 10 = âmbar, Pausa 30 = violeta, Pausa 60 = azul.
export function catColor(type) { return type === '60' ? '#60a5fa' : (type === '30' ? '#a78bfa' : '#f5c542'); }
// Categorias: duração fixa por tipo (10/30/60). Retorno = início + duração.
export function mkBreak(type, start) {
  const mins = type === '60' ? 60 : (type === '30' ? 30 : 10);
  return { type, start, mins, label: 'Pausa ' + type, end: addMin(start, mins) };
}

// ---- Rodízio de sábado ----
// Equipes alternam a cada semana a partir de um sábado de referência.
// Ref: 2026-07-11 (sábado) = equipe da manhã. `phase` (0/1) inverte a ordem.
export function saturdayTeam(dateMs, phase = 0) {
  const ref = new Date(2026, 6, 11).getTime();
  const x = new Date(dateMs);
  x.setDate(x.getDate() + (6 - x.getDay())); // sábado daquela semana
  x.setHours(0, 0, 0, 0);
  const weeks = Math.round((x.getTime() - ref) / (7 * 86400000));
  return ((((weeks + phase) % 2) + 2) % 2 === 0) ? 'manha' : 'tarde';
}
export function saturdayOfWeek(dateMs) { const x = new Date(dateMs); x.setDate(x.getDate() + (6 - x.getDay())); x.setHours(0, 0, 0, 0); return x; }

// ---- Status DERIVADO do relógio ----
export function isOnShift(e, now, phase = 0) {
  const d = new Date(now);
  const dow = d.getDay(); // 0=dom..6=sáb
  if (dow === 0) return false; // domingo: ninguém
  const nm = d.getHours() * 60 + d.getMinutes();
  let schedule;
  if (dow === 6) {
    if (!turnoInfo(e.turno).sabado) return false; // integral: sem sábado
    if (saturdayTeam(now, phase) !== e.turno) return false; // não é o sábado dessa equipe
    schedule = e.jornadaSab;
  } else {
    schedule = e.jornada;
  }
  if (!schedule) return false;
  return nm >= hhmmToMin(schedule.inicio) && nm < hhmmToMin(schedule.fim);
}
// Pausa AGENDADA ativa agora (janela [start,end) contém o minuto atual), ou null.
// Respeita encerramento antecipado (endedToday: Set de chaves `dia|id|start`).
export function scheduledBreakNow(e, now, phase = 0, endedToday = null) {
  if (e.isTest || !e.breaks || !e.breaks.length || !isOnShift(e, now, phase)) return null;
  const nm = nowMin(now);
  const day = dayKey(now);
  for (const b of e.breaks) {
    const sm = hhmmToMin(b.start), em = hhmmToMin(b.end);
    if (nm >= sm && nm < em && !(endedToday && endedToday.has(day + '|' + e.id + '|' + b.start))) {
      const d = new Date(now); d.setHours(Math.floor(em / 60), em % 60, 0, 0);
      return { label: b.label, type: b.type, mins: b.mins, start: b.start, endsAt: d.getTime() };
    }
  }
  return null;
}
// Pausa ativa: manual/teste (status gravado) OU agendada (derivada do relógio).
export function activeBreak(e, now, phase = 0, endedToday = null) {
  if (e.status === 'pause' && e.pauseEndsAt && e.pauseEndsAt > now) {
    return { label: e.pauseLabel, type: e.pauseType, mins: Math.round((e.pauseTotal || 0) / 60), endsAt: e.pauseEndsAt, manual: true };
  }
  return scheduledBreakNow(e, now, phase, endedToday);
}
// 'off' (fora da jornada) vence; senão pausa (agendada/manual); senão 'working'.
export function computeStatus(e, now, phase = 0, endedToday = null) {
  if (e.isTest) return activeBreak(e, now, phase, endedToday) ? 'pause' : 'working';
  if (!isOnShift(e, now, phase)) return 'off';
  return activeBreak(e, now, phase, endedToday) ? 'pause' : 'working';
}
// Próxima pausa agendada (para exibição). Fallback: a primeira do dia.
export function nextBreak(e, now) {
  if (!e.breaks || !e.breaks.length) return null;
  const nm = nowMin(now);
  const up = e.breaks.filter(b => hhmmToMin(b.start) > nm);
  return up.length ? up[0] : e.breaks[0];
}

// ---- Presets de cadastro (preenche jornada + pausas por turno/equipe) ----
export function shiftPresets() {
  return {
    integral: [
      { label: 'Integral · 08:00–17:02 (pausas 10/60/10)', jornada: { inicio: '08:00', fim: '17:02' }, jornadaSab: null, breaks: [{ type: '10', start: '10:00' }, { type: '60', start: '12:00' }, { type: '10', start: '15:00' }] },
    ],
    manha: [
      { label: 'Equipe 1 · 08:00–14:20 (sáb 08:00–14:20)', jornada: { inicio: '08:00', fim: '14:20' }, jornadaSab: { inicio: '08:00', fim: '14:20' }, breaks: [{ type: '10', start: '10:00' }, { type: '30', start: '12:00' }] },
      { label: 'Equipe 2 · 09:00–15:20 (sáb 09:00–15:20)', jornada: { inicio: '09:00', fim: '15:20' }, jornadaSab: { inicio: '09:00', fim: '15:20' }, breaks: [{ type: '10', start: '11:00' }, { type: '30', start: '13:00' }] },
      { label: 'Equipe 3 · 10:00–16:20 (sáb 09:00–15:20)', jornada: { inicio: '10:00', fim: '16:20' }, jornadaSab: { inicio: '09:00', fim: '15:20' }, breaks: [{ type: '10', start: '12:00' }, { type: '30', start: '14:00' }] },
    ],
    tarde: [
      { label: 'Tarde · 14:20–20:40 (sáb 08:00–14:20)', jornada: { inicio: '14:20', fim: '20:40' }, jornadaSab: { inicio: '08:00', fim: '14:20' }, breaks: [{ type: '10', start: '16:20' }, { type: '30', start: '18:30' }] },
      { label: 'Tarde · 14:20–20:40 (sáb 09:00–15:20)', jornada: { inicio: '14:20', fim: '20:40' }, jornadaSab: { inicio: '09:00', fim: '15:20' }, breaks: [{ type: '10', start: '16:20' }, { type: '30', start: '18:30' }] },
    ],
  };
}

// ---- Importação de Excel (linhas -> operadores) ----
export function operatorsFromImport(rows) {
  return rows.map((r, i) => {
    const turno = r.turno === 'integral' ? 'integral' : (r.turno === 'tarde' ? 'tarde' : 'manha');
    const breaks = [];
    if (r.p10a) breaks.push(mkBreak('10', r.p10a));
    if (r.p30) breaks.push(mkBreak('30', r.p30));
    if (r.p60) breaks.push(mkBreak('60', r.p60));
    if (r.p10b) breaks.push(mkBreak('10', r.p10b));
    breaks.sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
    const jornada = { inicio: r.entrada || '08:00', fim: r.saida || '17:00' };
    const jornadaSab = turno === 'integral'
      ? null
      : ((r.sabEntrada && r.sabSaida) ? { inicio: r.sabEntrada, fim: r.sabSaida } : { inicio: jornada.inicio, fim: jornada.fim });
    return {
      id: Date.now() + i, name: titleName(r.operador), turno, jornada, jornadaSab, breaks,
      status: 'working', color: PALETTE[i % PALETTE.length],
      pauseType: null, pauseLabel: null, pauseTotal: null, pauseEndsAt: null,
    };
  });
}

// ---- Dados reais (pausa_example.xlsx) + amostras integral ----
export function buildEmployees() {
  // [nome, turno, PAUSA 10, PAUSA 30, PAUSA 10] — horários de INÍCIO.
  const raw = [
    ['Ronan', 'MANHA', '09:00', '10:30', ''],
    ['Vanderlei', 'MANHA', '09:00', '10:30', ''],
    ['Gabriele', 'MANHA', '09:15', '11:05', ''],
    ['Lucca', 'MANHA', '09:15', '11:05', ''],
    ['Vitor', 'MANHA', '09:15', '11:05', ''],
    ['Jhuan', 'MANHA', '09:30', '11:40', ''],
    ['Miriam', 'MANHA', '09:30', '11:40', ''],
    ['Thais', 'MANHA', '09:30', '11:40', ''],
    ['Yasmin', 'MANHA', '09:30', '11:40', ''],
    ['Adriano', 'MANHA', '09:45', '12:15', ''],
    ['Stefani', 'MANHA', '10:00', '12:00', '14:30'],
    ['Thalia', 'MANHA', '10:00', '12:50', ''],
    ['Isadora', 'MANHA', '10:00', '12:50', ''],
    ['Giovani', 'TARDE', '15:20', '16:50', ''],
    ['Karolini', 'TARDE', '15:20', '16:50', ''],
    ['Stefani', 'TARDE', '15:20', '16:50', ''],
    ['Danielly', 'TARDE', '15:35', '17:25', ''],
    ['Enzo', 'TARDE', '15:35', '17:25', ''],
    ['Jeniffer', 'TARDE', '15:35', '17:25', ''],
    ['Ana', 'TARDE', '15:50', '18:00', ''],
    ['Jose', 'TARDE', '15:50', '18:00', ''],
    ['Kamila', 'TARDE', '15:50', '18:00', ''],
    ['Ana', 'TARDE', '16:05', '18:35', ''],
    ['Giovana', 'TARDE', '16:05', '18:35', ''],
    ['Matheus', 'TARDE', '16:05', '18:35', ''],
    ['Luiz', 'TARDE', '16:05', '19:10', ''],
    ['Isael', 'TARDE', '16:20', '19:10', ''],
    ['Jose', 'TARDE', '16:20', '19:10', ''],
    ['Luiz', 'TARDE', '16:20', '19:10', ''],
    ['Thamires', 'TARDE', '16:20', '19:10', ''],
  ];
  const list = raw.map((r, i) => {
    const [name, turnoX, p10a, p30, p10b] = r;
    const turno = turnoX === 'TARDE' ? 'tarde' : 'manha';
    const breaks = [];
    if (p10a) breaks.push(mkBreak('10', p10a));
    if (p30) breaks.push(mkBreak('30', p30));
    if (p10b) breaks.push(mkBreak('10', p10b));
    breaks.sort((a, b) => hhmmToMin(a.start) - hhmmToMin(b.start));
    let jornada, jornadaSab;
    if (turno === 'manha') {
      const f = breaks.length ? hhmmToMin(breaks[0].start) : 540;
      const inicio = f < 585 ? '08:00' : (f < 615 ? '09:00' : '10:00');
      const fim = addMin(inicio, 380);
      jornada = { inicio, fim };
      jornadaSab = inicio === '10:00' ? { inicio: '09:00', fim: '15:20' } : { inicio, fim };
    } else {
      jornada = { inicio: '14:20', fim: '20:40' };
      jornadaSab = { inicio: '08:00', fim: '14:20' };
    }
    return {
      id: i + 1, name, turno, jornada, jornadaSab, breaks,
      status: 'working', color: PALETTE[i % PALETTE.length],
      pauseType: null, pauseLabel: null, pauseTotal: null, pauseEndsAt: null,
    };
  });
  // Amostras INTEGRAL: seg–sex 08:00–17:02, sem sábado, pausas 10/60/10.
  const integralSeed = [
    ['Wesley', '10:00', '12:00', '15:00'],
    ['Larissa', '10:20', '12:20', '15:20'],
    ['Marcos', '10:40', '12:40', '15:40'],
    ['Camila', '11:00', '13:00', '16:00'],
  ];
  integralSeed.forEach((r, k) => {
    const [name, b10a, b60, b10b] = r;
    const breaks = [mkBreak('10', b10a), mkBreak('60', b60), mkBreak('10', b10b)];
    list.push({
      id: 100 + k, name, turno: 'integral',
      jornada: { inicio: '08:00', fim: '17:02' }, jornadaSab: null, breaks,
      status: 'working', color: PALETTE[(list.length + k) % PALETTE.length],
      pauseType: null, pauseLabel: null, pauseTotal: null, pauseEndsAt: null,
    });
  });
  return list;
}
