// Processo principal do Electron.
// - Cria a janela do app
// - Notificações NATIVAS do Windows (Notification -> ToastNotification)
// - Roda em segundo plano na bandeja do sistema (igual Discord/Steam):
//   fechar a janela apenas a esconde; o app continua vivo e notificando.
const { app, BrowserWindow, ipcMain, Notification, shell, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');

// ---- Licenciamento offline (assinatura Ed25519 + trava por máquina) ----
// Chave PÚBLICA embutida. A privada fica só com o fornecedor (tools/), fora do git.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+ivY75lF3rZLDQQhbPRyClzzkSStcfBvgvyxqwSIn58=
-----END PUBLIC KEY-----`;
const TRIAL_DAYS = 15;

// Modo de teste livre (apenas para validar as notificações): habilitado por
// variável de ambiente. Com PAUSA_TEST_MODE=1 (ou true/on/yes) o app mostra o
// "Cadastro livre", que dispara uma pausa com duração arbitrária. Sem a env,
// nada disso aparece — é uma regra só de teste.
const FREE_TEST_MODE = /^(1|true|on|yes)$/i.test(String(process.env.PAUSA_TEST_MODE || '').trim());

function licenseFilePath() { return path.join(app.getPath('userData'), 'license.key'); }

// ID único da máquina (Windows MachineGuid; fallback: UUID persistido).
function getMachineId() {
  try {
    if (process.platform === 'win32') {
      const out = require('child_process').execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', windowsHide: true });
      const m = /MachineGuid\s+REG_SZ\s+([\w-]+)/i.exec(out);
      if (m) return m[1].toLowerCase();
    }
  } catch (e) { /* fallback abaixo */ }
  try {
    const p = path.join(app.getPath('userData'), 'mid.txt');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
    const id = crypto.randomUUID();
    fs.writeFileSync(p, id);
    return id;
  } catch (e) { return 'unknown'; }
}

// Verifica a assinatura da licença com a chave pública. Retorna o payload ou null.
function verifySignedLicense(licStr) {
  try {
    const parts = String(licStr).trim().split('.');
    if (parts.length !== 2) return null;
    const ok = crypto.verify(null, Buffer.from(parts[0]), LICENSE_PUBLIC_KEY, Buffer.from(parts[1], 'base64url'));
    if (!ok) return null;
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (e) { return null; }
}

// Retorna null se a licença é válida para esta máquina, ou uma mensagem de erro.
function licenseProblem(payload, machineId) {
  if (!payload) return 'Licença inválida (assinatura não confere).';
  if (payload.machineId && payload.machineId.toLowerCase() !== machineId.toLowerCase()) return 'Licença emitida para outra máquina.';
  if (payload.exp && Date.now() > payload.exp) return 'Licença expirada.';
  return null;
}

// Data do primeiro uso (para o período de avaliação). Cria se não existir.
function getFirstRun() {
  const p = path.join(app.getPath('userData'), '.firstrun');
  try {
    if (fs.existsSync(p)) { const v = parseInt(fs.readFileSync(p, 'utf8').trim(), 10); if (v > 0) return v; }
  } catch (e) { /* recria */ }
  const now = Date.now();
  try { fs.writeFileSync(p, String(now)); } catch (e) { /* ignore */ }
  return now;
}

function licenseStatus() {
  const machineId = getMachineId();
  let payload = null;
  try { payload = verifySignedLicense(fs.readFileSync(licenseFilePath(), 'utf8')); } catch (e) { /* sem licença */ }
  if (payload && !licenseProblem(payload, machineId)) {
    return { licensed: true, name: payload.name || '', edition: payload.edition || 'pro', exp: payload.exp || null, machineId };
  }
  const usedDays = Math.floor((Date.now() - getFirstRun()) / 86400000);
  return { licensed: false, trialDaysLeft: Math.max(0, TRIAL_DAYS - usedDays), machineId };
}

ipcMain.handle('license:status', () => licenseStatus());
ipcMain.handle('license:machineId', () => getMachineId());
ipcMain.handle('license:activate', (_event, code) => {
  const machineId = getMachineId();
  const payload = verifySignedLicense(code);
  const err = licenseProblem(payload, machineId);
  if (err) return { ok: false, error: err };
  try { fs.writeFileSync(licenseFilePath(), String(code).trim()); }
  catch (e) { return { ok: false, error: 'Não foi possível salvar a licença.' }; }
  return { ok: true, status: licenseStatus() };
});

// AppUserModelID: OBRIGATÓRIO no Windows para que as notificações nativas
// sejam exibidas com o nome/ícone corretos. Definir antes de criar a janela.
const APP_ID = 'com.controledepausas.desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const HTML_FILE = 'Controle de Pausas.dc.html';
// A UI nova (view separada em app/, sem DataCosmos) é o PADRÃO. A antiga (.dc.html)
// fica como fallback de segurança: para voltar a ela, rode com PAUSA_OLD_UI=1.
const OLD_UI = /^(1|true|on|yes)$/i.test(String(process.env.PAUSA_OLD_UI || '').trim());
const ENTRY_FILE = OLD_UI ? HTML_FILE : path.join('app', 'index.html');
// Efeito "vidro" (acrylic) só no Windows 11 (build >= 22000). No Win10 o
// backgroundMaterial é ignorado, então usamos fundo sólido para não ficar transparente.
const isWin11 = process.platform === 'win32' && parseInt((require('os').release().split('.')[2] || '0'), 10) >= 22000;
const ICON_ICO = path.join(__dirname, 'assets', 'icon.ico');
const ICON_PNG = path.join(__dirname, 'assets', 'icon.png');

let mainWindow = null;
let tray = null;
let isQuiting = false;        // true somente quando o usuário escolhe "Sair"
let bgNoticeShown = false;    // avisa uma vez que segue em segundo plano

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: isWin11 ? '#00000000' : '#0c0d10', // transparente (Win11) p/ o acrylic aparecer
    backgroundMaterial: isWin11 ? 'acrylic' : 'none',   // Win11: desfoca o que está atrás (efeito vidro)
    title: 'Controle de Pausas',
    icon: ICON_ICO,
    show: false,
    autoHideMenuBar: true,
    // Remove a barra de título nativa do Windows, mantendo as bordas de
    // redimensionamento. A "barra" e os controles passam a ser o cabeçalho
    // do próprio app (arrastável) + os 3 botões customizados.
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Passa a flag do modo de teste ao preload (sandbox lê via process.argv).
      additionalArguments: FREE_TEST_MODE ? ['--pausa-test-mode'] : [],
      // Mantém timers/JS rodando em ritmo normal mesmo com a janela
      // escondida/minimizada — essencial para as pausas continuarem
      // sendo contadas e notificadas em segundo plano.
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, ENTRY_FILE));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Reforça o ícone da janela/barra de tarefas em runtime (HICON fresco). No modo
  // dev (electron.exe) o `icon:` acima nem sempre pega; setar via nativeImage garante.
  try { const img = nativeImage.createFromPath(ICON_PNG); if (!img.isEmpty()) mainWindow.setIcon(img); } catch (e) {}

  // Fechar a janela NÃO encerra o app: esconde na bandeja (comportamento
  // Discord/Steam). O app só sai de verdade pelo menu "Sair" da bandeja.
  mainWindow.on('close', (event) => {
    if (isQuiting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!bgNoticeShown) {
      bgNoticeShown = true;
      showNativeNotification(
        'Controle de Pausas continua em execução',
        'O app segue em segundo plano na bandeja do sistema. As pausas continuam sendo monitoradas.'
      );
    }
  });

  // Links externos abrem no navegador padrão.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function showWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  let img = nativeImage.createFromPath(ICON_ICO);
  if (img.isEmpty()) img = nativeImage.createFromPath(ICON_PNG);
  tray = new Tray(img);
  tray.setToolTip('Controle de Pausas');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Controle de Pausas', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  // Clique simples/duplo no ícone abre a janela.
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

// Dispara um toast NATIVO do Windows (mesma API usada pelo app via IPC).
function showNativeNotification(title, body) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: title || 'Controle de Pausas',
    body: body || '',
    icon: ICON_PNG,
    silent: false,
  });
  notification.on('click', () => showWindow());
  notification.show();
}

// Pedido de notificação vindo do renderer (app) via preload/IPC.
ipcMain.on('notify', (_event, payload) => {
  const { title, body } = payload || {};
  showNativeNotification(title, body);
});

// ---- Importação / Exportação de escala em Excel (.xlsx) ----
// Converte fração de dia do Excel (0.375) em "HH:MM".
function fracToHHMM(v) {
  if (typeof v !== 'number' || isNaN(v)) return null;
  const frac = v - Math.floor(v);
  const mins = Math.round(frac * 24 * 60);
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
// Import format the app accepts (row 1 = header, one operator per row):
//  A OPERADOR | B TURNO | C ENTRADA | D SAIDA | E SABADO ENTRADA | F SABADO SAIDA
//  G PAUSA 10 | H PAUSA 30 | I PAUSA 60 | J PAUSA 10 (2a)
// TURNO: integral | manha | tarde. Times as HH:MM (or Excel time). Blank = "-".
const IMPORT_HEADERS = ['OPERADOR', 'TURNO', 'ENTRADA', 'SAIDA', 'SABADO ENTRADA', 'SABADO SAIDA', 'PAUSA 10', 'PAUSA 30', 'PAUSA 60', 'PAUSA 10 (2a)'];

function normalizeTurno(raw) {
  const c = String(raw || '').trim().toUpperCase().charAt(0);
  return c === 'I' ? 'integral' : (c === 'T' ? 'tarde' : 'manha');
}
function parseSchedule(ws) {
  const merges = ws['!merges'] || [];
  const mergeMap = {};
  for (const m of merges) {
    const anchor = XLSX.utils.encode_cell(m.s);
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++)
        mergeMap[XLSX.utils.encode_cell({ r, c })] = anchor;
  }
  const getCell = (r, c) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    let cl = ws[ref];
    if ((!cl || cl.v == null) && mergeMap[ref]) cl = ws[mergeMap[ref]];
    return cl;
  };
  const str = (r, c) => { const cl = getCell(r, c); return cl && cl.v != null ? String(cl.v).trim() : ''; };
  const tm = (r, c) => {
    const cl = getCell(r, c);
    if (!cl || cl.v == null) return null;
    if (typeof cl.v === 'number') return fracToHHMM(cl.v);
    const s = String(cl.v).trim();
    return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5).padStart(5, '0') : null;
  };
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const startRow = str(0, 0).toUpperCase().indexOf('OPERADOR') === 0 ? 1 : 0;
  const rows = [];
  for (let r = startRow; r <= range.e.r; r++) {
    const name = str(r, 0);
    if (!name || name === '-') continue;
    rows.push({
      operador: name, turno: normalizeTurno(str(r, 1)),
      entrada: tm(r, 2), saida: tm(r, 3), sabEntrada: tm(r, 4), sabSaida: tm(r, 5),
      p10a: tm(r, 6), p30: tm(r, 7), p60: tm(r, 8), p10b: tm(r, 9),
    });
  }
  return rows;
}
function rowToArray(r) {
  return [r.operador, r.turno, r.entrada || '-', r.saida || '-', r.sabEntrada || '-', r.sabSaida || '-', r.p10a || '-', r.p30 || '-', r.p60 || '-', r.p10b || '-'];
}
function buildSheet(rows) {
  const aoa = [IMPORT_HEADERS.slice()];
  for (const r of rows) aoa.push(rowToArray(r));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 15 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 13 }];
  return ws;
}
// Example template: header + one sample row per shift kind.
function buildTemplate() {
  return buildSheet([
    { operador: 'MARIA (integral)', turno: 'integral', entrada: '08:00', saida: '17:02', sabEntrada: '-', sabSaida: '-', p10a: '10:00', p30: '-', p60: '12:00', p10b: '15:00' },
    { operador: 'JOAO (manha eq.1)', turno: 'manha', entrada: '08:00', saida: '14:20', sabEntrada: '08:00', sabSaida: '14:20', p10a: '10:00', p30: '12:00', p60: '-', p10b: '-' },
    { operador: 'ANA (manha eq.3)', turno: 'manha', entrada: '10:00', saida: '16:20', sabEntrada: '09:00', sabSaida: '15:20', p10a: '12:00', p30: '14:00', p60: '-', p10b: '-' },
    { operador: 'PEDRO (tarde)', turno: 'tarde', entrada: '14:20', saida: '20:40', sabEntrada: '08:00', sabSaida: '14:20', p10a: '16:20', p30: '18:30', p60: '-', p10b: '-' },
    { operador: 'LUCAS (tarde)', turno: 'tarde', entrada: '14:20', saida: '20:40', sabEntrada: '09:00', sabSaida: '15:20', p10a: '16:20', p30: '18:30', p60: '-', p10b: '-' },
  ]);
}

ipcMain.handle('import-excel', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar escala de pausas',
    properties: ['openFile'],
    filters: [{ name: 'Planilha Excel', extensions: ['xlsx', 'xls'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    const wb = XLSX.readFile(res.filePaths[0], { cellNF: false, cellText: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = parseSchedule(ws);
    return { fileName: path.basename(res.filePaths[0]), rows };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('export-excel', async (_event, payload) => {
  const rows = (payload && payload.rows) || [];
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar escala de pausas',
    defaultPath: 'escala_pausas.xlsx',
    filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(rows), 'Escala');
    XLSX.writeFile(wb, res.filePath);
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Saves the example import template so users can adapt it.
ipcMain.handle('download-template', async () => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar modelo de importação',
    defaultPath: 'modelo_importacao.xlsx',
    filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false };
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildTemplate(), 'Modelo');
    XLSX.writeFile(wb, res.filePath);
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Abre links externos / email no app padrão do sistema (usado nos créditos).
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
});

// ---- Histórico: arquivo LOCAL protegido em appData (userData), lido/escrito
// somente pelo app. Fica em %APPDATA%/<app>/history.json. ----
const historyFilePath = () => path.join(app.getPath('userData'), 'history.json');
ipcMain.handle('history:load', () => {
  try { const raw = fs.readFileSync(historyFilePath(), 'utf8'); const d = JSON.parse(raw); return Array.isArray(d) ? d : []; }
  catch (e) { return []; }
});
ipcMain.handle('history:save', (_event, data) => {
  try { fs.writeFileSync(historyFilePath(), JSON.stringify(Array.isArray(data) ? data : []), 'utf8'); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ---- Operadores: arquivo local em appData (persistem entre execuções). O app
// instalado nasce SEM operadores; o que o usuário cadastra/importa fica aqui. ----
const operatorsFilePath = () => path.join(app.getPath('userData'), 'operators.json');
ipcMain.handle('operators:load', () => {
  try { const d = JSON.parse(fs.readFileSync(operatorsFilePath(), 'utf8')); return Array.isArray(d) ? d : []; }
  catch (e) { return []; }
});
ipcMain.handle('operators:save', (_event, data) => {
  try { fs.writeFileSync(operatorsFilePath(), JSON.stringify(Array.isArray(data) ? data : []), 'utf8'); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Controles da janela (barra de título customizada) acionados pelos 3 botões.
ipcMain.on('win-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
// Fechar segue a regra de "segundo plano": esconde na bandeja (não encerra).
ipcMain.on('win-close', () => { if (mainWindow) mainWindow.close(); });

// Instância única: abrir de novo apenas foca a janela existente.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    getFirstRun(); // marca o início do período de avaliação já na 1ª execução
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });
}

app.on('before-quit', () => { isQuiting = true; });

// NÃO encerra quando todas as janelas fecham: o app vive na bandeja.
// (A saída acontece pelo menu "Sair" -> isQuiting = true -> app.quit().)
app.on('window-all-closed', () => {
  // intencionalmente vazio (app em segundo plano)
});
