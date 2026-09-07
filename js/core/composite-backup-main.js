const fs = require('node:fs');
const path = require('node:path');
const backupFormat = require('./backup-format');
const clinicalStorage = require('./professional-clinical-storage');

const MAX_ENCRYPTED_DATABASE_BYTES = 300 * 1024 * 1024;
const MAX_CLINICAL_FILE_BYTES = 128 * 1024 * 1024;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,96}$/;

function ensureEncryption(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('Criptografia do sistema operacional indisponível.');
}

function readEncryptedDatabase(filePath, safeStorage) {
  ensureEncryption(safeStorage);
  if (!fs.existsSync(filePath)) throw new Error(`Banco local ausente: ${path.basename(filePath)}`);
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > MAX_ENCRYPTED_DATABASE_BYTES) {
    throw new Error('Arquivo de banco criptografado inválido.');
  }
  let bytes;
  try {
    const plaintext = safeStorage.decryptString(fs.readFileSync(filePath));
    const parsed = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) throw new Error('payload');
    bytes = Buffer.from(parsed);
  } catch (_) {
    throw new Error('Banco local criptografado inválido ou ilegível.');
  }
  return backupFormat.validateSqliteBytes(bytes);
}

function mimeForFile(filePath) {
  return clinicalStorage.clinicalMimeType(filePath) || 'application/octet-stream';
}

function readClinicalFiles(root) {
  if (!fs.existsSync(root)) return [];
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Diretório de arquivos clínicos inválido.');
  const files = [];

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) throw new Error('Link simbólico não é permitido no armazenamento clínico.');
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !stat.isFile()) throw new Error('Entrada inválida no diretório clínico.');
      if (stat.size < 0 || stat.size > MAX_CLINICAL_FILE_BYTES) throw new Error('Arquivo clínico excede o limite permitido.');
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      const normalized = backupFormat.normalizeRelativePath(relativePath);
      const data = fs.readFileSync(fullPath);
      files.push({ relativePath: normalized, name: path.basename(fullPath), mimeType: mimeForFile(fullPath), data });
    }
  }

  walk(root);
  return files;
}

function exportCompositeInventory({ userData, safeStorage, clinicUid } = {}) {
  ensureEncryption(safeStorage);
  const base = path.resolve(String(userData || ''));
  if (!base) throw new Error('Diretório de dados inválido.');
  const uid = String(clinicUid || '').trim();
  if (!SAFE_ID.test(uid)) throw new Error('Identificador da clínica inválido.');

  const clinicDatabase = readEncryptedDatabase(path.join(base, 'data', 'clinic', 'clinic.db.enc'), safeStorage);
  const professionalsRoot = path.join(base, 'data', 'professionals');
  const professionals = [];

  if (fs.existsSync(professionalsRoot)) {
    const rootStat = fs.lstatSync(professionalsRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Diretório de profissionais inválido.');
    const entries = fs.readdirSync(professionalsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const professionalRoot = path.join(professionalsRoot, entry.name);
      const stat = fs.lstatSync(professionalRoot);
      if (entry.isSymbolicLink() || stat.isSymbolicLink() || !entry.isDirectory() || !stat.isDirectory()) {
        throw new Error('Entrada inválida no diretório de profissionais.');
      }
      if (!SAFE_ID.test(entry.name)) throw new Error('Identificador profissional inválido no diretório local.');
      const databasePath = path.join(professionalRoot, 'clinical.db.enc');
      const filesPath = path.join(professionalRoot, 'files');
      if (!fs.existsSync(databasePath)) {
        const hasFiles = fs.existsSync(filesPath) && fs.readdirSync(filesPath).length > 0;
        if (hasFiles) throw new Error('Diretório profissional contém arquivos sem banco clínico correspondente.');
        continue;
      }
      professionals.push({
        professionalUid: entry.name,
        database: readEncryptedDatabase(databasePath, safeStorage),
        files: readClinicalFiles(filesPath)
      });
    }
  }

  return { clinicUid: uid, clinicDatabase, professionals };
}

module.exports = {
  MAX_ENCRYPTED_DATABASE_BYTES,
  MAX_CLINICAL_FILE_BYTES,
  readEncryptedDatabase,
  readClinicalFiles,
  exportCompositeInventory
};
