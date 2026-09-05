let currentUser = null;
let selectedRepasseId = null;
let selectedPepPacienteId = null;
let agendaDataAtual = new Date();

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init();
    if (!DB.isReady()) throw new Error("Banco não ficou pronto");
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

// ========== LOGIN & RBAC ==========
async function fazerLogin() {
  if (!window.DB || !DB.isReady()) return alert('Banco de dados ainda não está pronto. Aguarde ou recarregue (Ctrl+R).');
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  if (!user || !pass) return alert('Preencha usuário e senha.');

  const rows = DB.query('SELECT * FROM usuarios WHERE usuario=? AND ativo=1', [user]);
  if (rows.length && rows[0].senha === pass) {
    DB.run('UPDATE usuarios SET senha=? WHERE id=?', [await window.hashPassword(pass), rows[0].id]);
    rows[0].senha = await window.hashPassword(pass);
  }
  const passwordHash = await window.hashPassword(pass);
  if (rows.length && rows[0].senha !== passwordHash) rows.length = 0;
  if (rows.length === 0) return alert('Usuário ou senha inválidos.');

  currentUser = rows[0];
  const nivel = currentUser.nivel || 'admin';
  const roleMap = { admin: 'Administrador', medico: 'Médico / Profissional', recepcao: 'Recepção' };
  const roleClass = { admin: 'badge-admin', medico: 'badge-medico', recepcao: 'badge-recepcao' };

  document.getElementById('user-display').textContent = `Olá, ${currentUser.nome}`;
  const badgeEl = document.getElementById('user-role-badge');
  if (badgeEl) {
    badgeEl.innerHTML = `<span class="badge-role ${roleClass[nivel] || 'badge-admin'}">${roleMap[nivel] || nivel}</span>`;
  }

  aplicarPermissoesMenu(nivel);

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';

  // Redirecionamento inteligente com base no perfil
  if (nivel === 'medico') {
    navegar('agenda');
  } else if (nivel === 'recepcao') {
    navegar('agenda');
  } else {
    navegar('dashboard');
  }
}

function aplicarPermissoesMenu(nivel) {
  document.querySelectorAll('.menu-item').forEach(item => {
    const rolesAttr = item.dataset.roles || 'admin,medico,recepcao';
    const allowed = rolesAttr.split(',').map(r => r.trim());
    if (allowed.includes(nivel)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });

  // Esconder gerenciamento de usuários de quem não for admin
  const userManageCard = document.getElementById('card-usuarios-gestao');
  if (userManageCard) {
    userManageCard.style.display = (nivel === 'admin') ? 'block' : 'none';
  }
}

function fazerLogout() {
  if (confirm('Deseja realmente sair?')) {
    currentUser = null;
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  }
}

// ========== NAVIGATION ==========
function setupNavigation() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navegar(item.dataset.page);
    });
  });
}

function navegar(page) {
  // Ativa o item correspondente no menu
  document.querySelectorAll('.menu-item').forEach(item => {
    if (item.dataset.page === page) item.classList.add('active');
    else item.classList.remove('active');
  });

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.add('active');

  if (page === 'dashboard') carregarDashboard();
  if (page === 'agenda') { carregarSelectsAgenda(); atualizarInputsDataAgenda(); recarregarVisaoAgendaAtual(); carregarGrade(); }
  if (page === 'prontuario') carregarSelectsPep();
  if (page === 'pacientes') carregarPacientes();
  if (page === 'profissionais') carregarProfissionais();
  if (page === 'convenios') { carregarConvenios(); carregarProcedimentos(); }
  if (page === 'documentos') { carregarSelectsDocs(); carregarTemplate(); }
  if (page === 'caixa') carregarCaixa();
  if (page === 'repasses') { carregarSelectsRepasse(); carregarRepasses(); }
  if (page === 'configuracoes') { carregarConfig(); carregarUsuariosConfig(); }
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.page');
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetContent = parent.querySelector('#tab-' + btn.dataset.tab);
      if (targetContent) targetContent.classList.add('active');

      if (parent && parent.id === 'page-agenda') {
        recarregarVisaoAgendaAtual();
      }
    });
  });
}

// ========== UTILS ==========
function formatMoney(v) {
  return 'R$ ' + (v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0;
  if (d !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0;
  return d === parseInt(cpf[10]);
}

function hoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function agoraHora() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function calcularIdade(dataNasc) {
  if (!dataNasc) return 'Idade não informada';
  let partes = [];
  if (dataNasc.includes('/')) {
    partes = dataNasc.split('/');
    if (partes.length === 3) {
      const d = parseInt(partes[0]), m = parseInt(partes[1]) - 1, y = parseInt(partes[2]);
      const nasc = new Date(y, m, d);
      const diff = Date.now() - nasc.getTime();
      const ageDate = new Date(diff);
      const anos = Math.abs(ageDate.getUTCFullYear() - 1970);
      return `${anos} anos (${dataNasc})`;
    }
  }
  return dataNasc;
}

function obterDadosClinica() {
  const rows = DB.query('SELECT * FROM configuracoes');
  const cfg = {};
  rows.forEach(r => cfg[r.chave] = r.valor);
  return {
    nome: cfg.nome_clinica || 'Plennus Clinic',
    endereco: cfg.endereco_clinica || 'Endereço da Clínica',
    telefone: cfg.telefone_clinica || '(00) 0000-0000',
    cidade: cfg.cidade_clinica || 'Cidade - UF',
    cnpj: cfg.cnpj_clinica || '00.000.000/0001-00',
    cor: cfg.cor_primaria || '#C41E3A'
  };
}

// ========== DASHBOARD ==========
function carregarDashboard() {
  const pac = DB.query('SELECT COUNT(*) as c FROM pacientes WHERE ativo=1')[0].c;
  const prof = DB.query('SELECT COUNT(*) as c FROM profissionais WHERE ativo=1')[0].c;
  const cons = DB.query('SELECT COUNT(*) as c FROM agenda WHERE data=?', [hoje()])[0].c;
  const saldoRow = DB.query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) as s FROM caixa`)[0];
  document.getElementById('stat-pacientes').textContent = pac;
  document.getElementById('stat-profissionais').textContent = prof;
  document.getElementById('stat-consultas').textContent = cons;
  document.getElementById('stat-saldo').textContent = formatMoney(saldoRow.s);
}

// ========== PACIENTES ==========
function carregarPacientes() {
  const rows = DB.query('SELECT * FROM pacientes WHERE ativo=1 ORDER BY nome');
  const tbody = document.getElementById('tabela-pacientes');
  tbody.innerHTML = rows.map(r => {
    const alergiaHtml = r.alergias 
      ? `<span style="color:#C62828;font-weight:700;">⚠️ ${escapeHTML(r.alergias)}</span>` 
      : `<span class="text-muted">Nenhuma</span>`;
    return `
      <tr onclick="selecionarPaciente(${r.id})" style="cursor:pointer">
        <td>${r.id}</td>
        <td><strong>${escapeHTML(r.nome)}</strong></td>
        <td>${escapeHTML(r.cpf || '-')}</td>
        <td>${escapeHTML(r.celular || r.telefone || '-')}</td>
        <td>${alergiaHtml}</td>
        <td>
          <button class="btn btn-info btn-sm" onclick="event.stopPropagation();abrirProntuarioPaciente(${r.id})">PEP 📋</button>
        </td>
      </tr>`;
  }).join('');
}

function selecionarPaciente(id) {
  const r = DB.query('SELECT * FROM pacientes WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('pac-id').value = r.id;
  document.getElementById('pac-nome').value = r.nome || '';
  document.getElementById('pac-cpf').value = r.cpf || '';
  document.getElementById('pac-nasc').value = r.data_nascimento || '';
  document.getElementById('pac-celular').value = r.celular || '';
  document.getElementById('pac-telefone').value = r.telefone || '';
  document.getElementById('pac-email').value = r.email || '';
  document.getElementById('pac-cep').value = r.cep || '';
  document.getElementById('pac-logradouro').value = r.logradouro || '';
  document.getElementById('pac-numero').value = r.numero || '';
  document.getElementById('pac-bairro').value = r.bairro || '';
  document.getElementById('pac-cidade').value = r.cidade || '';
  document.getElementById('pac-uf').value = r.uf || '';
  document.getElementById('pac-sexo').value = r.sexo || '';
  document.getElementById('pac-tipo-sanguineo').value = r.tipo_sanguineo || '';
  document.getElementById('pac-alergias').value = r.alergias || '';
  document.getElementById('pac-comorbidades').value = r.comorbidades || '';
  document.getElementById('pac-medicamentos').value = r.medicamentos_continuos || '';
  document.getElementById('pac-obs').value = r.observacoes || '';
}

function limparPaciente() {
  ['pac-id','pac-nome','pac-cpf','pac-nasc','pac-celular','pac-telefone','pac-email',
   'pac-cep','pac-logradouro','pac-numero','pac-bairro','pac-cidade','pac-uf',
   'pac-sexo','pac-tipo-sanguineo','pac-alergias','pac-comorbidades','pac-medicamentos','pac-obs']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
}

function salvarPaciente() {
  const nome = document.getElementById('pac-nome').value.trim();
  if (!nome) return alert('Nome do paciente é obrigatório.');
  const cpf = document.getElementById('pac-cpf').value.trim();
  if (cpf && !validarCPF(cpf)) return alert('CPF inválido.');

  const id = document.getElementById('pac-id').value;
  const dados = [
    nome, cpf, document.getElementById('pac-nasc').value,
    document.getElementById('pac-celular').value, document.getElementById('pac-telefone').value,
    document.getElementById('pac-email').value, document.getElementById('pac-cep').value,
    document.getElementById('pac-logradouro').value, document.getElementById('pac-numero').value,
    document.getElementById('pac-bairro').value, document.getElementById('pac-cidade').value,
    document.getElementById('pac-uf').value.toUpperCase(),
    document.getElementById('pac-sexo').value,
    document.getElementById('pac-tipo-sanguineo').value,
    document.getElementById('pac-alergias').value,
    document.getElementById('pac-comorbidades').value,
    document.getElementById('pac-medicamentos').value,
    document.getElementById('pac-obs').value
  ];

  if (id) {
    DB.run(`UPDATE pacientes SET nome=?,cpf=?,data_nascimento=?,celular=?,telefone=?,email=?,
      cep=?,logradouro=?,numero=?,bairro=?,cidade=?,uf=?,sexo=?,tipo_sanguineo=?,alergias=?,
      comorbidades=?,medicamentos_continuos=?,observacoes=? WHERE id=?`, [...dados, id]);
    alert('Paciente atualizado com sucesso!');
  } else {
    DB.run(`INSERT INTO pacientes (nome,cpf,data_nascimento,celular,telefone,email,cep,logradouro,numero,bairro,cidade,uf,sexo,tipo_sanguineo,alergias,comorbidades,medicamentos_continuos,observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, dados);
    alert('Paciente cadastrado com sucesso!');
  }
  limparPaciente();
  carregarPacientes();
}

