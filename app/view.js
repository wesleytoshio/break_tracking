// ============================================================================
// View — renderiza o DOM a partir do estado. Sem {{ }}, sem estilo inline:
// estrutura em template strings + classes (styles.css); eventos por delegação
// via data-action (tratados em app.js). Funções puras de render.
// ============================================================================
import * as D from './domain.js';
import { state } from './store.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- Ícones (SVG) ----
const svg = (p, sw) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  pausa: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  trab: svg('<path d="M20 6 9 17l-5-5"/>'),
  fora: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  import: svg('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>'),
  credits: svg('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>'),
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  chevron: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
  cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  min: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
  max: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  sort: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
};

const SCREENS = {
  pausa: ['Em pausa', 'Funcionários atualmente em pausa'],
  trab: ['Trabalhando', 'Funcionários atualmente trabalhando'],
  fora: ['Fora do expediente', 'Fora da jornada agora'],
  import: ['Importação Excel', 'Importe a escala de pausas'],
  historico: ['Histórico', 'Registros de pausas'],
  creditos: ['Créditos', 'Quem faz o Break Tracking'],
};

function ctx() { return { now: state.now, phase: state.saturdayPhase, ended: state._endedToday }; }
const avatarStyle = (color, size) => `width:${size}px;height:${size}px;flex:0 0 ${size}px;background:${color}22;color:${color};font-size:${size * 0.36}px;border:1px solid ${color}44`;

// ---- Shell (sidebar + topbar) ----
export function shellHTML() {
  return `
  <div class="app${state.collapsed ? ' collapsed' : ''}" id="app-root">
    <aside class="sidebar cp-drag">
      <div class="brand">
        <div class="brand-logo cp-nodrag">${IC.logo}</div>
        <div class="brand-text"><div class="t">Controle de Pausas</div><div class="s">Gestão operacional</div></div>
      </div>
      <div class="nav-label">NAVEGAÇÃO</div>
      <nav class="nav cp-nodrag" id="nav"></nav>
      <div class="sidebar-bottom cp-nodrag">
        <button class="btn-new" data-action="open-cadastro">${IC.plus}<span class="txt">Novo operador</span></button>
        <button class="btn-test" data-action="open-freetest" style="display:none" id="btn-test">${IC.bell}<span class="txt">Teste de notificação</span></button>
        <div class="version-row" title="Versão Beta 1.0.0"><span class="badge-beta">BETA</span><div class="version-text"><div class="v">v1.0.0</div><div class="n">Break Tracking</div></div></div>
      </div>
    </aside>
    <button class="sidebar-toggle cp-nodrag" data-action="toggle-menu" title="Recolher/expandir">${IC.chevron}</button>
    <main class="main">
      <header class="topbar cp-drag">
        <div class="title-wrap"><div class="title" id="scr-title"></div><div class="subtitle" id="scr-sub"></div></div>
        <button class="sat-chip cp-nodrag" data-action="open-saturday" id="sat-chip" title="Rodízio de sábado"></button>
        <div class="today-chip cp-nodrag" id="today-chip"></div>
        <div class="win-controls cp-nodrag">
          <button class="cp-winbtn" data-action="win-min" title="Minimizar">${IC.min}</button>
          <button class="cp-winbtn" data-action="win-max" title="Maximizar">${IC.max}</button>
          <button class="cp-winbtn cp-winclose" data-action="win-close" title="Fechar">${IC.x}</button>
        </div>
      </header>
      <div class="content" id="content"></div>
    </main>
    <div id="modal-root"></div>
    <div class="toasts" id="toasts"></div>
  </div>`;
}

// ---- Nav + topbar (atualizados a cada render) ----
export function navHTML() {
  const c = ctx();
  const emps = state.employees;
  const count = (st) => emps.filter(e => D.computeStatus(e, c.now, c.phase, c.ended) === st).length;
  const items = [
    ['pausa', 'Em pausa', IC.pausa, count('pause'), 'on-pause'],
    ['trab', 'Trabalhando', IC.trab, count('working'), 'on-work'],
    ['fora', 'Fora', IC.fora, count('off'), 'on-off'],
    ['import', 'Importação Excel', IC.import, null, ''],
    ['historico', 'Histórico', IC.history, null, ''],
    ['creditos', 'Créditos', IC.credits, null, ''],
  ];
  return items.map(([k, label, ic, n, cls]) => `
    <button class="nav-item${state.screen === k ? ' active' : ''}" data-action="goto" data-arg="${k}" title="${label}">
      ${ic}<span class="txt">${label}</span>${n != null ? `<span class="nav-badge ${cls}">${n}</span>` : ''}
    </button>`).join('');
}

