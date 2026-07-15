// ============================================================================
// Bootstrap — monta o shell, liga a delegação de eventos e o loop de render.
// Sem framework: renderiza seções por innerHTML, preservando foco/caret dos
// inputs. O modal só re-renderiza quando sua "assinatura" muda (evita fechar
// selects a cada tick).
// ============================================================================
import * as D from './domain.js';
import { state, actions, subscribe, startClock } from './store.js';
import { shellHTML, navHTML, topbarHTML, listHTML, importHTML, historyHTML, creditsHTML } from './view.js';
import { modalsHTML, toastsHTML } from './modals.js';

const root = document.getElementById('app');
root.innerHTML = shellHTML();

const $ = (id) => document.getElementById(id);
let lastModalSig = null;
let lastContentSig = null;

// Atualiza o input de horário do teste sem reconstruir o modal (usado pelos atalhos).
function syncFreeTarget() { const el = $('f-freetarget'); if (el) el.value = state.freeForm.targetTime; }

function modalSig() {
  if (state.cadastro) {
    // Só a ESTRUTURA re-renderiza o modal. O texto digitado (nome, horários) fica
    // no DOM e NÃO força rebuild a cada tecla — evita o modal piscar. Os booleans
    // atualizam os botões (Salvar/Add) só quando cruzam o limite habilitar/desabilitar.
    const c = state.cadastro;
    return 'cad|' + c.editId + '|' + c.turno + '|' + c.presetIndex + '|' + c.newType + '|' + JSON.stringify(c.breaks);
  }
  if (state.confirm) return 'conf|' + JSON.stringify(state.confirm);
  if (state.breaksModal) return 'brk|' + state.breaksModal.id + '|' + D.nowMin(state.now);
  if (state.saturdayModal) return 'sat|' + state.saturdayPhase;
  if (state.betaOpen) return 'beta';
  if (state.freeTestOpen) return 'free|' + state.employees.filter(e => e.isTest).length;
  return '';
}

// Assinatura do conteúdo: só reconstrói #content quando algo da tela muda (evita
// redesenhar os 34 cards — que aparecem atrás do modal de vidro — a cada tecla).
function contentSig() {
  const now = state.now, phase = state.saturdayPhase, ended = state._endedToday, s = state.screen;
  if (s === 'import') return 'import';
  if (s === 'creditos') return 'creditos';
  if (s === 'historico') return 'hist|' + state.histSearch + '|' + state.histPeriod + '|' + state.history.length + '|' + D.nowMin(now);
  return 'list|' + s + '|' + state.search + '|' + state.sortDir + '|' + state.employees.map(e => e.id + ':' + D.computeStatus(e, now, phase, ended)).join(',');
}

// No 'tick' (segundos normais) NÃO reconstruímos o DOM — só atualizamos os
// cronômetros no lugar. Assim um clique nunca cai entre um rebuild e some.
function lightTick() {
  const c = { now: state.now, phase: state.saturdayPhase, ended: state._endedToday };
  document.querySelectorAll('[data-card]').forEach(el => {
    const e = state.employees.find(x => x.id === Number(el.dataset.card));
    if (!e) return;
    if (D.computeStatus(e, c.now, c.phase, c.ended) !== 'pause') return; // só pausa muda a cada seg
    const ab = D.activeBreak(e, c.now, c.phase, c.ended);
    const rem = ab ? Math.max(0, Math.round((ab.endsAt - c.now) / 1000)) : 0;
    const t = el.querySelector('.timer');
    if (t) { t.textContent = D.fmt(rem); t.style.color = rem < 60 ? '#ef4444' : D.catColor(ab ? ab.type : e.pauseType); }
  });
  if (state.freeTestOpen) { const n = document.querySelector('.free-now'); if (n) n.textContent = D.hhmmss(state.now); }
}

function render(reason) {
  if (reason === 'tick') { lightTick(); return; }
  // preserva foco/caret
  const act = document.activeElement;
  const focusId = act && act.id;
  let ss = null, se = null;
  try { ss = act.selectionStart; se = act.selectionEnd; } catch (e) {}

  $('app-root').classList.toggle('collapsed', state.collapsed);
  $('btn-test').style.display = state.freeTest ? '' : 'none';
  $('nav').innerHTML = navHTML();

  const tb = topbarHTML();
  $('scr-title').textContent = tb.title;
  $('scr-sub').textContent = tb.sub;
  const sat = $('sat-chip'); sat.setAttribute('style', tb.sat); sat.innerHTML = tb.satInner;
  $('today-chip').innerHTML = tb.today;

  const csig = contentSig();
  if (csig !== lastContentSig) {
    const isList = state.screen === 'pausa' || state.screen === 'trab' || state.screen === 'fora';
    $('content').innerHTML = isList ? listHTML()
      : state.screen === 'import' ? importHTML()
      : state.screen === 'historico' ? historyHTML()
      : state.screen === 'creditos' ? creditsHTML() : '';
    lastContentSig = csig;
  }

  const sig = modalSig();
  if (sig !== lastModalSig) { $('modal-root').innerHTML = modalsHTML(); lastModalSig = sig; }
  $('toasts').innerHTML = toastsHTML();

  // restaura foco
  if (focusId) {
    const n = $(focusId);
    if (n) { n.focus(); if (ss != null) { try { n.setSelectionRange(ss, se); } catch (e) {} } }
  }
}

