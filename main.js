const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseXlsx } = require('./js/core/xlsx-node');

app.disableHardwareAcceleration();

let mainWindow;
let lastPreMigrationBackup = null;
const DB_FILENAME = 'plennus-clinic.db.enc';
const CLINICAL_FILE_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx'
]);
const DOCUMENT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_DOCUMENT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_BYTES = 12 * 1024 * 1024;

function databasePath() {
  return path.join(app.getPath('userData'), DB_FILENAME);
}

function backupDirectory() {
  return path.join(app.getPath('userData'), 'backups');
}

function clinicalMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.csv': 'text/csv',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return types[ext] || null;
}

function isAllowedClinicalFile(filePath) {
  return typeof filePath === 'string'
    && path.isAbsolute(filePath)
    && CLINICAL_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function createPreMigrationBackup(fromVersion = 0) {
  if (lastPreMigrationBackup) return lastPreMigrationBackup;
  const source = databasePath();
  if (!fs.existsSync(source)) return { ok: true, skipped: true };
  try {
    const dir = backupDirectory();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(dir, `pre-migration-v${Number(fromVersion) || 0}-${stamp}.db.enc`);
    fs.copyFileSync(source, target);
    const backups = fs.readdirSync(dir)
      .filter(name => /^pre-migration-v.*\.db\.enc$/.test(name))
      .map(name => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    backups.slice(10).forEach(item => { try { fs.unlinkSync(item.full); } catch (_) { /* no-op */ } });
    lastPreMigrationBackup = { ok: true, path: target };
    return lastPreMigrationBackup;
  } catch (error) {
    console.error('Falha ao criar backup pré-migração:', error);
    lastPreMigrationBackup = { ok: false, error: error.message };
    return lastPreMigrationBackup;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 750, minWidth: 1100, minHeight: 650,
    backgroundColor: '#F5F5F5',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    show: false, title: 'Plennus Clinic'
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show(); }, 5000);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('salvar-backup', async (event, data) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Backup', defaultPath: `backup_plennus_${new Date().toISOString().slice(0,10)}.db`,
    filters: [{ name: 'Banco de Dados', extensions: ['db'] }]
  });
  if (filePath) { fs.writeFileSync(filePath, Buffer.from(data)); return { ok: true, path: filePath }; }
  return { ok: false };
});

ipcMain.handle('abrir-backup', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar Backup', filters: [{ name: 'Banco de Dados', extensions: ['db'] }], properties: ['openFile']
  });
  if (filePaths && filePaths[0]) return { ok: true, data: Array.from(fs.readFileSync(filePaths[0])) };
  return { ok: false };
});

ipcMain.handle('criar-backup-pre-migracao', (event, meta = {}) => createPreMigrationBackup(meta.fromVersion));

ipcMain.handle('selecionar-arquivo-importacao', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar arquivo de pacientes', properties: ['openFile'],
    filters: [{ name: 'Planilhas de pacientes', extensions: ['csv', 'xlsx'] }]
  });
  if (canceled || !filePaths?.[0]) return { ok: false, cancelado: true };
  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  if (!['.csv', '.xlsx'].includes(ext) || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo inválido.' };
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMPORT_BYTES) return { ok: false, error: 'Arquivo excede o limite de 12 MB.' };
  try {
    const data = fs.readFileSync(filePath);
    if (ext === '.csv') return { ok: true, type: 'csv', name: path.basename(filePath), text: data.toString('utf8') };
    return { ok: true, type: 'xlsx', name: path.basename(filePath), rows: parseXlsx(data, 5000) };
  } catch (error) {
    console.error('Erro ao ler importação:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('selecionar-arquivo-clinico', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar arquivo clínico', properties: ['openFile'],
    filters: [{ name: 'Documentos e imagens clínicas', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx'] }]
  });
  if (canceled || !filePaths?.[0]) return { ok: false, cancelado: true };
  const filePath = filePaths[0];
  if (!isAllowedClinicalFile(filePath) || !fs.existsSync(filePath)) return { ok: false };
  return { ok: true, path: filePath, name: path.basename(filePath), mimeType: clinicalMimeType(filePath) };
});

ipcMain.handle('abrir-arquivo-clinico', async (event, filePath) => {
  if (!isAllowedClinicalFile(filePath) || !fs.existsSync(filePath)) return { ok: false };
  try {
    const error = await shell.openPath(filePath);
    return error ? { ok: false, error } : { ok: true };
  } catch (error) {
    console.error('Erro ao abrir arquivo clínico:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('ler-imagem-clinica-para-documento', async (event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !fs.existsSync(filePath)) return { ok: false };
  const ext = path.extname(filePath).toLowerCase();
  if (!DOCUMENT_IMAGE_EXTENSIONS.has(ext)) return { ok: false };
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > MAX_DOCUMENT_IMAGE_BYTES) return { ok: false, error: 'Imagem excede o limite permitido.' };
  const mime = clinicalMimeType(filePath);
  const data = fs.readFileSync(filePath).toString('base64');
  return { ok: true, name: path.basename(filePath), dataUrl: `data:${mime};base64,${data}` };
});

ipcMain.handle('salvar-documento', async (event, conteudo, nomePadrao) => {
  if (typeof conteudo !== 'string' || conteudo.length > 5_000_000) return { ok: false };
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Documento', defaultPath: nomePadrao || 'documento.txt',
    filters: [{ name: 'Texto', extensions: ['txt'] }, { name: 'Todos', extensions: ['*'] }]
  });
  if (filePath) { fs.writeFileSync(filePath, conteudo, 'utf-8'); return { ok: true, path: filePath }; }
  return { ok: false };
});

ipcMain.handle('gerar-pdf', async (event, htmlContent, nomePadrao) => {
  if (typeof htmlContent !== 'string' || htmlContent.length > 5_000_000) return { ok: false };
  let printWin = null;
  try {
    printWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true, pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.5, right: 0.5 }
    });
    printWin.close(); printWin = null;
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Documento em PDF', defaultPath: nomePadrao || `documento_${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
    });
    if (filePath) { fs.writeFileSync(filePath, pdfBuffer); return { ok: true, path: filePath }; }
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
    printWin = new BrowserWindow({ width: 800, height: 900, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    printWin.webContents.print({ silent: false, printBackground: true }, () => { if (printWin) printWin.close(); });
    return { ok: true };
  } catch (err) {
    if (printWin) printWin.close();
    console.error('Erro ao imprimir documento:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('abrir-url-externa', async (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    try { await shell.openExternal(url); return { ok: true }; }
    catch (e) { console.error('Erro ao abrir URL:', e); return { ok: false }; }
  }
  return { ok: false };
});

ipcMain.handle('carregar-banco', () => {
  const filePath = databasePath();
  if (!fs.existsSync(filePath)) return null;
  const backup = createPreMigrationBackup(0);
  if (!backup.ok) console.error('Backup de segurança não pôde ser criado antes de carregar o banco:', backup.error);
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
