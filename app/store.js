// ============================================================================
// Store — estado da aplicação + ações + loop de relógio + notificações.
// O status é DERIVADO do relógio (domain.js); aqui só guardamos dados e disparamos
// notificações nas viradas de minuto. Sem framework: um pub/sub simples.
// ============================================================================
import * as D from './domain.js';

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// reason: 'change' (re-render completo) ou 'tick' (só atualizar cronômetros no lugar).
export function emit(reason = 'change') { for (const fn of listeners) fn(reason); }

const emptyForm = () => ({ editId: null, nome: '', turno: 'manha', presetIndex: 0, jornadaInicio: '08:00', jornadaFim: '14:20', sabInicio: '08:00', sabFim: '14:20', breaks: [], newType: '10', newStart: '' });

export const state = {
  screen: 'trab',
  collapsed: false,
  search: '',
  sortDir: 'asc',
  now: Date.now(),
  saturdayPhase: 0,
  employees: [], // carregado do arquivo (appData); build de produção nasce vazio
  cadastro: null,        // form em edição/criação (ou null = fechado)
  breaksModal: null,     // { id }
  confirm: null,         // { id, action: 'start'|'finish'|'delete', name, label }
  betaOpen: false,
  saturdayModal: false,
  freeTest: false,       // habilitado por env (electronAPI.freeTestMode)
  freeTestOpen: false,
  freeForm: { name: 'Teste de notificação', targetTime: '' },
  histSearch: '',
  histPeriod: '7',
  history: [], // carregado do arquivo local protegido (appData) por initHistory()
  toasts: [],
  _endedToday: new Set(),
};

// Persiste o histórico num arquivo local protegido em appData (userData),
// lido/escrito só pelo app via processo principal (IPC).
function saveHistory() { try { if (window.electronAPI && window.electronAPI.historySave) window.electronAPI.historySave(state.history); } catch (e) {} }
async function initHistory() {
  try {
    if (window.electronAPI && window.electronAPI.historyLoad) {
      const h = await window.electronAPI.historyLoad();
      if (Array.isArray(h)) state.history = h;
    }
  } catch (e) {}
  emit();
}

// Operadores: persistidos em arquivo local (appData). Nunca salva os de teste.
function saveOperators() { try { if (window.electronAPI && window.electronAPI.operatorsSave) window.electronAPI.operatorsSave(state.employees.filter(e => !e.isTest)); } catch (e) {} }
async function initOperators() {
  let ops = [];
  try { if (window.electronAPI && window.electronAPI.operatorsLoad) { const d = await window.electronAPI.operatorsLoad(); if (Array.isArray(d)) ops = d; } } catch (e) {}
  if (ops.length) state.employees = ops;
  else if (window.electronAPI && window.electronAPI.freeTestMode) state.employees = D.buildEmployees(); // seed de amostra só em modo dev/teste
  else state.employees = []; // build de produção: começa sem operadores
  emit();
}
// Grava a pausa CONCLUÍDA agora (evento real). O histórico só cresce a partir
// do momento em que o app está rodando e observa a pausa terminar — nada de
// fabricar o passado a partir da escala.
function recordHistory(e, b, now) {
  state.history = [{ name: e.name, color: e.color, type: b.type, start: b.start, end: b.end, mins: b.mins, ts: now, dayStr: D.dayKey(now) }, ...state.history].slice(0, 1000);
  saveHistory();
}

let _notified = new Set(), _notifiedDay = null, _prevMin = null, _testSeq = 0, _toastId = 1;

export function set(patch) { Object.assign(state, patch); emit(); }

export function notify(kind, title, msg) {
  if (window.electronAPI && window.electronAPI.notify) { try { window.electronAPI.notify(title, msg, kind); } catch (e) {} return; }
  const id = _toastId++;
  state.toasts = [...state.toasts, { id, kind, title, msg }]; emit();
  setTimeout(() => { state.toasts = state.toasts.filter(t => t.id !== id); emit(); }, 4200);
}

