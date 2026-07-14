// Gera um .xlsx no formato de importação com os 34 operadores do buildEmployees().
// Uso: node tools/gen-operators-xlsx.js [caminho_saida.xlsx]
const XLSX = require('xlsx');
const path = require('path');
const { pathToFileURL } = require('url');

const HEADERS = ['OPERADOR', 'TURNO', 'ENTRADA', 'SAIDA', 'SABADO ENTRADA', 'SABADO SAIDA', 'PAUSA 10', 'PAUSA 30', 'PAUSA 60', 'PAUSA 10 (2a)'];

function rowFor(e) {
  const b10 = (e.breaks || []).filter(b => b.type === '10').map(b => b.start);
  const b30 = (e.breaks || []).filter(b => b.type === '30').map(b => b.start);
  const b60 = (e.breaks || []).filter(b => b.type === '60').map(b => b.start);
  return [
    e.name,
    e.turno,
    e.jornada ? e.jornada.inicio : '-',
    e.jornada ? e.jornada.fim : '-',
    e.jornadaSab ? e.jornadaSab.inicio : '-',
    e.jornadaSab ? e.jornadaSab.fim : '-',
    b10[0] || '-',
    b30[0] || '-',
    b60[0] || '-',
    b10[1] || '-',
  ];
}

(async () => {
  const D = await import(pathToFileURL(path.join(__dirname, '..', 'app', 'domain.js')).href);
  const emps = D.buildEmployees();
  const aoa = [HEADERS.slice(), ...emps.map(rowFor)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 13 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Operadores');
  const out = process.argv[2] || 'C:/Users/wesle/Downloads/operadores_34.xlsx';
  XLSX.writeFile(wb, out);
  console.log('salvo:', out, '|', emps.length, 'operadores');

  // ---- Round-trip: reimporta com a mesma lógica do main.js (parseSchedule) ----
  const fracToHHMM = v => { if (typeof v !== 'number') return null; const f = v - Math.floor(v), mins = Math.round(f * 1440); return String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); };
  const normalizeTurno = raw => { const c = String(raw || '').trim().toUpperCase().charAt(0); return c === 'I' ? 'integral' : (c === 'T' ? 'tarde' : 'manha'); };
  function parseSchedule(sheet) {
    const gc = (r, c) => sheet[XLSX.utils.encode_cell({ r, c })];
    const str = (r, c) => { const cl = gc(r, c); return cl && cl.v != null ? String(cl.v).trim() : ''; };
    const tm = (r, c) => { const cl = gc(r, c); if (!cl || cl.v == null) return null; if (typeof cl.v === 'number') return fracToHHMM(cl.v); const s = String(cl.v).trim(); return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5).padStart(5, '0') : null; };
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const start = str(0, 0).toUpperCase().indexOf('OPERADOR') === 0 ? 1 : 0;
    const rows = [];
    for (let r = start; r <= range.e.r; r++) { const name = str(r, 0); if (!name || name === '-') continue; rows.push({ operador: name, turno: normalizeTurno(str(r, 1)), entrada: tm(r, 2), saida: tm(r, 3), sabEntrada: tm(r, 4), sabSaida: tm(r, 5), p10a: tm(r, 6), p30: tm(r, 7), p60: tm(r, 8), p10b: tm(r, 9) }); }
    return rows;
  }
  const wb2 = XLSX.readFile(out, { cellNF: false, cellText: false });
  const parsed = parseSchedule(wb2.Sheets[wb2.SheetNames[0]]);
  const reops = D.operatorsFromImport(parsed);
  console.log('round-trip: reimportou', reops.length, 'operadores');
  const stef = reops.find(o => o.name === 'Stefani' && o.turno === 'manha');
  console.log('  Stefani(manha):', JSON.stringify(stef.jornada), 'pausas:', stef.breaks.map(b => b.label + ' ' + b.start).join(', '));
  const cam = reops.find(o => o.name === 'Camila');
  console.log('  Camila(integral):', JSON.stringify(cam.jornada), 'sab:', cam.jornadaSab, 'pausas:', cam.breaks.map(b => b.label + ' ' + b.start).join(', '));
})().catch(e => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