function excluirPaciente() {
  const id = document.getElementById('pac-id').value;
  if (!id) return alert('Selecione um paciente para excluir.');
  if (!confirm('Deseja realmente desativar este paciente?')) return;
  DB.run('UPDATE pacientes SET ativo=0 WHERE id=?', [id]);
  limparPaciente();
  carregarPacientes();
  alert('Paciente excluído do cadastro ativo.');
}

// ========== PROFISSIONAIS ==========
function carregarProfissionais() {
  const rows = DB.query('SELECT * FROM profissionais WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-profissionais').innerHTML = rows.map(r => `
    <tr onclick="selecionarProfissional(${r.id})" style="cursor:pointer">
      <td>${r.id}</td>
      <td><strong>${escapeHTML(r.nome)}</strong></td>
      <td>${escapeHTML(r.especialidade || '-')}</td>
      <td>${escapeHTML(r.crm || '-')}</td>
      <td>${escapeHTML(r.telefone || '-')}</td>
      <td>${r.percentual_repasse || 0}%</td>
    </tr>`).join('');
}

function selecionarProfissional(id) {
  const r = DB.query('SELECT * FROM profissionais WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('prof-id').value = r.id;
  document.getElementById('prof-nome').value = r.nome || '';
  document.getElementById('prof-esp').value = r.especialidade || '';
  document.getElementById('prof-crm').value = r.crm || '';
  document.getElementById('prof-tel').value = r.telefone || '';
  document.getElementById('prof-perc').value = r.percentual_repasse || 30;
}

function limparProfissional() {
  ['prof-id','prof-nome','prof-esp','prof-crm','prof-tel'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prof-perc').value = 30;
}

function salvarProfissional() {
  const nome = document.getElementById('prof-nome').value.trim();
  if (!nome) return alert('Nome do profissional é obrigatório.');
  const id = document.getElementById('prof-id').value;
  const dados = [
    nome, document.getElementById('prof-esp').value,
    document.getElementById('prof-crm').value, document.getElementById('prof-tel').value,
    parseFloat(document.getElementById('prof-perc').value) || 30
  ];
  if (id) {
    DB.run('UPDATE profissionais SET nome=?,especialidade=?,crm=?,telefone=?,percentual_repasse=? WHERE id=?', [...dados, id]);
  } else {
    DB.run('INSERT INTO profissionais (nome,especialidade,crm,telefone,percentual_repasse) VALUES (?,?,?,?,?)', dados);
  }
  alert('Profissional salvo!');
  limparProfissional();
  carregarProfissionais();
}

// ========== AGENDA & SALA DE ESPERA ==========
function formatarDataParaIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function formatarDataParaBr(d) {
  const dia = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  return `${dia}/${m}/${y}`;
}

function formatarDataPorExtenso(d) {
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  
  const dHoje = new Date();
  const ehHoje = d.toDateString() === dHoje.toDateString();
  const prefixo = ehHoje ? 'Hoje, ' : '';
  
  return `${prefixo}${diasSemana[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
}

function atualizarInputsDataAgenda() {
  const filtroInput = document.getElementById('agenda-data-filtro');
  if (filtroInput) {
    filtroInput.value = formatarDataParaIso(agendaDataAtual);
  }
  const extensoEl = document.getElementById('agenda-data-extenso');
  if (extensoEl) {
    extensoEl.textContent = formatarDataPorExtenso(agendaDataAtual);
  }
  const agDataInput = document.getElementById('ag-data');
  if (agDataInput) {
    agDataInput.value = formatarDataParaBr(agendaDataAtual);
  }
}

function navegarDataAgenda(offset) {
  agendaDataAtual.setDate(agendaDataAtual.getDate() + offset);
  atualizarInputsDataAgenda();
  recarregarVisaoAgendaAtual();
}

function irParaHojeAgenda() {
  agendaDataAtual = new Date();
  atualizarInputsDataAgenda();
  recarregarVisaoAgendaAtual();
}

function aoMudarDataAgenda() {
  const val = document.getElementById('agenda-data-filtro').value;
  if (val) {
    const [y, m, d] = val.split('-').map(Number);
    agendaDataAtual = new Date(y, m - 1, d);
    atualizarInputsDataAgenda();
    recarregarVisaoAgendaAtual();
  }
}

function recarregarVisaoAgendaAtual() {
  const activeTab = document.querySelector('#page-agenda .tab-btn.active');
  const tab = activeTab ? activeTab.dataset.tab : 'visual';
  if (tab === 'visual') {
    carregarAgendaVisual();
  } else if (tab === 'espera') {
    carregarSalaEspera();
  } else if (tab === 'lista') {
    carregarAgenda();
  } else if (tab === 'grade') {
    carregarGrade();
  }
}

function toggleFormAgendamento(horaPreSelecionada) {
  const card = document.getElementById('card-novo-agendamento');
  if (!card) return;
  
  if (card.style.display === 'none' || card.style.display === '') {
    card.style.display = 'block';
    document.getElementById('ag-data').value = formatarDataParaBr(agendaDataAtual);
    if (horaPreSelecionada) {
      document.getElementById('ag-hora').value = horaPreSelecionada;
    }
    const profFiltro = document.getElementById('agenda-filtro-prof').value;
    if (profFiltro) {
      document.getElementById('ag-profissional').value = profFiltro;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    card.style.display = 'none';
  }
}

function carregarSelectsAgenda() {
  const pacs = DB.query('SELECT id, nome FROM pacientes WHERE ativo=1 ORDER BY nome');
  const profs = DB.query('SELECT id, nome, especialidade FROM profissionais WHERE ativo=1 ORDER BY nome');
  const optsP = ['<option value="">-- Selecione o Paciente --</option>']
    .concat(pacs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`))
    .join('');
  
  const optsProfSelect = ['<option value="">-- Selecione o Profissional --</option>']
    .concat(profs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${escapeHTML(p.especialidade || 'Clínico')})</option>`))
    .join('');

  const optsFiltroProf = ['<option value="">Todos os Profissionais</option>']
    .concat(profs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`))
    .join('');

  document.getElementById('ag-paciente').innerHTML = optsP;
  document.getElementById('ag-profissional').innerHTML = optsProfSelect;
  document.getElementById('grade-prof').innerHTML = optsProfSelect;
  
  const filtroProf = document.getElementById('agenda-filtro-prof');
  if (filtroProf && (!filtroProf.options.length || filtroProf.options.length <= 1)) {
    filtroProf.innerHTML = optsFiltroProf;
  }

  atualizarInputsDataAgenda();
  document.getElementById('ag-hora').value = agoraHora();
}