// ---- Delegação: clicks ----
root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id ? Number(el.dataset.id) : undefined;
  switch (a) {
    case 'stop': return;
    case 'goto': return actions.goto(el.dataset.arg);
    case 'toggle-menu': return actions.toggleMenu();
    case 'toggle-sort': return actions.toggleSort();
    case 'edit-op': return actions.openEditModal(id);
    case 'card-action': return actions.askConfirm(id, el.dataset.act === 'finish' ? 'finish' : 'start');
    case 'open-breaks': return actions.openBreaks(id);
    case 'close-breaks': return actions.closeBreaks();
    case 'open-cadastro': return actions.openCadastro();
    case 'close-cadastro': return actions.closeCadastro();
    case 'save-cadastro': return actions.saveCadastro();
    case 'ask-delete': return actions.askDelete();
    case 'add-break': return actions.addFormBreak();
    case 'rm-break': return actions.removeFormBreak(Number(el.dataset.i));
    case 'do-confirm': return actions.runConfirm();
    case 'close-confirm': return actions.closeConfirm();
    case 'open-saturday': return actions.openSaturday();
    case 'close-saturday': return actions.closeSaturday();
    case 'flip-saturday': return actions.flipSaturday();
    case 'open-freetest': return actions.openFreeTest();
    case 'close-freetest': return actions.closeFreeTest();
    case 'start-freetest': return actions.startFreeTest();
    case 'free-20': actions.freeOffset(20); syncFreeTarget(); return;
    case 'free-60': actions.freeOffset(60); syncFreeTarget(); return;
    case 'free-300': actions.freeOffset(300); syncFreeTarget(); return;
    case 'export': return actions.exportExcel();
    case 'import': return actions.importExcel();
    case 'download-template': return actions.downloadTemplate();
    case 'hist-period': return actions.setHistPeriod(el.dataset.arg);
    case 'open-external': return actions.openExternal(el.dataset.arg);
    case 'close-beta': return actions.closeBeta();
    case 'win-min': return actions.winMin();
    case 'win-max': return actions.winMax();
    case 'win-close': return actions.winClose();
  }
});

// ---- Delegação: inputs de texto/time ----
root.addEventListener('input', (ev) => {
  const el = ev.target; const f = el.dataset.field; if (!f) return;
  const v = el.value;
  if (f === 'search') return actions.setSearch(v);
  if (f === 'histSearch') return actions.setHistSearch(v);
  // Nome/newStart: atualizam o estado E o botão correspondente direto no DOM — sem
  // reconstruir o modal (evita piscar a cada tecla). O texto já está no input.
  if (f === 'nome') { actions.setForm({ nome: v }); const b = $('f-save'); if (b) { const d = !v.trim(); b.disabled = d; b.classList.toggle('disabled', d); } return; }
  if (f === 'newStart') { actions.setForm({ newStart: v }); const b = $('f-addbreak'); if (b) { const ok = /^\d{1,2}:\d{2}$/.test(v); b.disabled = !ok; b.classList.toggle('disabled', !ok); } return; }
  if (f === 'jornadaInicio') return actions.setForm({ jornadaInicio: v });
  if (f === 'jornadaFim') return actions.setForm({ jornadaFim: v });
  if (f === 'sabInicio') return actions.setForm({ sabInicio: v });
  if (f === 'sabFim') return actions.setForm({ sabFim: v });
  if (f === 'freeName') return actions.setFreeName(v);
  if (f === 'freeTarget') return actions.setFreeTarget(v);
});

// ---- Delegação: selects ----
root.addEventListener('change', (ev) => {
  const el = ev.target; const f = el.dataset.field; if (!f) return;
  const v = el.value;
  if (f === 'turno') return actions.applyPreset(v, 0);
  if (f === 'preset') return actions.applyPreset(state.cadastro.turno, Number(v));
  if (f === 'newType') return actions.setForm({ newType: v });
});

subscribe(render);
render();
startClock();