// ---- Loop de relógio (1s): status derivado + notificações nas viradas ----
export function startClock() {
  if (window.electronAPI && window.electronAPI.freeTestMode) state.freeTest = true;
  initOperators(); // carrega os operadores do arquivo (appData); produção começa vazio
  initHistory();   // carrega o histórico do arquivo (appData)

  setInterval(() => {
    const now = Date.now();
    const d = new Date(now);
    const curMin = d.getHours() * 60 + d.getMinutes();
    const dayStr = D.dayKey(now);
    if (_notifiedDay !== dayStr) { _notifiedDay = dayStr; _notified = new Set(); state._endedToday = new Set(); }
    const minuteChanged = _prevMin != null && curMin !== _prevMin;
    const notifs = [];
    let changed = false;
    const employees = [];
    for (const e of state.employees) {
      if (e.status === 'pause' && e.pauseEndsAt && e.pauseEndsAt <= now) {
        notifs.push({ kind: 'end', name: e.name, isTest: !!e.isTest });
        changed = true;
        if (e.isTest) continue;
        employees.push({ ...e, status: 'working', pauseType: null, pauseLabel: null, pauseEndsAt: null, pauseTotal: null });
        continue;
      }
      employees.push(e);
      if (minuteChanged && !e.isTest && e.breaks && e.breaks.length && D.isOnShift(e, now, state.saturdayPhase)) {
        for (const b of e.breaks) {
          const sm = D.hhmmToMin(b.start), em = D.hhmmToMin(b.end);
          const bkey = dayStr + '|' + e.id + '|' + b.start;
          if (state._endedToday.has(bkey)) continue;
          if (sm > _prevMin && sm <= curMin && !_notified.has('s|' + bkey)) { _notified.add('s|' + bkey); notifs.push({ kind: 'bstart', name: e.name, label: b.label, start: b.start, mins: b.mins }); }
          if (em > _prevMin && em <= curMin && !_notified.has('e|' + bkey)) { _notified.add('e|' + bkey); notifs.push({ kind: 'bend', name: e.name }); recordHistory(e, b, now); }
        }
      }
    }
    if (_prevMin == null || minuteChanged) _prevMin = curMin;
    if (changed) state.employees = employees;
    state.now = now;
    // Estrutural só quando alguém muda de status (fim de pausa) ou vira o minuto
    // (transições agendadas). Nos demais segundos, 'tick' = só cronômetros.
    emit((changed || minuteChanged) ? 'change' : 'tick');
    notifs.forEach(n => {
      if (n.kind === 'end') notify('ok', n.isTest ? 'Teste concluído' : 'Pausa concluída', n.isTest ? (n.name + ' — notificação disparada no horário') : (n.name + ' voltou a trabalhar'));
      else if (n.kind === 'bstart') notify('warn', (n.label || 'Pausa') + ' — ' + n.name, 'Início às ' + n.start + ' · ' + n.mins + ' min');
      else notify('ok', 'Pausa concluída', n.name + ' voltou a trabalhar');
    });
  }, 1000);
}

// ---- Pausas (manual/override) ----
function startPause(id) {
  const e = state.employees.find(x => x.id === id);
  if (!e || e.status === 'pause') return;
  const nb = D.nextBreak(e, state.now) || { type: '10', label: 'Pausa 10', mins: 10 };
  const total = nb.mins * 60, endsAt = Date.now() + total * 1000;
  state.employees = state.employees.map(x => x.id === id ? { ...x, status: 'pause', pauseType: nb.type, pauseLabel: nb.label, pauseTotal: total, pauseEndsAt: endsAt } : x);
  notify('warn', nb.label + ' iniciada', e.name + ' entrou em pausa de ' + nb.mins + ' min'); emit();
}
function finishPause(id) {
  const e = state.employees.find(x => x.id === id);
  if (!e) return;
  const sched = D.scheduledBreakNow(e, state.now, state.saturdayPhase, state._endedToday);
  if (sched) state._endedToday.add(D.dayKey(state.now) + '|' + e.id + '|' + sched.start);
  state.employees = state.employees.map(x => x.id === id ? { ...x, status: 'working', pauseType: null, pauseLabel: null, pauseEndsAt: null, pauseTotal: null } : x);
  notify('ok', 'Pausa concluída', e.name + ' voltou a trabalhar'); emit();
}
function deleteOperator(id) {
  const e = state.employees.find(x => x.id === id);
  state.employees = state.employees.filter(x => x.id !== id);
  state.cadastro = null;
  saveOperators();
  if (e) notify('ok', 'Operador removido', e.name + ' foi excluído'); emit();
}