function getStatusBadge(status) {
  const map = {
    agendado: { label: 'Agendado', class: 'badge-admin', style: 'background:#E3F2FD;color:#1565C0;' },
    confirmado: { label: 'Confirmado', class: 'badge-medico', style: 'background:#E8F5E9;color:#2E7D32;' },
    espera: { label: 'Na Recepção', class: 'badge-recepcao', style: 'background:#FFF8E1;color:#F57F17;font-weight:700;' },
    atendimento: { label: 'Em Atendimento', class: 'badge-recepcao', style: 'background:#FFE0B2;color:#E65100;font-weight:700;' },
    realizado: { label: 'Realizado', class: 'badge-medico', style: 'background:#ECEFF1;color:#546E7A;' },
    cancelado: { label: 'Cancelado', class: 'badge-admin', style: 'background:#FFEBEE;color:#C62828;' }
  };
  const info = map[status] || { label: status, class: 'badge-admin', style: '' };
  return `<span class="badge-role ${info.class}" style="${info.style}">${escapeHTML(info.label)}</span>`;
}

function calcularTempoDecorridoMinutos(horaInicioStr) {
  return PlennusValidation.calcularMinutosDecorrido(horaInicioStr);
}

function carregarAgendaVisual() {
  const container = document.getElementById('timeline-slots-container');
  if (!container) return;

  const dataFiltroBr = formatarDataParaBr(agendaDataAtual);
  const profFiltroId = document.getElementById('agenda-filtro-prof') ? document.getElementById('agenda-filtro-prof').value : '';

  let sql = `
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional, pr.especialidade
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.data = ?`;
  const params = [dataFiltroBr];

  if (profFiltroId) {
    sql += ` AND a.profissional_id = ?`;
    params.push(profFiltroId);
  }
  sql += ` ORDER BY a.hora`;
  const rows = DB.query(sql, params);

  const appointmentsByHora = {};
  rows.forEach(r => {
    if (!appointmentsByHora[r.hora]) appointmentsByHora[r.hora] = [];
    appointmentsByHora[r.hora].push(r);
  });

  const defaultHoras = [];
  for (let h = 7; h <= 20; h++) {
    const hh = String(h).padStart(2, '0');
    defaultHoras.push(`${hh}:00`);
    if (h < 20) defaultHoras.push(`${hh}:30`);
  }
  const allHorasSet = new Set([...defaultHoras, ...Object.keys(appointmentsByHora)]);
  const allHoras = Array.from(allHorasSet).sort();

  let html = '';
  allHoras.forEach(hora => {
    const agendamentos = appointmentsByHora[hora] || [];
    let contentHtml = '';

    if (agendamentos.length === 0) {
      contentHtml = `<div class="slot-empty" onclick="toggleFormAgendamento('${hora}')">+ Horário Livre (${hora})</div>`;
    } else {
      contentHtml = agendamentos.map(r => {
        const telefone = r.celular || r.telefone || '';
        const temContato = Boolean(telefone.trim());
        const statusClass = `status-${r.status || 'agendado'}`;

        let chegadaHtml = '';
        if (r.chegada_em) {
          chegadaHtml = `<span class="waiting-timer">🛎️ Chegou: ${escapeHTML(r.chegada_em)}</span>`;
        }

        let botoesAcao = '';
        if (temContato) {
          botoesAcao += `<button class="btn btn-sm btn-whatsapp" title="Enviar Confirmação WhatsApp" onclick="enviarMensagemWhatsApp(${r.id})">💬 WhatsApp</button> `;
        }
        if (r.status === 'agendado' || r.status === 'confirmado') {
          botoesAcao += `<button class="btn btn-sm btn-warning" title="Registrar chegada na clínica" onclick="marcarChegadaEspera(${r.id})">🛎️ Chegou</button> `;
          botoesAcao += `<button class="btn btn-sm btn-success" title="Confirmar Presença" onclick="mudarStatus(${r.id}, 'confirmado')">✓</button> `;
        } else if (r.status === 'espera') {
          botoesAcao += `<button class="btn btn-sm btn-primary" title="Chamar para Atendimento" onclick="chamarParaAtendimento(${r.id}, ${r.paciente_id}, ${r.profissional_id})">🩺 Chamar</button> `;
        } else if (r.status === 'atendimento') {
          botoesAcao += `<button class="btn btn-sm btn-success" title="Finalizar Consulta" onclick="mudarStatus(${r.id}, 'realizado')">✔️ Concluir</button> `;
        }

        botoesAcao += `<button class="btn btn-sm btn-info" title="Abrir Prontuário" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 PEP</button> `;

        if (r.status !== 'cancelado' && r.status !== 'realizado') {
          botoesAcao += `<button class="btn btn-sm btn-danger" title="Cancelar Agendamento" onclick="mudarStatus(${r.id}, 'cancelado')">✕</button>`;
        }

        return `
          <div class="appointment-card ${statusClass}">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:14px;color:#222;">${escapeHTML(r.paciente || 'Paciente')}</strong>
                ${getStatusBadge(r.status)}
                ${chegadaHtml}
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">
                👨‍⚕️ ${escapeHTML(r.profissional || 'Sem profissional')}
                ${r.observacao ? ` • <em>"${escapeHTML(r.observacao)}"</em>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              ${botoesAcao}
            </div>
          </div>`;
      }).join('');
    }

    html += `
      <div class="timeline-slot">
        <div class="timeline-hour">${hora}</div>
        <div class="timeline-slot-content">${contentHtml}</div>
      </div>`;
  });

  container.innerHTML = html;
}

function carregarSalaEspera() {
  const colAgendadosEl = document.getElementById('coluna-agendados');
  const colEsperaEl = document.getElementById('coluna-espera');
  const colAtendidosEl = document.getElementById('coluna-atendidos');
  if (!colAgendadosEl || !colEsperaEl || !colAtendidosEl) return;

  const dataFiltroBr = formatarDataParaBr(agendaDataAtual);
  const profFiltroId = document.getElementById('agenda-filtro-prof') ? document.getElementById('agenda-filtro-prof').value : '';

  let sql = `
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.data = ?`;
  const params = [dataFiltroBr];

  if (profFiltroId) {
    sql += ` AND a.profissional_id = ?`;
    params.push(profFiltroId);
  }
  sql += ` ORDER BY a.hora`;
  const rows = DB.query(sql, params);

  const listAgendados = rows.filter(r => r.status === 'agendado' || r.status === 'confirmado');
  const listEspera = rows.filter(r => r.status === 'espera');
  const listAtendidos = rows.filter(r => r.status === 'atendimento' || r.status === 'realizado');

  document.getElementById('badge-count-agendados').textContent = listAgendados.length;
  document.getElementById('badge-count-espera').textContent = listEspera.length;
  document.getElementById('badge-count-finalizados').textContent = listAtendidos.length;

  const vazioHtml = (msg) => `<div style="text-align:center;color:#999;padding:36px 12px;font-size:13px;">${msg}</div>`;

  // Coluna 1: Agendados
  if (listAgendados.length === 0) {
    colAgendadosEl.innerHTML = vazioHtml('Nenhum paciente com consulta prevista');
  } else {
    colAgendadosEl.innerHTML = listAgendados.map(r => {
      const tel = r.celular || r.telefone || '';
      return `
        <div class="espera-item" style="border-left:4px solid #1565C0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <strong>${escapeHTML(r.paciente || '-')}</strong>
            <span style="font-weight:700;color:#1565C0;">🕒 ${r.hora}</span>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:8px;">
            Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong>
            ${r.observacao ? `<br><small class="text-muted">${escapeHTML(r.observacao)}</small>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-sm btn-warning" onclick="marcarChegadaEspera(${r.id})">🛎️ Marcar Chegada</button>
            ${tel ? `<button class="btn btn-sm btn-whatsapp" onclick="enviarMensagemWhatsApp(${r.id})">💬 WhatsApp</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="mudarStatus(${r.id}, 'cancelado')">✕ Cancelar</button>
          </div>
        </div>`;
    }).join('');
  }

  // Coluna 2: Na Sala de Espera
  if (listEspera.length === 0) {
    colEsperaEl.innerHTML = vazioHtml('Nenhum paciente aguardando no momento');
  } else {
    colEsperaEl.innerHTML = listEspera.map(r => {
      const minutos = calcularTempoDecorridoMinutos(r.chegada_em || r.hora);
      return `
        <div class="espera-item" style="border-left:4px solid #F57F17;background:#FFFDE7;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <strong>${escapeHTML(r.paciente || '-')}</strong>
            <span style="font-weight:700;color:#E65100;">Previsto: ${r.hora}</span>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:6px;">
            Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong>
          </div>
          <div style="margin-bottom:10px;">
            <span class="waiting-timer">⏳ Aguardando há ${minutos} min (Chegou às ${escapeHTML(r.chegada_em || r.hora)})</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-sm btn-primary" onclick="chamarParaAtendimento(${r.id}, ${r.paciente_id}, ${r.profissional_id})">🩺 Chamar p/ Atendimento</button>
            <button class="btn btn-sm btn-info" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 Ver PEP</button>
          </div>
        </div>`;
    }).join('');
  }

  // Coluna 3: Atendidos / Em Atendimento
  if (listAtendidos.length === 0) {
    colAtendidosEl.innerHTML = vazioHtml('Nenhum atendimento em andamento ou finalizado');
  } else {
    colAtendidosEl.innerHTML = listAtendidos.map(r => {
      const isAtendimento = r.status === 'atendimento';
      return `
        <div class="espera-item" style="border-left:4px solid ${isAtendimento ? '#E65100' : '#2E7D32'};background:${isAtendimento ? '#FFF3E0' : '#F1F8E9'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <strong>${escapeHTML(r.paciente || '-')}</strong>
            <span>${getStatusBadge(r.status)}</span>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:8px;">
            Horário: <strong>${r.hora}</strong> • Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-sm btn-info" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 Abrir PEP</button>
            ${isAtendimento ? `<button class="btn btn-sm btn-success" onclick="mudarStatus(${r.id}, 'realizado')">✔️ Concluir Atendimento</button>` : ''}
          </div>
        </div>`;
    }).join('');
  }
}

function carregarAgenda() {
  const rows = DB.query(`
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    ORDER BY a.data DESC, a.hora`);
  
  document.getElementById('tabela-agenda').innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.data}</td>
      <td><strong>${r.hora}</strong></td>
      <td>${escapeHTML(r.paciente || '-')}</td>
      <td>${escapeHTML(r.profissional || '-')}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>
        ${(r.celular || r.telefone) ? `<button class="btn btn-sm btn-whatsapp" title="WhatsApp" onclick="enviarMensagemWhatsApp(${r.id})">💬</button>` : ''}
        ${(r.status === 'agendado' || r.status === 'confirmado') ? `<button class="btn btn-warning btn-sm" title="Marcar Chegada" onclick="marcarChegadaEspera(${r.id})">🛎️</button>` : ''}
        <button class="btn btn-success btn-sm" title="Confirmar" onclick="mudarStatus(${r.id},'confirmado')">✓</button>
        <button class="btn btn-danger btn-sm" title="Cancelar" onclick="mudarStatus(${r.id},'cancelado')">✗</button>
        <button class="btn btn-info btn-sm" title="Abrir Prontuário" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">PEP 📋</button>
      </td>
    </tr>`).join('');
}

function agendarConsulta() {
  const pid = document.getElementById('ag-paciente').value;
  const prid = document.getElementById('ag-profissional').value;
  const data = document.getElementById('ag-data').value.trim();
  const hora = document.getElementById('ag-hora').value.trim();
  const status = document.getElementById('ag-status').value || 'agendado';
  const obs = document.getElementById('ag-obs') ? document.getElementById('ag-obs').value.trim() : '';
  if (!pid || !prid || !data || !hora) return alert('Preencha todos os campos do agendamento.');
  if (!PlennusValidation.isValidDate(data) || !PlennusValidation.isValidTime(hora)) return alert('Informe data (DD/MM/AAAA) e hora (HH:MM) válidas.');
  
  const conflict = DB.query('SELECT id FROM agenda WHERE profissional_id=? AND data=? AND hora=? AND status != ?', [prid, data, hora, 'cancelado']);
  if (conflict.length) return alert('Este profissional já possui atendimento agendado neste horário.');
  
  DB.run('INSERT INTO agenda (paciente_id,profissional_id,data,hora,status,observacao) VALUES (?,?,?,?,?,?)', [pid, prid, data, hora, status, obs]);
  alert('Consulta agendada com sucesso!');
  const card = document.getElementById('card-novo-agendamento');
  if (card) card.style.display = 'none';
  recarregarVisaoAgendaAtual();
}

function mudarStatus(id, status) {
  DB.run('UPDATE agenda SET status=? WHERE id=?', [status, id]);
  recarregarVisaoAgendaAtual();
}

function marcarChegadaEspera(agendaId) {
  const hora = agoraHora();
  DB.run('UPDATE agenda SET status=?, chegada_em=? WHERE id=?', ['espera', hora, agendaId]);
  recarregarVisaoAgendaAtual();
}

function chamarParaAtendimento(agendaId, pacienteId, profissionalId) {
  DB.run('UPDATE agenda SET status=? WHERE id=?', ['atendimento', agendaId]);
  recarregarVisaoAgendaAtual();
  abrirProntuarioDaAgenda(pacienteId, profissionalId);
}

function enviarMensagemWhatsApp(agendaId) {
  const row = DB.query(`
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.id = ?`, [agendaId])[0];

  if (!row) return alert('Agendamento não encontrado.');

  const telFormatado = PlennusValidation.formatarTelefoneWhatsApp(row.celular || row.telefone || '');
  if (!telFormatado) {
    return alert('O paciente não possui telefone celular válido com DDD cadastrado.');
  }

  const clinica = obterDadosClinica();
  const msg = PlennusValidation.gerarMensagemWhatsAppConfirmacao({
    paciente: row.paciente,
    clinica: clinica.nome,
    profissional: row.profissional,
    data: row.data,
    hora: row.hora
  });

  const url = `https://api.whatsapp.com/send?phone=${telFormatado}&text=${encodeURIComponent(msg)}`;

  if (window.electronAPI && typeof window.electronAPI.abrirUrlExterna === 'function') {
    window.electronAPI.abrirUrlExterna(url);
  } else {
    window.open(url, '_blank');
  }
}

function carregarGrade() {
  const rows = DB.query(`
    SELECT g.*, p.nome as profissional FROM grade_horarios g
    LEFT JOIN profissionais p ON p.id=g.profissional_id ORDER BY g.profissional_id, g.dia_semana`);
  document.getElementById('tabela-grade').innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${escapeHTML(r.profissional)}</td>
      <td>${DIAS[r.dia_semana]}</td>
      <td>${escapeHTML(r.hora_inicio)}</td>
      <td>${escapeHTML(r.hora_fim)}</td>
      <td>${r.intervalo_minutos} min</td>
      <td><button class="btn btn-danger btn-sm" onclick="excluirGrade(${r.id})">Excluir</button></td>
    </tr>`).join('');
}

function salvarGrade() {
  const pid = document.getElementById('grade-prof').value;
  if (!pid) return alert('Selecione um profissional.');
  DB.run('INSERT INTO grade_horarios (profissional_id,dia_semana,hora_inicio,hora_fim,intervalo_minutos) VALUES (?,?,?,?,?)',
    [pid, document.getElementById('grade-dia').value,
     document.getElementById('grade-inicio').value, document.getElementById('grade-fim').value,
     document.getElementById('grade-intervalo').value || 30]);
  alert('Grade salva!');
  carregarGrade();
}

function excluirGrade(id) {
  if (!confirm('Excluir esta grade?')) return;
  DB.run('DELETE FROM grade_horarios WHERE id=?', [id]);
  carregarGrade();
}

// ========== PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP) ==========
function carregarSelectsPep() {
  const pacs = DB.query('SELECT id, nome, cpf FROM pacientes WHERE ativo=1 ORDER BY nome');
  const profs = DB.query('SELECT id, nome FROM profissionais WHERE ativo=1 ORDER BY nome');

  const optsP = ['<option value="">-- Selecione um paciente --</option>']
    .concat(pacs.map(p => `<option value="${p.id}">${p.nome} ${p.cpf ? '(' + p.cpf + ')' : ''}</option>`))
    .join('');
  
  const optsR = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option value="">Nenhum</option>';

  document.getElementById('pep-paciente').innerHTML = optsP;
  document.getElementById('pep-profissional').innerHTML = optsR;

  // Se já havia paciente selecionado
  if (selectedPepPacienteId) {
    document.getElementById('pep-paciente').value = selectedPepPacienteId;
    selecionarPacientePep(selectedPepPacienteId);
  }
}

function selecionarPacientePep(idOpcional) {
  const pid = idOpcional || document.getElementById('pep-paciente').value;
  if (!pid) {
    document.getElementById('pep-patient-card').style.display = 'none';
    document.getElementById('pep-corpo').style.display = 'none';
    selectedPepPacienteId = null;
    return;
  }

  selectedPepPacienteId = pid;
  const p = DB.query('SELECT * FROM pacientes WHERE id=?', [pid])[0];
  if (!p) return;

  document.getElementById('pep-display-nome').textContent = p.nome;
  document.getElementById('pep-display-idade').textContent = calcularIdade(p.data_nascimento);
  document.getElementById('pep-display-cpf').textContent = p.cpf || 'Não informado';
  document.getElementById('pep-display-sangue').textContent = p.tipo_sanguineo || 'Não informado';
  document.getElementById('pep-display-tel').textContent = p.celular || p.telefone || 'Não informado';

  // Alerta de Alergias
  const alertBox = document.getElementById('pep-alergia-alert');
  const alertText = document.getElementById('pep-alergia-text');
  if (p.alergias && p.alergias.trim()) {
    alertBox.className = 'pep-alert-box';
    alertText.innerHTML = `⚠️ <strong>ALERGIAS REGISTRADAS:</strong> ${escapeHTML(p.alergias)}`;
  } else {
    alertBox.className = 'pep-alert-box no-allergy';
    alertText.innerHTML = `✅ <strong>Nenhuma alergia conhecida</strong>`;
  }

  // Comorbidades
  let comorbText = [];
  if (p.comorbidades) comorbText.push(p.comorbidades);
  if (p.medicamentos_continuos) comorbText.push(`Em uso de: ${p.medicamentos_continuos}`);
  document.getElementById('pep-display-comorbidades').textContent = comorbText.join(' | ') || 'Nenhuma comorbidade registrada';

  document.getElementById('pep-patient-card').style.display = 'block';
  document.getElementById('pep-corpo').style.display = 'grid';

  novoAtendimentoPep();
  carregarTimelinePep(pid);
}

function novoAtendimentoPep() {
  document.getElementById('pep-atendimento-id').value = '';
  document.getElementById('pep-data-atendimento').textContent = `Data: ${hoje()} às ${agoraHora()}`;
  document.getElementById('pep-tipo-atendimento').value = 'Consulta';
  document.getElementById('pep-subjetivo').value = '';
  document.getElementById('pep-pa').value = '';
  document.getElementById('pep-fc').value = '';
  document.getElementById('pep-temp').value = '';
  document.getElementById('pep-peso').value = '';
  document.getElementById('pep-altura').value = '';
  document.getElementById('pep-imc').value = '';
  document.getElementById('pep-imc-tag').innerHTML = '';
  document.getElementById('pep-objetivo').value = '';
  document.getElementById('pep-cid10').value = '';
  document.getElementById('pep-avaliacao').value = '';
  document.getElementById('pep-plano').value = '';
  document.getElementById('pep-prescricao').value = '';
}

function calcularImcPep() {
  const peso = document.getElementById('pep-peso').value;
  const altura = document.getElementById('pep-altura').value;
  const imcInput = document.getElementById('pep-imc');
  const imcTag = document.getElementById('pep-imc-tag');

  const imc = PlennusValidation.calcularIMC(peso, altura);
  if (imc !== null) {
    imcInput.value = imc.toFixed(1);
    const { tag, label } = PlennusValidation.classificarIMC(imc);
    imcTag.innerHTML = `<span class="imc-tag imc-${tag}">${label}</span>`;
  } else {
    imcInput.value = '';
    imcTag.innerHTML = '';
  }
}

function salvarAtendimentoPep() {
  if (!selectedPepPacienteId) return alert('Selecione um paciente para registrar o atendimento.');
  const profId = document.getElementById('pep-profissional').value;
  if (!profId) return alert('Selecione o profissional de saúde responsável.');

  const tipo = document.getElementById('pep-tipo-atendimento').value;
  const subj = document.getElementById('pep-subjetivo').value.trim();
  const pa = document.getElementById('pep-pa').value.trim();
  const fc = document.getElementById('pep-fc').value.trim();
  const temp = document.getElementById('pep-temp').value.trim();
  const peso = parseFloat(document.getElementById('pep-peso').value) || null;
  const altura = parseFloat(document.getElementById('pep-altura').value) || null;
  const imc = parseFloat(document.getElementById('pep-imc').value) || null;
  const obj = document.getElementById('pep-objetivo').value.trim();
  const cid = document.getElementById('pep-cid10').value.trim();
  const aval = document.getElementById('pep-avaliacao').value.trim();
  const plano = document.getElementById('pep-plano').value.trim();
  const presc = document.getElementById('pep-prescricao').value.trim();

  if (!subj && !aval && !plano && !presc) {
    return alert('Preencha ao menos um dos campos clínicos da consulta (Subjetivo, Avaliação ou Conduta).');
  }

  const dataHora = `${hoje()} ${agoraHora()}`;

  DB.run(`INSERT INTO prontuario_atendimentos 
    (paciente_id, profissional_id, data_hora, tipo_atendimento, subjetivo_queixa, objetivo_exame,
     pressao_arterial, frequencia_cardiaca, temperatura, peso, altura, imc, avaliacao_diagnostico,
     cid10, plano_conduta, prescricao_medicamentos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [selectedPepPacienteId, profId, dataHora, tipo, subj, obj, pa, fc, temp, peso, altura, imc, aval, cid, plano, presc]
  );

  alert('Atendimento salvo com sucesso no prontuário do paciente!');
  carregarTimelinePep(selectedPepPacienteId);
}

function carregarTimelinePep(pacienteId) {
  const container = document.getElementById('pep-timeline');
  const atendimentos = DB.query(`
    SELECT a.*, pr.nome as profissional_nome, pr.crm as profissional_crm, pr.especialidade
    FROM prontuario_atendimentos a
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.paciente_id=?
    ORDER BY a.id DESC`, [pacienteId]);

  if (!atendimentos.length) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:30px 10px;background:#FAFAFA;">
        <p class="text-muted">Nenhum atendimento anterior registrado para este paciente.</p>
        <button class="btn btn-primary btn-sm mt-10" onclick="novoAtendimentoPep()">Iniciar Primeiro Atendimento</button>
      </div>`;
    return;
  }

  container.innerHTML = atendimentos.map(at => {
    let vitalsParts = [];
    if (at.pressao_arterial) vitalsParts.push(`PA: ${escapeHTML(at.pressao_arterial)}`);
    if (at.frequencia_cardiaca) vitalsParts.push(`FC: ${at.frequencia_cardiaca} bpm`);
    if (at.temperatura) vitalsParts.push(`Temp: ${at.temperatura}°C`);
    if (at.peso) vitalsParts.push(`Peso: ${at.peso} kg`);
    if (at.imc) vitalsParts.push(`IMC: ${at.imc}`);

    const vitalsStr = vitalsParts.length ? `<div style="font-size:12px;color:#0277BD;margin:4px 0;">📊 ${vitalsParts.join(' | ')}</div>` : '';
    const cidStr = at.cid10 ? `<span class="badge-role badge-admin">CID: ${escapeHTML(at.cid10)}</span> ` : '';

    return `
      <div class="timeline-item">
        <div class="timeline-date">
          <span>📅 ${at.data_hora} • <strong>${escapeHTML(at.tipo_atendimento || 'Consulta')}</strong></span>
          <span style="color:var(--primary);">${escapeHTML(at.profissional_nome || 'Médico')}</span>
        </div>
        <div class="timeline-content">
          ${cidStr}<strong>${escapeHTML(at.avaliacao_diagnostico || 'Sem diagnóstico formal')}</strong>
          ${vitalsStr}
          ${at.subjetivo_queixa ? `<p style="margin-top:4px;"><strong>Queixa:</strong> ${escapeHTML(at.subjetivo_queixa)}</p>` : ''}
          ${at.plano_conduta ? `<p style="margin-top:4px;"><strong>Conduta:</strong> ${escapeHTML(at.plano_conduta)}</p>` : ''}
          ${at.prescricao_medicamentos ? `
            <div style="background:#F1F8E9;border:1px solid #DCEDC8;padding:6px 10px;border-radius:6px;margin-top:6px;font-size:12px;">
              <strong>💊 Prescrição:</strong><br>${escapeHTML(at.prescricao_medicamentos).replace(/\n/g, '<br>')}
            </div>` : ''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          ${at.prescricao_medicamentos ? `<button class="btn btn-sm btn-success" style="height:26px;font-size:11px;padding:0 8px;" onclick="reimprimirReceitaTimeline(${at.id})">🖨️ Imprimir Receita</button>` : ''}
          <button class="btn btn-sm btn-info" style="height:26px;font-size:11px;padding:0 8px;" onclick="imprimirResumoTimeline(${at.id})">📄 Resumo Completo</button>
        </div>
      </div>`;
  }).join('');
}

function editarAlergiasRapido() {
  if (!selectedPepPacienteId) return;
  const p = DB.query('SELECT alergias, nome FROM pacientes WHERE id=?', [selectedPepPacienteId])[0];
  const nova = prompt(`Editar alergias conhecidas de ${p.nome}:\n(Deixe em branco se o paciente não possui alergias conhecidas)`, p.alergias || '');
  if (nova !== null) {
    DB.run('UPDATE pacientes SET alergias=? WHERE id=?', [nova.trim(), selectedPepPacienteId]);
    selecionarPacientePep(selectedPepPacienteId);
  }
}

function abrirProntuarioPaciente(id) {
  navegar('prontuario');
  document.getElementById('pep-paciente').value = id;
  selecionarPacientePep(id);
}

function abrirProntuarioDaAgenda(pacId, profId) {
  navegar('prontuario');
  document.getElementById('pep-paciente').value = pacId;
  if (profId) document.getElementById('pep-profissional').value = profId;
  selecionarPacientePep(pacId);
}

function limparFormularioPep() {
  novoAtendimentoPep();
}

// ========== MOTOR DE DOCUMENTOS EM PDF TIMBRADO ==========
function gerarHtmlDocumentoTimbrado({ titulo, paciente, profissional, corpoHtml, tipoDoc }) {
  const clinica = obterDadosClinica();
  const dataExtenso = `${hoje()}`;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${escapeHTML(titulo)} - ${escapeHTML(paciente.nome)}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 18mm 18mm 22mm 18mm;
      }
      body {
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #222;
        margin: 0;
        padding: 0;
        font-size: 14px;
        line-height: 1.6;
      }
      .header {
        text-align: center;
        border-bottom: 2px solid ${clinica.cor};
        padding-bottom: 12px;
        margin-bottom: 20px;
      }
      .clinic-name {
        font-size: 22px;
        font-weight: 700;
        color: ${clinica.cor};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .clinic-info {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
      }
      .doc-title {
        text-align: center;
        font-size: 18px;
        font-weight: 700;
        margin: 20px 0;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .patient-box {
        background: #F9F9F9;
        border: 1px solid #E0E0E0;
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 24px;
        display: flex;
        justify-content: space-between;
        font-size: 13px;
      }
      .content {
        min-height: 380px;
        font-size: 15px;
        line-height: 1.8;
      }
      .signature-area {
        margin-top: 50px;
        text-align: center;
      }
      .signature-line {
        width: 320px;
        border-top: 1px solid #333;
        margin: 0 auto 6px;
      }
      .doctor-name {
        font-weight: 700;
        font-size: 15px;
      }
      .doctor-crm {
        font-size: 13px;
        color: #555;
      }
      .footer-legal {
        margin-top: 40px;
        border-top: 1px solid #EEE;
        padding-top: 8px;
        font-size: 10px;
        color: #888;
        display: flex;
        justify-content: space-between;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="clinic-name">${escapeHTML(clinica.nome)}</div>
      <div class="clinic-info">${escapeHTML(clinica.endereco)} • ${escapeHTML(clinica.cidade)}</div>
      <div class="clinic-info">Tel: ${escapeHTML(clinica.telefone)} • CNPJ: ${escapeHTML(clinica.cnpj)}</div>
    </div>

    <div class="doc-title">${escapeHTML(titulo)}</div>

    <div class="patient-box">
      <div><strong>Paciente:</strong> ${escapeHTML(paciente.nome)}</div>
      <div><strong>CPF:</strong> ${escapeHTML(paciente.cpf || 'Não informado')}</div>
      <div><strong>Data:</strong> ${dataExtenso}</div>
    </div>

    <div class="content">
      ${corpoHtml}
    </div>

    <div class="signature-area">
      <div class="signature-line"></div>
      <div class="doctor-name">Dr(a). ${escapeHTML(profissional.nome)}</div>
      <div class="doctor-crm">${escapeHTML(profissional.crm || 'CRM')} ${profissional.especialidade ? '• ' + escapeHTML(profissional.especialidade) : ''}</div>
    </div>

    <div class="footer-legal">
      <span>Documento emitido eletronicamente por Plennus Clinic</span>
      <span>${dataExtenso}</span>
    </div>
  </body>
  </html>`;
}

async function enviarParaImpressaoOuPdf(html, nomeArquivo) {
  if (window.electronAPI && window.electronAPI.gerarPdf) {
    const res = await window.electronAPI.gerarPdf(html, nomeArquivo);
    if (res.ok) {
      alert('PDF gerado e salvo com sucesso em:\n' + res.path);
    } else if (!res.cancelado) {
      alert('Não foi possível gerar o PDF: ' + (res.error || 'Erro desconhecido'));
    }
  } else {
    // Fallback para navegador
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }
}

async function enviarParaImpressaoDireta(html) {
  if (window.electronAPI && window.electronAPI.imprimirDocumento) {
    await window.electronAPI.imprimirDocumento(html);
  } else {
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }
}

function gerarPdfReceitaPep() {
  if (!selectedPepPacienteId) return alert('Selecione um paciente.');
  const prescricao = document.getElementById('pep-prescricao').value.trim();
  if (!prescricao) return alert('Nenhuma prescrição médica preenchida no atendimento atual.');

  const profId = document.getElementById('pep-profissional').value;
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [selectedPepPacienteId])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [profId])[0] || { nome: 'Profissional', crm: '' };

  const corpo = `<div style="white-space:pre-wrap;font-size:15px;">${escapeHTML(prescricao)}</div>`;
  const html = gerarHtmlDocumentoTimbrado({
    titulo: 'Receituário Médico',
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'receita'
  });

  enviarParaImpressaoOuPdf(html, `receita_${pac.nome.replace(/\s+/g, '_')}_${hoje().replace(/\//g,'-')}.pdf`);
}

function gerarPdfAtendimentoPep() {
  if (!selectedPepPacienteId) return alert('Selecione um paciente.');
  const profId = document.getElementById('pep-profissional').value;
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [selectedPepPacienteId])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [profId])[0] || { nome: 'Profissional', crm: '' };

  const subj = document.getElementById('pep-subjetivo').value;
  const obj = document.getElementById('pep-objetivo').value;
  const cid = document.getElementById('pep-cid10').value;
  const aval = document.getElementById('pep-avaliacao').value;
  const plano = document.getElementById('pep-plano').value;
  const presc = document.getElementById('pep-prescricao').value;

  const corpo = `
    <h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;color:var(--primary);">Resumo do Atendimento Clínico (SOAP)</h3>
    <p><strong>Queixa Principal / História Clínica:</strong><br>${escapeHTML(subj || 'Não relatado')}</p>
    <p><strong>Exame Físico / Achados:</strong><br>${escapeHTML(obj || 'Sem alterações')}</p>
    <p><strong>Hipótese Diagnóstica:</strong> ${cid ? '[' + escapeHTML(cid) + '] ' : ''}${escapeHTML(aval || 'Em investigação')}</p>
    <p><strong>Conduta / Orientações:</strong><br>${escapeHTML(plano || 'Sem orientações adicionais')}</p>
    ${presc ? `<p><strong>Medicamentos Prescritos:</strong><br>${escapeHTML(presc).replace(/\n/g, '<br>')}</p>` : ''}
  `;

  const html = gerarHtmlDocumentoTimbrado({
    titulo: 'Resumo de Consulta Médica',
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'resumo'
  });

  enviarParaImpressaoOuPdf(html, `resumo_${pac.nome.replace(/\s+/g, '_')}_${hoje().replace(/\//g,'-')}.pdf`);
}

function reimprimirReceitaTimeline(atendimentoId) {
  const at = DB.query('SELECT * FROM prontuario_atendimentos WHERE id=?', [atendimentoId])[0];
  if (!at || !at.prescricao_medicamentos) return alert('Atendimento sem prescrição registrada.');
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [at.paciente_id])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [at.profissional_id])[0] || { nome: 'Profissional', crm: '' };

  const corpo = `<div style="white-space:pre-wrap;font-size:15px;">${escapeHTML(at.prescricao_medicamentos)}</div>`;
  const html = gerarHtmlDocumentoTimbrado({
    titulo: 'Receituário Médico',
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'receita'
  });

  enviarParaImpressaoDireta(html);
}

