let currentUser = null;
let selectedRepasseId = null;
let selectedPepPacienteId = null;
let agendaDataAtual = new Date();

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init();
    if (!DB.isReady()) throw new Error('Banco não ficou pronto');
    setupNavigation();
    setupTabs();
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
