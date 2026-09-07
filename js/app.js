let currentUser = null;
let selectedRepasseId = null;
let selectedPepPacienteId = null;
let agendaDataAtual = new Date();

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function ensureFormUxScript() {
  if (window.PlennusFormUX) return Promise.resolve();
  const existing = document.querySelector('script[data-plennus-form-ux]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/core/form-ux.js';
    script.dataset.plennusFormUx = '1';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Não foi possível carregar a camada de formulários.')), { once: true });
    document.head.appendChild(script);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init();
    if (!DB.isReady()) throw new Error('Banco não ficou pronto');
    await window.PlennusMigrations?.ensurePlatformSchema(DB, window.electronAPI, window.PlennusAudit);
    window.PlennusAudit?.installDbAudit(DB);
    await ensureFormUxScript();
    window.PlennusFormUX?.setup();
    window.PlennusShell?.setupShell();
    window.PlennusImports?.ensureImportUi();
    window.PlennusAuditView?.ensureAuditUi();
    setupNavigation();
    setupTabs();
    window.PlennusGlobalSearch?.setupGlobalSearch();
    if (window.__initialPassword) {
      alert(`Primeiro acesso criado. Usuário: admin\nSenha temporária: ${window.__initialPassword}\nGuarde-a em local seguro.`);
    }
    document.getElementById('login-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') fazerLogin();
    });
  } catch (err) {
    alert('Erro ao inicializar banco de dados: ' + err.message);
    console.error(err);
  }
});