function imprimirResumoTimeline(atendimentoId) {
  const at = DB.query('SELECT * FROM prontuario_atendimentos WHERE id=?', [atendimentoId])[0];
  if (!at) return;
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [at.paciente_id])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [at.profissional_id])[0] || { nome: 'Profissional', crm: '' };

  const corpo = `
    <h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;color:var(--primary);">Evolução Clínica do Dia ${at.data_hora}</h3>
    <p><strong>Queixa:</strong> ${escapeHTML(at.subjetivo_queixa || 'Não relatado')}</p>
    <p><strong>Exame Físico:</strong> ${escapeHTML(at.objetivo_exame || 'Sem alterações')}</p>
    <p><strong>Diagnóstico:</strong> ${at.cid10 ? '[' + escapeHTML(at.cid10) + '] ' : ''}${escapeHTML(at.avaliacao_diagnostico || 'Sem diagnóstico')}</p>
    <p><strong>Conduta:</strong> ${escapeHTML(at.plano_conduta || 'Sem orientações')}</p>
    ${at.prescricao_medicamentos ? `<p><strong>Prescrição:</strong><br>${escapeHTML(at.prescricao_medicamentos).replace(/\n/g, '<br>')}</p>` : ''}
  `;

  const html = gerarHtmlDocumentoTimbrado({
    titulo: 'Registro de Atendimento Prontuário',
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'resumo'
  });

  enviarParaImpressaoDireta(html);
}

