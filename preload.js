const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  salvarBackup: (data) => ipcRenderer.invoke('salvar-backup', data),
  abrirBackup: () => ipcRenderer.invoke('abrir-backup'),
  salvarDocumento: (conteudo, nome) => ipcRenderer.invoke('salvar-documento', conteudo, nome),
  gerarPdf: (html, nome) => ipcRenderer.invoke('gerar-pdf', html, nome),
  imprimirDocumento: (html) => ipcRenderer.invoke('imprimir-documento', html),
  abrirUrlExterna: (url) => ipcRenderer.invoke('abrir-url-externa', url),
  carregarBanco: () => ipcRenderer.invoke('carregar-banco'),
  salvarBanco: (data) => ipcRenderer.invoke('salvar-banco', data)
});
