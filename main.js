const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Desativa aceleração por hardware para evitar logs de GPU e falhas gráficas no Windows
app.disableHardwareAcceleration();

let mainWindow;
const DB_FILENAME = 'plennus-clinic.db.enc';

function databasePath() {
  return path.join(app.getPath('userData'), DB_FILENAME);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 750,
    minWidth: 1100,
    minHeight: 650,
    backgroundColor: '#F5F5F5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    title: 'Plennus Clinic'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools(); // DEBUG TEMPORÁRIO — remover após diagnóstico
  });

  // Se ready-to-show demorar >5s, mostra de qualquer forma para debug
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.webContents.openDevTools();
    }
  }, 5000);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Backup / Restore
ipcMain.handle('salvar-backup', async (event, data) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Backup',
    defaultPath: `backup_plennus_${new Date().toISOString().slice(0,10)}.db`,
    filters: [{ name: 'Banco de Dados', extensions: ['db'] }]
  });
  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(data));
    return { ok: true, path: filePath };
  }
  return { ok: false };
});

ipcMain.handle('abrir-backup', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar Backup',
    filters: [{ name: 'Banco de Dados', extensions: ['db'] }],
    properties: ['openFile']
  });
  if (filePaths && filePaths[0]) {
    const data = fs.readFileSync(filePaths[0]);
    return { ok: true, data: Array.from(data) };
  }
  return { ok: false };
});

ipcMain.handle('salvar-documento', async (event, conteudo, nomePadrao) => {
  if (typeof conteudo !== 'string' || conteudo.length > 5_000_000) return { ok: false };
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Documento',
    defaultPath: nomePadrao || 'documento.txt',
    filters: [
      { name: 'Texto', extensions: ['txt'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  });
  if (filePath) {
    fs.writeFileSync(filePath, conteudo, 'utf-8');
    return { ok: true, path: filePath };
  }
  return { ok: false };
});

ipcMain.handle('gerar-pdf', async (event, htmlContent, nomePadrao) => {
  if (typeof htmlContent !== 'string' || htmlContent.length > 5_000_000) return { ok: false };
  let printWin = null;
  try {
    printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 }
    });

    printWin.close();
    printWin = null;

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Documento em PDF',
      defaultPath: nomePadrao || `documento_${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, pdfBuffer);
      return { ok: true, path: filePath };
    }
    return { ok: false, cancelado: true };
  } catch (err) {
    if (printWin) printWin.close();
    console.error('Erro ao gerar PDF:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('imprimir-documento', async (event, htmlContent) => {
  if (typeof htmlContent !== 'string' || htmlContent.length > 5_000_000) return { ok: false };
  let printWin = null;
  try {
    printWin = new BrowserWindow({
      width: 800,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWin.webContents.print({ silent: false, printBackground: true }, () => {
      if (printWin) printWin.close();
    });

    return { ok: true };
  } catch (err) {
    if (printWin) printWin.close();
    console.error('Erro ao imprimir documento:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('abrir-url-externa', async (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      console.error('Erro ao abrir URL:', e);
      return { ok: false };
    }
  }
  return { ok: false };
});

ipcMain.handle('carregar-banco', () => {
  const filePath = databasePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const encrypted = fs.readFileSync(filePath);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do Windows indisponível');
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    console.error('Não foi possível ler o banco local:', error);
    return null;
  }
});

ipcMain.handle('salvar-banco', (event, data) => {
  if (!Array.isArray(data) || data.length > 50_000_000 || !safeStorage.isEncryptionAvailable()) return { ok: false };
  try {
    fs.writeFileSync(databasePath(), safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
    return { ok: true };
  } catch (error) {
    console.error('Não foi possível salvar o banco local:', error);
    return { ok: false };
  }
});