// ========== CONVÊNIOS & PROCEDIMENTOS ==========
function carregarConvenios() {
  const rows = DB.query('SELECT * FROM convenios WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-convenios').innerHTML = rows.map(r => `
    <tr onclick="selecionarConvenio(${r.id})" style="cursor:pointer">
      <td>${r.id}</td><td>${escapeHTML(r.nome)}</td><td>${escapeHTML(r.codigo)}</td><td>${escapeHTML(r.telefone)}</td>
    </tr>`).join('');
}

function selecionarConvenio(id) {
  const r = DB.query('SELECT * FROM convenios WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('conv-id').value = r.id;
  document.getElementById('conv-nome').value = r.nome || '';
  document.getElementById('conv-codigo').value = r.codigo || '';
  document.getElementById('conv-tel').value = r.telefone || '';
  document.getElementById('conv-contato').value = r.contato || '';
}

function limparConvenio() {
  ['conv-id','conv-nome','conv-codigo','conv-tel','conv-contato'].forEach(id => document.getElementById(id).value = '');
}

function salvarConvenio() {
  const nome = document.getElementById('conv-nome').value.trim();
  if (!nome) return alert('Nome do convênio é obrigatório.');
  const id = document.getElementById('conv-id').value;
  const dados = [nome, document.getElementById('conv-codigo').value,
    document.getElementById('conv-tel').value, document.getElementById('conv-contato').value];
  if (id) {
    DB.run('UPDATE convenios SET nome=?,codigo=?,telefone=?,contato=? WHERE id=?', [...dados, id]);
  } else {
    DB.run('INSERT INTO convenios (nome,codigo,telefone,contato) VALUES (?,?,?,?)', dados);
  }
  alert('Convênio salvo com sucesso!');
  limparConvenio();
  carregarConvenios();
}

function carregarProcedimentos() {
  const rows = DB.query('SELECT * FROM procedimentos WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-procedimentos').innerHTML = rows.map(r => `
    <tr><td>${r.id}</td><td>${escapeHTML(r.nome)}</td><td>${formatMoney(r.valor_particular)}</td></tr>`).join('');
}

function salvarProcedimento() {
  const nome = document.getElementById('proc-nome').value.trim();
  if (!nome) return alert('Nome do procedimento é obrigatório.');
  const valor = parseFloat((document.getElementById('proc-valor').value || '0').replace(',', '.')) || 0;
  DB.run('INSERT INTO procedimentos (nome, valor_particular) VALUES (?,?)', [nome, valor]);
  document.getElementById('proc-nome').value = '';
  document.getElementById('proc-valor').value = '';
  carregarProcedimentos();
  alert('Procedimento adicionado com sucesso!');
}

// ========== DOCUMENTOS (MÓDULO GERAL) ==========
function carregarSelectsDocs() {
  const templates = DB.query('SELECT nome FROM documentos_templates WHERE ativo=1');
  document.getElementById('doc-tipo').innerHTML = templates.map(t => `<option>${t.nome}</option>`).join('');
  const pacs = DB.query('SELECT id, nome FROM pacientes WHERE ativo=1 ORDER BY nome');
  const profs = DB.query('SELECT id, nome FROM profissionais WHERE ativo=1 ORDER BY nome');
  document.getElementById('doc-paciente').innerHTML = pacs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option>Nenhum</option>';
  document.getElementById('doc-profissional').innerHTML = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option>Nenhum</option>';
}

function carregarTemplate() {
  const nome = document.getElementById('doc-tipo').value;
  if (!nome) return;
  const r = DB.query('SELECT conteudo FROM documentos_templates WHERE nome=?', [nome])[0];
  if (r) document.getElementById('doc-editor').value = r.conteudo;
}

function gerarDocumento() {
  const pid = document.getElementById('doc-paciente').value;
  const prid = document.getElementById('doc-profissional').value;
  if (!pid || !prid) return alert('Selecione paciente e profissional.');

  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [pid])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [prid])[0];
  const clinica = obterDadosClinica();

  let txt = document.getElementById('doc-editor').value;
  txt = txt.replace(/{paciente_nome}/g, pac?.nome || '')
           .replace(/{paciente_cpf}/g, pac?.cpf || '')
           .replace(/{paciente_endereco}/g, `${pac?.logradouro || ''}, ${pac?.numero || ''} - ${pac?.bairro || ''}, ${pac?.cidade || ''}`)
           .replace(/{profissional_nome}/g, prof?.nome || '')
           .replace(/{profissional_crm}/g, prof?.crm || '')
           .replace(/{nome_clinica}/g, clinica.nome)
           .replace(/{endereco_clinica}/g, clinica.endereco)
           .replace(/{telefone_clinica}/g, clinica.telefone)
           .replace(/{data}/g, hoje());
  document.getElementById('doc-editor').value = txt;
  alert('Documento preenchido! Você pode revisar ou editar o texto antes de imprimir/exportar.');
}