export function topbarHTML() {
  const c = ctx();
  const team = D.saturdayTeam(c.now, c.phase);
  const inf = D.turnoInfo(team);
  const sd = D.saturdayOfWeek(c.now);
  const satStr = ('0' + sd.getDate()).slice(-2) + '/' + ('0' + (sd.getMonth() + 1)).slice(-2);
  return {
    title: SCREENS[state.screen][0], sub: SCREENS[state.screen][1],
    sat: `border-color:${inf.color}55;background:${inf.color}1a;color:${inf.color}`,
    satInner: `<span class="dot" style="background:${inf.color}"></span>Sáb ${satStr} · ${inf.label} ${IC.refresh}`,
    today: `${IC.cal}${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`,
  };
}

// ---- Card de operador ----
function cardHTML(e) {
  const c = ctx();
  const status = D.computeStatus(e, c.now, c.phase, c.ended);
  const isPause = status === 'pause', isOff = status === 'off';
  const ab = D.activeBreak(e, c.now, c.phase, c.ended);
  const rem = isPause && ab ? Math.max(0, Math.round((ab.endsAt - c.now) / 1000)) : 0;
  const nb = D.nextBreak(e, c.now);
  const cc = isPause ? D.catColor(ab ? ab.type : e.pauseType) : (isOff ? '#8a919b' : '#2fbf71');
  const info = D.turnoInfo(e.turno);
  // próximas pausas (as passadas ficam ocultas)
  const nm = D.nowMin(c.now);
  const up = (e.breaks || []).filter(b => D.hhmmToMin(b.end) > nm).sort((a, b) => D.hhmmToMin(a.start) - D.hhmmToMin(b.start));
  const pausasNext = up.length ? up[0].start : '—';
  const more = Math.max(0, up.length - 1);
  const clickable = up.length >= 2;

  let badgeCls, badgeLabel, actionHTML;
  if (isOff) {
    badgeCls = 'background:rgba(138,145,155,.12);color:#9aa1ab;border:1px solid rgba(138,145,155,.25)';
    badgeLabel = 'Fora';
    actionHTML = `<button class="card-action off" disabled>Fora do expediente</button>`;
  } else if (isPause) {
    badgeCls = `background:${cc}22;color:${cc};border:1px solid ${cc}55`;
    badgeLabel = (ab && ab.label) || 'Em pausa';
    actionHTML = `<button class="card-action finish" data-action="card-action" data-id="${e.id}" data-act="finish">Finalizar pausa</button>`;
  } else {
    badgeCls = 'background:rgba(47,191,113,.13);color:#4ad991;border:1px solid rgba(47,191,113,.25)';
    badgeLabel = 'Trabalhando';
    actionHTML = `<button class="card-action start" data-action="card-action" data-id="${e.id}" data-act="start">Iniciar pausa</button>`;
  }
  const metaLabel = isOff ? 'PRÓXIMA ENTRADA' : (isPause ? ('EM ' + ((ab && ab.label) || 'PAUSA').toUpperCase()) : (nb ? ('PRÓXIMA · ' + nb.label.toUpperCase()) : 'SEM PAUSAS'));
  const metaValue = isOff ? (e.jornada ? e.jornada.inicio : '—') : (isPause ? D.fmt(rem) : (nb ? (nb.start + ' → ' + nb.end) : '—'));
  const timerColor = isOff ? '#8a919b' : (isPause ? (rem < 60 ? '#ef4444' : cc) : '#c5c9cf');
  const jornadaText = e.jornada ? (e.jornada.inicio + '–' + e.jornada.fim) : '—';

  return `
  <div class="card${isPause ? ' is-pause' : ''}" data-action="edit-op" data-id="${e.id}">
    <div class="card-head">
      <div class="avatar" style="${avatarStyle(e.color, 42)}">${D.initials(e.name)}</div>
      <div class="who"><div class="name">${esc(e.name)}</div><span class="turno-chip" style="background:${info.color}1f;color:${info.color};border:1px solid ${info.color}44">${info.label}</span></div>
      <span class="status-badge" style="${badgeCls}"><span class="dot" style="background:${cc}"></span>${esc(badgeLabel)}</span>
    </div>
    <div class="info-grid">
      <div class="info-cell"><div class="k">JORNADA</div><div class="v">${jornadaText}</div></div>
      <div class="info-cell${clickable ? ' clickable' : ''}"${clickable ? ` data-action="open-breaks" data-id="${e.id}"` : ''}><div class="k">PRÓX. PAUSAS</div><div class="v">${pausasNext}${clickable ? `<span class="more-pill">+${more}</span>` : ''}</div></div>
    </div>
    <div class="card-meta">
      <div><div class="k">${metaLabel}</div><div class="timer" style="color:${timerColor}">${metaValue}</div></div>
      ${isPause ? `<div class="pulse-ring"><span class="p"></span></div>` : ''}
    </div>
    ${actionHTML}
  </div>`;
}

