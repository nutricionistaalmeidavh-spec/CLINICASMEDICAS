const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  salvarBackup: (data, password) => ipcRenderer.invoke('salvar-backup', data, password),
  abrirBackup: (password) => ipcRenderer.invoke('abrir-backup', password),
  confirmarRestauracaoAnexos: (sessionId) => ipcRenderer.invoke('confirmar-restauracao-anexos', sessionId),
  cancelarRestauracaoAnexos: (sessionId) => ipcRenderer.invoke('cancelar-restauracao-anexos', sessionId),
  reverterRestauracaoAnexos: (snapshotPath, hadPrevious) => ipcRenderer.invoke('reverter-restauracao-anexos', snapshotPath, hadPrevious),
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
  salvarBanco: (data) => ipcRenderer.invoke('salvar-banco', data),
  dataIsolation: {
    loadClinic: () => ipcRenderer.invoke('data-isolation:load-clinic'),
    saveClinic: (data) => ipcRenderer.invoke('data-isolation:save-clinic', data),
    authenticate: (credentials) => ipcRenderer.invoke('data-isolation:authenticate', credentials),
    loadProfessional: (sessionToken) => ipcRenderer.invoke('data-isolation:load-professional', sessionToken),
    saveProfessional: (sessionToken, data) => ipcRenderer.invoke('data-isolation:save-professional', sessionToken, data),
    endSession: (sessionToken) => ipcRenderer.invoke('data-isolation:end-session', sessionToken)
  },
  clinicNetwork: {
    status: () => ipcRenderer.invoke('clinic-network:status'),
    startHub: () => ipcRenderer.invoke('clinic-network:start-hub'),
    stopHub: () => ipcRenderer.invoke('clinic-network:stop-hub'),
    createPairing: () => ipcRenderer.invoke('clinic-network:create-pairing'),
    discover: () => ipcRenderer.invoke('clinic-network:discover'),
    pair: (input) => ipcRenderer.invoke('clinic-network:pair', input),
    login: (credentials) => ipcRenderer.invoke('clinic-network:login', credentials),
    sync: () => ipcRenderer.invoke('clinic-network:sync'),
    mutate: (input) => ipcRenderer.invoke('clinic-network:mutate', input),
    disconnect: () => ipcRenderer.invoke('clinic-network:disconnect'),
    onHubMutationApplied: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, change) => listener(change);
      ipcRenderer.on('clinic-network:hub-mutation-applied', handler);
      return () => ipcRenderer.removeListener('clinic-network:hub-mutation-applied', handler);
    }
  },
  updater: {
    state: () => ipcRenderer.invoke('updater:state'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStateChanged: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('updater:state-changed', handler);
      return () => ipcRenderer.removeListener('updater:state-changed', handler);
    }
  }
});