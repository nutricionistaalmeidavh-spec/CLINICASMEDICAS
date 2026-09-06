function createUpdaterService({ app, autoUpdater, getWindow = () => null, logger = console, platform = process.platform }) {
  if (!app || !autoUpdater) throw new Error('Updater requer app e autoUpdater.');

  let stateValue = {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    error: null,
    supported: Boolean(app.isPackaged && platform === 'win32')
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  function snapshot() {
    return { ...stateValue };
  }

  function patch(next) {
    stateValue = { ...stateValue, ...next };
    const window = getWindow?.();
    if (window && !window.isDestroyed?.()) {
      window.webContents?.send?.('updater:state-changed', snapshot());
    }
    return snapshot();
  }

  autoUpdater.on('checking-for-update', () => patch({ status: 'checking', error: null }));
  autoUpdater.on('update-available', info => patch({
    status: 'available',
    availableVersion: info?.version || null,
    progress: null,
    error: null
  }));
  autoUpdater.on('update-not-available', () => patch({
    status: 'current',
    availableVersion: null,
    progress: null,
    error: null
  }));
  autoUpdater.on('download-progress', progress => patch({
    status: 'downloading',
    progress: Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0))),
    error: null
  }));
  autoUpdater.on('update-downloaded', info => patch({
    status: 'downloaded',
    availableVersion: info?.version || stateValue.availableVersion,
    progress: 100,
    error: null
  }));
  autoUpdater.on('error', error => {
    logger.error?.('Desktop updater error', error);
    patch({
      status: 'error',
      error: error?.message || 'Não foi possível verificar a atualização.'
    });
  });

  async function check() {
    if (!stateValue.supported) return patch({ status: 'unsupported', error: null });
    await autoUpdater.checkForUpdates();
    return snapshot();
  }

  async function download() {
    if (!stateValue.supported) return patch({ status: 'unsupported', error: null });
    if (!['available', 'downloading'].includes(stateValue.status)) {
      throw new Error('Nenhuma atualização disponível para download.');
    }
    patch({ status: 'downloading', progress: stateValue.progress || 0, error: null });
    await autoUpdater.downloadUpdate();
    return snapshot();
  }

  function install() {
    if (stateValue.status !== 'downloaded') {
      throw new Error('A atualização ainda não terminou de baixar.');
    }
    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  function start(delayMs = 8000) {
    if (!stateValue.supported) return patch({ status: 'unsupported' });
    const timer = setTimeout(() => {
      check().catch(error => logger.error?.('Automatic update check failed', error));
    }, delayMs);
    timer.unref?.();
    return snapshot();
  }

  return { state: snapshot, check, download, install, start };
}

module.exports = { createUpdaterService };
