// Preload — executado num contexto isolado e seguro (contextIsolation: true).
// Expõe apenas uma API mínima para o renderer disparar notificações nativas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Envia o pedido de notificação ao processo principal, que usa a API
  // nativa do Electron (Notification) para exibir o toast do Windows.
  notify: (title, body, kind) => ipcRenderer.send('notify', { title, body, kind }),

  // Controles da janela (barra de título customizada).
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close: () => ipcRenderer.send('win-close'),

  // Importar/exportar a escala em Excel (.xlsx) via diálogos nativos.
  importExcel: () => ipcRenderer.invoke('import-excel'),
  exportExcel: (payload) => ipcRenderer.invoke('export-excel', payload),
  downloadTemplate: () => ipcRenderer.invoke('download-template'),

  // Abre link/email no app padrão do sistema (tela de créditos).
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Modo de teste livre (só validar notificações) — habilitado por env var no
  // processo principal, repassado via additionalArguments.
  freeTestMode: process.argv.includes('--pausa-test-mode'),

  // Licenciamento offline.
  licenseStatus: () => ipcRenderer.invoke('license:status'),
  licenseMachineId: () => ipcRenderer.invoke('license:machineId'),
  licenseActivate: (code) => ipcRenderer.invoke('license:activate', code),
});