function exportarDocumentoPdf() {
  const pid = document.getElementById('doc-paciente').value;
  const prid = document.getElementById('doc-profissional').value;
  const tipo = document.getElementById('doc-tipo').value || 'Documento';
  const conteudo = document.getElementById('doc-editor').value;
  if (!conteudo.trim()) return alert('O conteúdo do documento está vazio.');

  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [pid])[0] || { nome: 'Paciente' };
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [prid])[0] || { nome: 'Profissional', crm: '' };

  const corpo = `<div style="white-space:pre-wrap;font-size:15px;">${escapeHTML(conteudo)}</div>`;
  const html = gerarHtmlDocumentoTimbrado({
    titulo: tipo,
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'documento'
  });

  enviarParaImpressaoOuPdf(html, `${tipo.replace(/\s+/g, '_')}_${pac.nome.replace(/\s+/g, '_')}.pdf`);
}

function imprimirDocumentoAtual() {
  const pid = document.getElementById('doc-paciente').value;
  const prid = document.getElementById('doc-profissional').value;
  const tipo = document.getElementById('doc-tipo').value || 'Documento';
  const conteudo = document.getElementById('doc-editor').value;
  if (!conteudo.trim()) return alert('O documento está vazio.');

  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [pid])[0] || { nome: 'Paciente' };
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [prid])[0] || { nome: 'Profissional', crm: '' };

  const corpo = `<div style="white-space:pre-wrap;font-size:15px;">${escapeHTML(conteudo)}</div>`;
  const html = gerarHtmlDocumentoTimbrado({
    titulo: tipo,
    paciente: pac,
    profissional: prof,
    corpoHtml: corpo,
    tipoDoc: 'documento'
  });

  enviarParaImpressaoDireta(html);
}

