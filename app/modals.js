// ============================================================================
// Modais — HTML a partir do estado. Fecham no backdrop (data-action=close-*),
// conteúdo com data-action=stop para não propagar. Inputs usam data-field.
// ============================================================================
import * as D from './domain.js';
import { state } from './store.js';
import { IC, esc, ctx } from './view.js';

const backdrop = (inner, closeAction, z) => `
  <div class="modal-backdrop" data-action="${closeAction}" style="z-index:${z}">
    <div class="modal" data-action="stop">${inner}</div>
  </div>`;

export function modalsHTML() {
  let out = '';

  // ---- Confirmação (iniciar/finalizar/excluir) ----
  if (state.confirm) {
    const c = state.confirm;
    const isDel = c.action === 'delete', isFin = c.action === 'finish';
    const title = c.action === 'start' ? ('Iniciar ' + (c.label || 'pausa')) : (isDel ? 'Excluir operador' : ('Finalizar ' + (c.label || 'pausa')));
    const msg = c.action === 'start' ? ('Iniciar ' + (c.label || 'pausa') + ' de ' + c.name + ' agora?')
      : isDel ? ('Remover ' + c.name + ' da lista? Esta ação não pode ser desfeita.')
        : ('Finalizar a ' + (c.label || 'pausa') + ' de ' + c.name + '? Ele voltará a trabalhar.');
    const btnLabel = c.action === 'start' ? 'Iniciar pausa' : (isDel ? 'Excluir' : 'Finalizar pausa');
    const btnCls = isDel ? 'btn-danger' : (isFin ? 'btn-amber' : 'btn-primary');
    const icCls = isDel ? 'ic-danger' : (isFin ? 'ic-amber' : 'ic-blue');
    out += backdrop(`
      <div class="modal-confirm">
        <div class="confirm-ic ${icCls}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
        <div><div class="modal-title">${esc(title)}</div><div class="modal-msg">${esc(msg)}</div></div>
      </div>
      <div class="modal-foot end">
        <button class="btn-flat" data-action="close-confirm">Cancelar</button>
        <button class="${btnCls}" data-action="do-confirm">${btnLabel}</button>
      </div>`, 'close-confirm', 120);
  }

  // ---- Cadastro / Edição (CRUD) ----
  if (state.cadastro) {
    const f = state.cadastro;
    const isEdit = !!f.editId;
    const presets = D.shiftPresets()[f.turno] || [];
    const opts = (arr, sel) => arr.map(o => `<option value="${o.v}"${String(o.v) === String(sel) ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
    const turnoOpts = opts([{ v: 'manha', l: 'Manhã (sábados intercalados)' }, { v: 'tarde', l: 'Tarde (sábados intercalados)' }, { v: 'integral', l: 'Integral (seg–sex, sem sábado)' }], f.turno);
    const presetOpts = opts(presets.map((p, i) => ({ v: i, l: p.label })), f.presetIndex);
    const breakItems = f.breaks.map((b, i) => {
      const cc = D.catColor(b.type);
      return `<div class="break-item"><span class="tag" style="background:${cc}22;color:${cc};border:1px solid ${cc}55">${b.label}</span><span class="mono">${b.start} → ${b.end}</span><button class="link-x" data-action="rm-break" data-i="${i}">${IC.x}</button></div>`;
    }).join('');
    const canAdd = /^\d{1,2}:\d{2}$/.test(f.newStart);
    const saveDis = !f.nome.trim();
    out += backdrop(`
      <div class="modal-head">
        <div><div class="modal-title">${isEdit ? 'Editar operador' : 'Novo operador'}</div><div class="modal-sub">${isEdit ? 'Atualize os dados ou exclua o operador' : 'Nome, turno e horários de pausa'}</div></div>
        <button class="icon-btn" data-action="close-cadastro">${IC.x}</button>
      </div>
      <div class="modal-body">
        <div class="field"><label>Nome completo</label><input id="f-nome" data-field="nome" value="${esc(f.nome)}" placeholder="Ex.: Maria Silva"></div>
        <div class="field"><label>Turno</label><select data-field="turno">${turnoOpts}</select></div>
        <div class="field"><label>Equipe / horário <span class="hint">— preenche jornada e pausas</span></label><select data-field="preset">${presetOpts}</select></div>
        <div class="field"><label>Jornada <span class="hint">— seg a sex</span></label><div class="row"><input type="time" data-field="jornadaInicio" value="${f.jornadaInicio}"><span class="ate">até</span><input type="time" data-field="jornadaFim" value="${f.jornadaFim}"></div></div>
        ${f.turno !== 'integral' ? `<div class="field"><label>Jornada de sábado <span class="hint">— quando a equipe trabalha</span></label><div class="row"><input type="time" data-field="sabInicio" value="${f.sabInicio}"><span class="ate">até</span><input type="time" data-field="sabFim" value="${f.sabFim}"></div></div>` : ''}
        <div class="field"><label>Pausas <span class="hint">— informe o início; o retorno é calculado</span></label>
          <div class="row gap">
            <select data-field="newType">${opts([{ v: '10', l: 'Pausa 10 (10 min)' }, { v: '30', l: 'Pausa 30 (30 min)' }, { v: '60', l: 'Pausa 60 (60 min)' }], f.newType)}</select>
            <input id="f-newstart" type="time" data-field="newStart" value="${f.newStart}" class="w-time">
            <button id="f-addbreak" class="btn-add${canAdd ? '' : ' disabled'}" data-action="add-break"${canAdd ? '' : ' disabled'}>+ Add</button>
          </div>
          ${f.breaks.length ? `<div class="break-list">${breakItems}</div>` : ''}
        </div>
      </div>
      <div class="modal-foot between">
        <div>${isEdit ? `<button class="btn-danger-soft" data-action="ask-delete">${IC.trash}Excluir</button>` : ''}</div>
        <div class="row gap">
          <button class="btn-flat" data-action="close-cadastro">Cancelar</button>
          <button id="f-save" class="btn-primary${saveDis ? ' disabled' : ''}" data-action="save-cadastro"${saveDis ? ' disabled' : ''}>${isEdit ? 'Salvar alterações' : 'Salvar operador'}</button>
        </div>
      </div>`, 'close-cadastro', 100);
  }

  // ---- Pausas do dia ----
  if (state.breaksModal) {
    const e = state.employees.find(x => x.id === state.breaksModal.id);
    if (e) {
      const c = ctx();
      const nm = D.nowMin(c.now);
      const rows = (e.breaks || []).slice().sort((a, b) => D.hhmmToMin(a.start) - D.hhmmToMin(b.start)).map(b => {
        const sm = D.hhmmToMin(b.start), em = D.hhmmToMin(b.end);
        const kind = em <= nm ? 'past' : (nm >= sm ? 'current' : 'next');
        const cc = D.catColor(b.type);
        const lbl = kind === 'past' ? 'Passou' : (kind === 'current' ? 'Agora' : 'A seguir');
        const col = kind === 'past' ? '#6b727c' : (kind === 'current' ? '#f5c542' : '#4ad991');
        return `<div class="brow${kind === 'past' ? ' past' : ''}"><span class="tag" style="background:${cc}22;color:${cc};border:1px solid ${cc}55">${b.label}</span><span class="mono grow">${b.start} → ${b.end}</span><span class="muted">${b.mins} min</span><span class="state" style="color:${col}">${lbl}</span></div>`;
      }).join('');
      out += backdrop(`
        <div class="modal-head"><div><div class="modal-title">Pausas do dia</div><div class="modal-sub">${esc(e.name)}</div></div><button class="icon-btn" data-action="close-breaks">${IC.x}</button></div>
        <div class="modal-body scroll">${rows || '<div class="muted">Sem pausas.</div>'}</div>`, 'close-breaks', 128);
    }
  }

  // ---- Rodízio de sábado ----
  if (state.saturdayModal) {
    const c = ctx();
    const sd = D.saturdayOfWeek(c.now);
    const items = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(sd); d.setDate(d.getDate() + i * 7);
      const team = D.saturdayTeam(d.getTime(), c.phase);
      const inf = D.turnoInfo(team);
      const ds = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
      items.push(`<div class="srow"><div class="row gap"><span class="mono">${ds}</span>${i === 0 ? '<span class="next-tag">PRÓXIMO</span>' : ''}</div><span class="tag" style="background:${inf.color}1f;color:${inf.color};border:1px solid ${inf.color}44"><span class="dot" style="background:${inf.color}"></span>${inf.label}</span></div>`);
    }
    out += backdrop(`
      <div class="modal-head">
        <div><div class="modal-title">Rodízio de sábado</div><div class="modal-sub">Qual equipe trabalha em cada sábado</div></div>
        <div class="row gap">
          <button class="btn-ghost sm" data-action="flip-saturday" title="Inverte a ordem dos sábados">${IC.refresh}Trocar turno</button>
          <button class="icon-btn" data-action="close-saturday">${IC.x}</button>
        </div>
      </div>
      <div class="modal-body scroll">${items.join('')}<div class="note">A cada semana alterna: um sábado a equipe da Manhã, no seguinte a Tarde. Integral não trabalha aos sábados.</div></div>`, 'close-saturday', 130);
  }

  // ---- Versão beta (export) ----
  if (state.betaOpen) {
    out += backdrop(`
      <div class="modal-confirm"><div class="confirm-ic ic-amber"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/></svg></div>
      <div><div class="modal-title">Versão beta</div><div class="modal-msg">A exportação da escala para Excel ainda não está disponível nesta versão beta. Chegará numa versão futura do Break Tracking.</div></div></div>
      <div class="modal-foot end"><button class="btn-primary" data-action="close-beta">Entendi</button></div>`, 'close-beta', 110);
  }

  // ---- Cadastro livre (teste de notificação) ----
  if (state.freeTestOpen) {
    const f = state.freeForm;
    const count = state.employees.filter(e => e.isTest).length;
    out += backdrop(`
      <div class="modal-head">
        <div class="row gap"><span class="confirm-ic ic-amber sm">${IC.bell}</span><div><div class="modal-title">Cadastro livre <span class="pill-test">TESTE</span></div><div class="modal-sub">Dispara uma pausa para validar a notificação</div></div></div>
        <button class="icon-btn" data-action="close-freetest">${IC.x}</button>
      </div>
      <div class="modal-body">
        <div class="field"><label>Nome</label><input id="f-freename" data-field="freeName" value="${esc(f.name)}"></div>
        <div class="field"><label>Horário do disparo <span class="hint">— hoje, HH:MM:SS</span></label>
          <div class="row gap tiny"><button class="chip-btn" data-action="free-20">agora +20s</button><button class="chip-btn" data-action="free-60">+1 min</button><button class="chip-btn" data-action="free-300">+5 min</button></div>
          <div class="row"><input id="f-freetarget" type="time" step="1" data-field="freeTarget" value="${f.targetTime}" class="grow mono-in"><span class="muted nowrap">agora <span class="mono free-now">${D.hhmmss(state.now)}</span></span></div>
        </div>
        <div class="note-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b727c" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg><div>A notificação dispara no horário definido. Clique <b>Iniciar teste</b> quantas vezes quiser para simular vários no dia. Feche e deixe o app aberto para ser notificado.</div></div>
      </div>
      <div class="modal-foot between">
        <div class="muted">${count ? `<b class="amber">${count}</b> teste(s) agendado(s)` : ''}</div>
        <div class="row gap"><button class="btn-flat" data-action="close-freetest">Fechar</button><button class="btn-amber" data-action="start-freetest">Iniciar teste</button></div>
      </div>`, 'close-freetest', 125);
  }

  return out;
}

export function toastsHTML() {
  return state.toasts.map(t => `<div class="toast"><div class="tt">${esc(t.title)}</div><div class="tm">${esc(t.msg)}</div></div>`).join('');
}