// ---- Ações expostas para a view ----
export const actions = {
  goto(screen) { set({ screen }); },
  toggleMenu() { set({ collapsed: !state.collapsed }); },
  setSearch(v) { set({ search: v }); },
  toggleSort() { set({ sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' }); },
  setHistSearch(v) { set({ histSearch: v }); },
  setHistPeriod(p) { set({ histPeriod: p }); },

  askConfirm(id, action) {
    const e = state.employees.find(x => x.id === id); if (!e) return;
    let label = 'pausa';
    if (action === 'start') { const nb = D.nextBreak(e, state.now); label = nb ? nb.label : 'Pausa 10'; }
    else if (action === 'finish' && e.pauseLabel) { label = e.pauseLabel; }
    set({ confirm: { id, action, name: e.name, label } });
  },
  closeConfirm() { set({ confirm: null }); },
  runConfirm() { const c = state.confirm; if (!c) return; if (c.action === 'start') startPause(c.id); else if (c.action === 'delete') deleteOperator(c.id); else finishPause(c.id); set({ confirm: null }); },

  // CRUD (mesmo form serve criar/editar)
  openCadastro() {
    const p = D.shiftPresets().manha[0];
    set({ cadastro: { ...emptyForm(), jornadaInicio: p.jornada.inicio, jornadaFim: p.jornada.fim, sabInicio: p.jornadaSab.inicio, sabFim: p.jornadaSab.fim, breaks: p.breaks.map(b => D.mkBreak(b.type, b.start)) } });
  },
  openEditModal(id) {
    const e = state.employees.find(x => x.id === id); if (!e) return;
    set({ cadastro: { editId: e.id, nome: e.name, turno: e.turno, presetIndex: 0, jornadaInicio: e.jornada ? e.jornada.inicio : '08:00', jornadaFim: e.jornada ? e.jornada.fim : '14:20', sabInicio: e.jornadaSab ? e.jornadaSab.inicio : '08:00', sabFim: e.jornadaSab ? e.jornadaSab.fim : '14:20', breaks: (e.breaks || []).map(b => D.mkBreak(b.type, b.start)), newType: '10', newStart: '' } });
  },
  closeCadastro() { set({ cadastro: null }); },
  // Silencioso (sem emit): o texto já está no input; o botão Salvar/Add é
  // atualizado direto no DOM pelo handler. Evita qualquer re-render ao digitar.
  setForm(patch) { state.cadastro = { ...state.cadastro, ...patch }; },
  applyPreset(turno, idx) {
    const list = D.shiftPresets()[turno] || D.shiftPresets().manha;
    const p = list[idx] || list[0]; if (!p) return;
    state.cadastro = { ...state.cadastro, turno, presetIndex: list.indexOf(p), jornadaInicio: p.jornada.inicio, jornadaFim: p.jornada.fim, sabInicio: p.jornadaSab ? p.jornadaSab.inicio : state.cadastro.sabInicio, sabFim: p.jornadaSab ? p.jornadaSab.fim : state.cadastro.sabFim, breaks: p.breaks.map(b => D.mkBreak(b.type, b.start)) };
    emit();
  },
  addFormBreak() { const f = state.cadastro; if (!/^\d{1,2}:\d{2}$/.test(f.newStart)) return; const b = D.mkBreak(f.newType, f.newStart); state.cadastro = { ...f, breaks: [...f.breaks, b].sort((a, c) => D.hhmmToMin(a.start) - D.hhmmToMin(c.start)), newStart: '' }; emit(); },
  removeFormBreak(i) { const f = state.cadastro; state.cadastro = { ...f, breaks: f.breaks.filter((_, k) => k !== i) }; emit(); },
  saveCadastro() {
    const f = state.cadastro; if (!f || !f.nome.trim()) return;
    const jornadaSab = f.turno === 'integral' ? null : { inicio: f.sabInicio, fim: f.sabFim };
    const breaks = f.breaks.map(b => D.mkBreak(b.type, b.start));
    if (f.editId) {
      state.employees = state.employees.map(e => e.id === f.editId ? { ...e, name: f.nome.trim(), turno: f.turno, jornada: { inicio: f.jornadaInicio, fim: f.jornadaFim }, jornadaSab, breaks } : e);
      notify('ok', 'Operador atualizado', f.nome.trim() + ' foi salvo');
    } else {
      const emp = { id: Date.now(), name: f.nome.trim(), turno: f.turno, jornada: { inicio: f.jornadaInicio, fim: f.jornadaFim }, jornadaSab, breaks, status: 'working', color: D.PALETTE[Math.floor(Math.random() * D.PALETTE.length)], pauseType: null, pauseLabel: null, pauseTotal: null, pauseEndsAt: null };
      state.employees = [emp, ...state.employees];
      notify('ok', 'Operador cadastrado', f.nome.trim() + ' foi adicionado');
    }
    saveOperators();
    set({ cadastro: null });
  },
  askDelete() { if (state.cadastro && state.cadastro.editId) actions.askConfirm(state.cadastro.editId, 'delete'); },

  // pausas do dia
  openBreaks(id) { set({ breaksModal: { id } }); },
  closeBreaks() { set({ breaksModal: null }); },

  // sábado
  openSaturday() { set({ saturdayModal: true }); },
  closeSaturday() { set({ saturdayModal: false }); },
  flipSaturday() { state.saturdayPhase = state.saturdayPhase === 0 ? 1 : 0; notify('ok', 'Rodízio atualizado', 'A ordem dos sábados foi invertida'); emit(); },

  // beta / export
  openBeta() { set({ betaOpen: true }); },
  closeBeta() { set({ betaOpen: false }); },

  // teste livre de notificação
  openFreeTest() { set({ freeTestOpen: true, freeForm: { name: 'Teste de notificação', targetTime: D.hhmmss(Date.now() + 20000) } }); },
  closeFreeTest() { set({ freeTestOpen: false }); },
  setFreeName(v) { state.freeForm = { ...state.freeForm, name: v }; },
  setFreeTarget(v) { state.freeForm = { ...state.freeForm, targetTime: v }; },
  freeOffset(secs) { state.freeForm = { ...state.freeForm, targetTime: D.hhmmss(Date.now() + secs * 1000) }; emit(); },
  startFreeTest() {
    const f = state.freeForm;
    const p = String(f.targetTime || '').split(':').map(n => parseInt(n, 10));
    if (p.length < 2 || p.some(n => isNaN(n))) return;
    const now = Date.now();
    const dd = new Date(now); dd.setHours(p[0] || 0, p[1] || 0, p[2] || 0, 0);
    let target = dd.getTime(); if (target <= now) target += 24 * 60 * 60 * 1000;
    _testSeq += 1;
    const emp = { id: now + _testSeq, name: (f.name || '').trim() || 'Teste de notificação', turno: 'integral', jornada: { inicio: '00:00', fim: '23:59' }, jornadaSab: null, breaks: [], status: 'pause', color: '#f5c542', pauseType: 'test', pauseLabel: 'Alvo ' + D.hhmmss(target), pauseTotal: Math.round((target - now) / 1000), pauseEndsAt: target, isTest: true };
    state.employees = [emp, ...state.employees];
    state.screen = 'pausa';
    state.freeForm = { ...state.freeForm, targetTime: D.hhmmss(Date.now() + 20000) };
    notify('warn', 'Teste agendado', emp.name + ' — dispara às ' + D.hhmmss(target)); emit();
  },

  // janela + externos
  winMin() { try { window.electronAPI.minimize(); } catch (e) {} },
  winMax() { try { window.electronAPI.maximize(); } catch (e) {} },
  winClose() { try { window.electronAPI.close(); } catch (e) {} },
  openExternal(url) { try { window.electronAPI.openExternal(url); } catch (e) {} },

  // Excel
  exportExcel() { set({ betaOpen: true }); },
  importExcel() {
    if (!(window.electronAPI && window.electronAPI.importExcel)) { notify('err', 'Indisponível', 'A importação só funciona no app desktop'); return; }
    window.electronAPI.importExcel().then(res => {
      if (!res) return;
      if (res.error) { notify('err', 'Falha ao importar', res.error); return; }
      if (!res.rows || !res.rows.length) { notify('warn', 'Nada importado', 'Nenhum operador encontrado na planilha'); return; }
      state.employees = D.operatorsFromImport(res.rows); state.screen = 'trab'; saveOperators(); emit();
      notify('ok', 'Escala importada', state.employees.length + ' operadores de ' + res.fileName);
    }).catch(err => notify('err', 'Falha ao importar', String(err && err.message || err)));
  },
  downloadTemplate() {
    if (!(window.electronAPI && window.electronAPI.downloadTemplate)) { notify('err', 'Indisponível', 'Disponível apenas no app desktop'); return; }
    window.electronAPI.downloadTemplate().then(res => { if (res && res.ok) notify('ok', 'Modelo salvo', 'Preencha e importe pela tela de Importação'); }).catch(() => {});
  },
};
