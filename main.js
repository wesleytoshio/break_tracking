// Processo principal do Electron.
// - Cria a janela do app
// - Notificações NATIVAS do Windows (Notification -> ToastNotification)
// - Roda em segundo plano na bandeja do sistema (igual Discord/Steam):
//   fechar a janela apenas a esconde; o app continua vivo e notificando.
const { app, BrowserWindow, ipcMain, Notification, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

// AppUserModelID: OBRIGATÓRIO no Windows para que as notificações nativas
// sejam exibidas com o nome/ícone corretos. Definir antes de criar a janela.
const APP_ID = 'com.controledepausas.desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const HTML_FILE = 'Controle de Pausas.dc.html';
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
    backgroundColor: '#0c0d10',
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
      // Mantém timers/JS rodando em ritmo normal mesmo com a janela
      // escondida/minimizada — essencial para as pausas continuarem
      // sendo contadas e notificadas em segundo plano.
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, HTML_FILE));
  mainWindow.once('ready-to-show', () => mainWindow.show());

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
