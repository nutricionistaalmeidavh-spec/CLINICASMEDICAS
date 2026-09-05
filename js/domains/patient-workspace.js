(function (root) {
  const TABS = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'pep', label: 'Atendimentos / PEP' },
    { id: 'exames', label: 'Exames' },
    { id: 'evolucao', label: 'Evolução' },
    { id: 'arquivos', label: 'Arquivos clínicos' },
    { id: 'documentos', label: 'Encaminhamentos / Documentos' },
    { id: 'consentimentos', label: 'Termos e consentimentos' },
    { id: 'pendencias', label: 'Pendências' }
  ];

  let currentTab = 'resumo';
  let currentPatientId = null;

  function normalizeTab(tab) {
    return TABS.some(item => item.id === tab) ? tab : 'resumo';
  }

  function esc(value) {
    return typeof root.escapeHTML === 'function'
      ? root.escapeHTML(value)
      : String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function ensureShell() {
    if (typeof document === 'undefined') return null;
    let shell = document.getElementById('patient-workspace');
    if (shell) return shell;

    const pepBody = document.getElementById('pep-corpo');
    if (!pepBody || !pepBody.parentNode) return null;

    shell = document.createElement('div');
    shell.id = 'patient-workspace';
    shell.className = 'card';
    shell.style.display = 'none';
    shell.style.padding = '14px';
    shell.innerHTML = `
      <div id="patient-workspace-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>
      <div id="patient-workspace-content"></div>`;
    pepBody.parentNode.insertBefore(shell, pepBody);
    return shell;
  }

  function renderTabs() {
    const container = document.getElementById('patient-workspace-tabs');
    if (!container) return;
    container.innerHTML = TABS.map(tab => `
      <button type="button" class="btn btn-sm ${tab.id === currentTab ? 'btn-primary' : 'btn-secondary'}"
        data-workspace-tab="${tab.id}">${esc(tab.label)}</button>`).join('');
    container.querySelectorAll('[data-workspace-tab]').forEach(button => {
      button.addEventListener('click', () => setPatientWorkspaceTab(button.dataset.workspaceTab));
    });
  }

  function renderSummary(patientId, container) {
    const patient = root.DB.query('SELECT * FROM pacientes WHERE id=?', [patientId])[0];
    if (!patient) {
      container.innerHTML = '<p class="text-muted">Paciente não encontrado.</p>';
      return;
    }
    const encounters = root.DB.query('SELECT id, data_hora, tipo_atendimento, avaliacao_diagnostico FROM prontuario_atendimentos WHERE paciente_id=? ORDER BY id DESC LIMIT 3', [patientId]);
    const labCount = root.DB.query('SELECT COUNT(*) AS total FROM exames_laboratoriais WHERE paciente_id=?', [patientId])[0]?.total || 0;
    const fileCount = root.DB.query('SELECT COUNT(*) AS total FROM arquivos_clinicos WHERE paciente_id=?', [patientId])[0]?.total || 0;
    const consentRows = root.DB.query('SELECT * FROM consentimentos WHERE paciente_id=? ORDER BY id DESC', [patientId]);
    const activeConsents = consentRows.filter(row => root.PlennusClinicalModel.consentStatus(row) === 'autorizado').length;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Atendimentos</div><strong style="font-size:22px;">${encounters.length ? root.DB.query('SELECT COUNT(*) AS total FROM prontuario_atendimentos WHERE paciente_id=?', [patientId])[0].total : 0}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Exames</div><strong style="font-size:22px;">${labCount}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Arquivos</div><strong style="font-size:22px;">${fileCount}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Consentimentos ativos</div><strong style="font-size:22px;">${activeConsents}</strong></div>
      </div>
      <div class="card" style="margin:0;background:#FAFAFA;">
        <div class="card-title">Resumo clínico</div>
        <p><strong>Alergias:</strong> ${esc(patient.alergias || 'Nenhuma registrada')}</p>
        <p><strong>Comorbidades:</strong> ${esc(patient.comorbidades || 'Nenhuma registrada')}</p>
        <p><strong>Uso contínuo:</strong> ${esc(patient.medicamentos_continuos || 'Nenhum registrado')}</p>
        ${encounters.length ? `<div style="margin-top:10px;"><strong>Últimos atendimentos</strong>${encounters.map(item => `<div style="padding:6px 0;border-top:1px solid #eee;">${esc(item.data_hora)} · ${esc(item.tipo_atendimento || 'Consulta')} · ${esc(item.avaliacao_diagnostico || 'Sem avaliação registrada')}</div>`).join('')}</div>` : '<p class="text-muted" style="margin-top:10px;">Nenhum atendimento registrado.</p>'}
      </div>`;
  }

  function renderDocuments(patientId, container) {
    const documents = root.DB.query(`
      SELECT d.*, p.nome AS profissional_nome
      FROM documentos_emitidos d
      LEFT JOIN profissionais p ON p.id=d.profissional_id
      WHERE d.paciente_id=?
      ORDER BY d.id DESC`, [patientId]);
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div><strong>Documentos emitidos</strong><div class="text-muted">Atestados, encaminhamentos, receitas e outros documentos vinculados ao paciente.</div></div>
        <button class="btn btn-primary btn-sm" id="workspace-open-documents">Abrir módulo de documentos</button>
      </div>
      ${documents.length ? documents.map(doc => `<div class="card" style="margin:8px 0;background:#FAFAFA;"><strong>${esc(doc.titulo || doc.tipo || 'Documento')}</strong><div class="text-muted">${esc(doc.data_emissao || '')} · ${esc(doc.profissional_nome || '')}</div></div>`).join('') : '<div class="text-muted" style="padding:20px;text-align:center;">Nenhum documento emitido para este paciente.</div>'}`;
    const button = document.getElementById('workspace-open-documents');
    if (button) button.addEventListener('click', () => {
      if (typeof root.navegar === 'function') root.navegar('documentos');
      const select = document.getElementById('doc-paciente');
      if (select) select.value = String(patientId);
    });
  }

  function renderCurrentTab() {
    if (typeof document === 'undefined' || !currentPatientId) return;
    const content = document.getElementById('patient-workspace-content');
    const pepBody = document.getElementById('pep-corpo');
    if (!content) return;

    renderTabs();
    if (currentTab === 'pep') {
      content.style.display = 'none';
      if (pepBody) pepBody.style.display = 'grid';
      return;
    }

    if (pepBody) pepBody.style.display = 'none';
    content.style.display = 'block';
    content.innerHTML = '';

    const renderers = {
      resumo: () => renderSummary(currentPatientId, content),
      exames: () => root.renderLabs?.(currentPatientId, content),
      evolucao: () => root.renderClinicalEvolution?.(currentPatientId, content),
      arquivos: () => root.renderClinicalFiles?.(currentPatientId, content),
      documentos: () => renderDocuments(currentPatientId, content),
      consentimentos: () => root.renderConsents?.(currentPatientId, content),
      pendencias: () => root.renderClinicalPending?.(currentPatientId, content)
    };

    const renderer = renderers[currentTab] || renderers.resumo;
    renderer();
    if (!content.innerHTML.trim()) content.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">Conteúdo indisponível.</div>';
  }

  function setPatientWorkspaceTab(tab) {
    currentTab = normalizeTab(tab);
    renderCurrentTab();
    return currentTab;
  }

  function refreshPatientWorkspace(patientId, preferredTab) {
    const shell = ensureShell();
    if (!shell) return;
    if (!patientId) {
      currentPatientId = null;
      shell.style.display = 'none';
      const pepBody = document.getElementById('pep-corpo');
      if (pepBody) pepBody.style.display = 'none';
      return;
    }
    if (String(currentPatientId) !== String(patientId)) currentTab = normalizeTab(preferredTab || 'resumo');
    else if (preferredTab) currentTab = normalizeTab(preferredTab);
    currentPatientId = Number(patientId);
    shell.style.display = 'block';
    renderCurrentTab();
  }

  function openPatientWorkspace(patientId, tab = 'resumo') {
    const normalized = normalizeTab(tab);
    if (typeof document === 'undefined') return normalized;
    const select = document.getElementById('pep-paciente');
    if (select && String(select.value) !== String(patientId)) {
      select.value = String(patientId);
      if (typeof root.selecionarPacientePep === 'function') root.selecionarPacientePep(patientId);
    }
    refreshPatientWorkspace(patientId, normalized);
    return normalized;
  }

  const api = { TABS, normalizeTab, openPatientWorkspace, refreshPatientWorkspace, setPatientWorkspaceTab };
  root.PlennusPatientWorkspace = api;
  root.openPatientWorkspace = openPatientWorkspace;
  root.refreshPatientWorkspace = refreshPatientWorkspace;
  root.setPatientWorkspaceTab = setPatientWorkspaceTab;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