async function salvarDocumentoTxt() {
  const conteudo = document.getElementById('doc-editor').value;
  if (!conteudo.trim()) return alert('Nada para salvar.');
  if (window.electronAPI && window.electronAPI.salvarDocumento) {
    const res = await window.electronAPI.salvarDocumento(conteudo, 'documento.txt');
    if (res.ok) alert('Salvo em: ' + res.path);
  } else {
    const blob = new Blob([conteudo], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'documento.txt';
    a.click();
  }
}

// ========== CAIXA ==========
function carregarCaixa() {
  const rows = DB.query('SELECT * FROM caixa ORDER BY data DESC LIMIT 100');
  let entradas = 0, saidas = 0;
  document.getElementById('tabela-caixa').innerHTML = rows.map(r => {
    if (r.tipo === 'entrada') entradas += r.valor; else saidas += r.valor;
    return `<tr>
      <td>${r.id}</td><td>${escapeHTML(r.data)}</td><td>${escapeHTML(r.tipo.toUpperCase())}</td>
      <td>${escapeHTML(r.descricao)}</td><td>${formatMoney(r.valor)}</td><td>${escapeHTML(r.forma_pagamento)}</td>
    </tr>`;
  }).join('');
  document.getElementById('cx-entradas').textContent = formatMoney(entradas);
  document.getElementById('cx-saidas').textContent = formatMoney(saidas);
  document.getElementById('cx-saldo').textContent = formatMoney(entradas - saidas);
}

function registrarCaixa() {
  const desc = document.getElementById('cx-desc').value.trim();
  const valorStr = document.getElementById('cx-valor').value.replace(',', '.');
  if (!desc || !valorStr) return alert('Preencha descrição e valor.');
  const valor = parseFloat(valorStr);
  if (isNaN(valor)) return alert('Valor inválido.');
  DB.run('INSERT INTO caixa (tipo,descricao,valor,forma_pagamento) VALUES (?,?,?,?)',
    [document.getElementById('cx-tipo').value, desc, valor, document.getElementById('cx-forma').value]);
  document.getElementById('cx-desc').value = '';
  document.getElementById('cx-valor').value = '';
  carregarCaixa();
  alert('Lançamento registrado!');
}

// ========== REPASSES ==========
function carregarSelectsRepasse() {
  const profs = DB.query('SELECT id, nome FROM profissionais WHERE ativo=1 ORDER BY nome');
  document.getElementById('rep-prof').innerHTML = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option>Nenhum</option>';
}

function carregarRepasses() {
  const rows = DB.query(`
    SELECT r.*, p.nome as profissional FROM repasses r
    LEFT JOIN profissionais p ON p.id=r.profissional_id ORDER BY r.criado_em DESC`);
  document.getElementById('tabela-repasses').innerHTML = rows.map(r => `
    <tr onclick="selectedRepasseId=${r.id}" style="cursor:pointer">
      <td>${r.id}</td><td>${escapeHTML(r.profissional)}</td>
      <td>${escapeHTML(r.periodo_inicio)} a ${escapeHTML(r.periodo_fim)}</td>
      <td>${formatMoney(r.valor_bruto)}</td><td>${r.percentual}%</td>
      <td>${formatMoney(r.valor_repasse)}</td>
      <td>${escapeHTML(r.status.toUpperCase())}</td><td>${escapeHTML(r.data_pagamento || '-')}</td>
    </tr>`).join('');
}

function registrarRepasse() {
  const pid = document.getElementById('rep-prof').value;
  if (!pid) return alert('Selecione um profissional.');
  const bruto = parseFloat((document.getElementById('rep-bruto').value || '0').replace(',', '.'));
  const perc = parseFloat(document.getElementById('rep-perc').value) || 30;
  if (!bruto) return alert('Informe o valor bruto.');
  const repasse = bruto * (perc / 100);
  DB.run(`INSERT INTO repasses (profissional_id,periodo_inicio,periodo_fim,valor_bruto,percentual,valor_repasse)
    VALUES (?,?,?,?,?,?)`, [
    pid, document.getElementById('rep-inicio').value, document.getElementById('rep-fim').value,
    bruto, perc, repasse
  ]);
  alert(`Repasse registrado!\nValor a pagar: ${formatMoney(repasse)}`);
  document.getElementById('rep-bruto').value = '';
  carregarRepasses();
}

function marcarRepassePago() {
  if (!selectedRepasseId) return alert('Selecione um repasse na tabela.');
  DB.run('UPDATE repasses SET status=?, data_pagamento=? WHERE id=?', ['pago', hoje(), selectedRepasseId]);
  selectedRepasseId = null;
  carregarRepasses();
  alert('Marcado como pago com sucesso!');
}

// ========== CONFIGURAÇÕES & USUÁRIOS ==========
function carregarConfig() {
  const rows = DB.query('SELECT * FROM configuracoes');
  const map = {};
  rows.forEach(r => map[r.chave] = r.valor);
  document.getElementById('cfg-nome').value = map.nome_clinica || 'Plennus Clinic';
  document.getElementById('cfg-cnpj').value = map.cnpj_clinica || '';
  document.getElementById('cfg-endereco').value = map.endereco_clinica || '';
  document.getElementById('cfg-cidade').value = map.cidade_clinica || '';
  document.getElementById('cfg-telefone').value = map.telefone_clinica || '';
}

function salvarConfig() {
  const nome = document.getElementById('cfg-nome').value.trim();
  const cnpj = document.getElementById('cfg-cnpj').value.trim();
  const end = document.getElementById('cfg-endereco').value.trim();
  const cid = document.getElementById('cfg-cidade').value.trim();
  const tel = document.getElementById('cfg-telefone').value.trim();

  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nome_clinica', ?)`, [nome]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('cnpj_clinica', ?)`, [cnpj]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('endereco_clinica', ?)`, [end]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('cidade_clinica', ?)`, [cid]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('telefone_clinica', ?)`, [tel]);

  alert('Dados da clínica salvos com sucesso! Esses dados aparecerão nos cabeçalhos dos documentos PDF.');
}

function carregarUsuariosConfig() {
  const tbody = document.getElementById('tabela-usuarios');
  if (!tbody) return;

  const users = DB.query('SELECT id, nome, usuario, nivel, ativo FROM usuarios ORDER BY id');
  const roleClass = { admin: 'badge-admin', medico: 'badge-medico', recepcao: 'badge-recepcao' };
  const roleMap = { admin: 'Administrador', medico: 'Médico', recepcao: 'Recepção' };

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${escapeHTML(u.nome)}</strong></td>
      <td>${escapeHTML(u.usuario)}</td>
      <td><span class="badge-role ${roleClass[u.nivel] || 'badge-admin'}">${roleMap[u.nivel] || u.nivel}</span></td>
      <td>${u.ativo ? '<span style="color:var(--success);font-weight:700;">Ativo</span>' : '<span style="color:var(--danger);">Inativo</span>'}</td>
      <td>
        ${u.id !== currentUser?.id ? `
          <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-success'}" onclick="alternarStatusUsuario(${u.id}, ${u.ativo})">
            ${u.ativo ? 'Desativar' : 'Reativar'}
          </button>` : '<span class="text-muted">(Você)</span>'}
      </td>
    </tr>`).join('');
}

async function salvarNovoUsuario() {
  const nome = document.getElementById('usr-nome').value.trim();
  const login = document.getElementById('usr-login').value.trim();
  const senha = document.getElementById('usr-senha').value.trim();
  const nivel = document.getElementById('usr-nivel').value;

  if (!nome || !login || !senha) return alert('Preencha nome, login e senha.');
  if (senha.length < 6) return alert('A senha do usuário deve possuir no mínimo 6 caracteres.');

  const existe = DB.query('SELECT id FROM usuarios WHERE usuario=?', [login]);
  if (existe.length) return alert('Este login de usuário já está em uso.');

  const passHash = await window.hashPassword(senha);
  DB.run('INSERT INTO usuarios (nome, usuario, senha, nivel, ativo) VALUES (?,?,?,?,1)', [nome, login, passHash, nivel]);

  document.getElementById('usr-nome').value = '';
  document.getElementById('usr-login').value = '';
  document.getElementById('usr-senha').value = '';

  alert(`Usuário ${login} cadastrado com sucesso no perfil ${nivel}!`);
  carregarUsuariosConfig();
}

function alternarStatusUsuario(id, statusAtual) {
  const novoStatus = statusAtual ? 0 : 1;
  DB.run('UPDATE usuarios SET ativo=? WHERE id=?', [novoStatus, id]);
  carregarUsuariosConfig();
}

async function alterarSenha() {
  const atual = document.getElementById('cfg-senha-atual').value;
  const nova = document.getElementById('cfg-senha-nova').value;
  if (!currentUser) return alert('Faça login novamente.');
  if (nova.length < 10) return alert('A nova senha deve ter pelo menos 10 caracteres.');
  if (await window.hashPassword(atual) !== currentUser.senha) return alert('Senha atual incorreta.');
  const hash = await window.hashPassword(nova);
  DB.run('UPDATE usuarios SET senha=? WHERE id=?', [hash, currentUser.id]);
  currentUser.senha = hash;
  document.getElementById('cfg-senha-atual').value = '';
  document.getElementById('cfg-senha-nova').value = '';
  alert('Sua senha foi alterada com sucesso.');
}

async function fazerBackup() {
  const data = DB.export();
  if (window.electronAPI) {
    const res = await window.electronAPI.salvarBackup(Array.from(data));
    if (res.ok) alert('Backup salvo com segurança em:\n' + res.path);
  } else {
    alert('Backup disponível apenas no aplicativo Electron.');
  }
}

async function restaurarBackup() {
  if (!confirm('ATENÇÃO: Restaurar um backup substituirá todos os dados atuais do sistema. Deseja continuar?')) return;
  if (window.electronAPI) {
    const res = await window.electronAPI.abrirBackup();
    if (res.ok) {
      DB.load(res.data);
      alert('Backup restaurado com sucesso! O sistema será recarregado.');
      location.reload();
    }
  } else {
    alert('Restauração disponível apenas no Electron.');
  }
}
