// ============================================================================
// Bootstrap — monta o shell, liga a delegação de eventos e o loop de render.
// Sem framework: renderiza seções por innerHTML, preservando foco/caret dos
// inputs. O modal só re-renderiza quando sua "assinatura" muda (evita fechar
// selects a cada tick).
// ============================================================================
import * as D from './domain.js';
import { state, actions, subscribe, startClock } from './store.js';
import { shellHTML, navHTML, topbarHTML, listHTML, placeholderHTML } from './view.js';
import { modalsHTML, toastsHTML } from './modals.js';

const root = document.getElementById('app');
root.innerHTML = shellHTML();

const $ = (id) => document.getElementById(id);
let lastModalSig = null;

function modalSig() {
  if (state.cadastro) return 'cad|' + JSON.stringify(state.cadastro);
  if (state.confirm) return 'conf|' + JSON.stringify(state.confirm);
  if (state.breaksModal) return 'brk|' + state.breaksModal.id + '|' + D.nowMin(state.now);
  if (state.saturdayModal) return 'sat|' + state.saturdayPhase;
  if (state.betaOpen) return 'beta';
  if (state.freeTestOpen) return 'free|' + JSON.stringify(state.freeForm) + '|' + Math.floor(state.now / 1000) + '|' + state.employees.filter(e => e.isTest).length;
  return '';
}

function render() {
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

  const isList = state.screen === 'pausa' || state.screen === 'trab' || state.screen === 'fora';
  $('content').innerHTML = isList ? listHTML() : placeholderHTML();

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
    case 'free-20': return actions.freeOffset(20);
    case 'free-60': return actions.freeOffset(60);
    case 'free-300': return actions.freeOffset(300);
    case 'export': return actions.exportExcel();
    case 'import': return actions.importExcel();
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
  if (f === 'nome') return actions.setForm({ nome: v });
  if (f === 'jornadaInicio') return actions.setForm({ jornadaInicio: v });
  if (f === 'jornadaFim') return actions.setForm({ jornadaFim: v });
  if (f === 'sabInicio') return actions.setForm({ sabInicio: v });
  if (f === 'sabFim') return actions.setForm({ sabFim: v });
  if (f === 'newStart') return actions.setForm({ newStart: v });
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
