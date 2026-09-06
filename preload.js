const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  salvarBackup: (data, password) => ipcRenderer.invoke('salvar-backup', data, password),
  abrirBackup: (password) => ipcRenderer.invoke('abrir-backup', password),
  criarBackupPreMigracao: (meta) => ipcRenderer.invoke('criar-backup-pre-migracao', meta),
  selecionarArquivoImportacao: () => ipcRenderer.invoke('selecionar-arquivo-importacao'),
  salvarDocumento: (conteudo, nome) => ipcRenderer.invoke('salvar-documento', conteudo, nome),
  gerarPdf: (html, nome) => ipcRenderer.invoke('gerar-pdf', html, nome),
  imprimirDocumento: (html) => ipcRenderer.invoke('imprimir-documento', html),
  abrirUrlExterna: (url) => ipcRenderer.invoke('abrir-url-externa', url),
  selecionarArquivoClinico: () => ipcRenderer.invoke('selecionar-arquivo-clinico'),
  abrirArquivoClinico: (filePath) => ipcRenderer.invoke('abrir-arquivo-clinico', filePath),
  lerImagemClinicaParaDocumento: (filePath) => ipcRenderer.invoke('ler-imagem-clinica-para-documento', filePath),
  carregarBanco: () => ipcRenderer.invoke('carregar-banco'),
  salvarBanco: (data) => ipcRenderer.invoke('salvar-banco', data)
});