// ---- Tela de lista (KPIs + toolbar + cards) ----
export function listHTML() {
  const c = ctx();
  const emps = state.employees;
  const statusView = state.screen === 'trab' ? 'working' : (state.screen === 'fora' ? 'off' : 'pause');
  const statusOf = e => D.computeStatus(e, c.now, c.phase, c.ended);
  const working = emps.filter(e => statusOf(e) === 'working').length;
  const onPause = emps.filter(e => statusOf(e) === 'pause').length;
  const offShift = emps.filter(e => statusOf(e) === 'off').length;
  const total = emps.length;
  const q = state.search.trim().toLowerCase();
  let rows = emps.filter(e => (!q || e.name.toLowerCase().includes(q)) && statusOf(e) === statusView);
  rows = rows.slice().sort((a, b) => state.sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  const lbl = state.screen === 'trab' ? 'TRABALHANDO' : (state.screen === 'fora' ? 'FORA DO EXPEDIENTE' : 'EM PAUSA');

  const kpi = (t, cls, ic, num, sub) => `<div class="kpi"><div class="kpi-head"><span>${t}</span><span class="kpi-ic ${cls}">${ic}</span></div><div class="kpi-num">${num}</div><div class="kpi-sub">${sub}</div></div>`;
  const kpis = `<div class="kpis">
    ${kpi('Trabalhando', 'g', IC.trab, working, 'de ' + total + ' funcionários')}
    ${kpi('Em pausa', 'a', IC.pausa, onPause, 'colaboradores agora')}
    ${kpi('Total', 'b', svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'), total, 'cadastrados')}
    ${kpi('Fora do expediente', 'm', IC.fora, offShift, 'fora da jornada agora')}
  </div>`;

  let body;
  if (rows.length === 0) {
    const t = q ? 'Nenhum funcionário encontrado' : (state.screen === 'trab' ? 'Nenhum funcionário trabalhando' : (state.screen === 'fora' ? 'Ninguém fora do expediente' : 'Nenhum funcionário em pausa'));
    const s = q ? 'Ajuste a busca ou confira o outro status.' : (state.screen === 'trab' ? 'Nenhum colaborador está trabalhando no momento.' : (state.screen === 'fora' ? 'Todos os operadores estão em expediente agora.' : 'Nenhum colaborador está em pausa no momento.'));
    body = `<div class="empty"><div class="ic">${IC.search}</div><div class="t">${t}</div><div class="s">${s}</div></div>`;
  } else {
    body = `<div class="cards">${rows.map(cardHTML).join('')}</div>`;
  }

  return `${kpis}
  <div class="list-wrap">
    <div class="list-toolbar">
      <div class="search">${IC.search}<input id="search-input" type="text" placeholder="Buscar por nome..." value="${esc(state.search)}"></div>
      <div class="toolbar-actions">
        <button class="btn-ghost disabled" data-action="export">${IC.import}Exportar <span class="beta-tag">BETA</span></button>
        <button class="btn-ghost" data-action="import">${IC.import}Importar</button>
      </div>
    </div>
    <div class="list-sub"><span class="lbl">${lbl}</span><button class="sort-btn" data-action="toggle-sort">${IC.sort}Nome ${state.sortDir === 'asc' ? '↑' : '↓'}</button></div>
    ${body}
  </div>`;
}

// ---- Placeholder para telas ainda em migração ----
export function placeholderHTML() {
  return `<div class="empty"><div class="ic">${IC.import}</div><div class="t">Tela em migração</div><div class="s">Esta tela ainda está sendo portada para a nova arquitetura.</div></div>`;
}

export { IC, esc, ctx, avatarStyle };
