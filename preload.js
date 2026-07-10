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
});
