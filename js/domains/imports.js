(function (root) {
  let currentPreview = null;
  let currentFileName = '';

  function isAdmin() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return root.PlennusAccessControl?.canImportPatients ? root.PlennusAccessControl.canImportPatients(role) : role === 'admin';
  }

  function ensureImportUi() {
    const menu = document.getElementById('sidebar-menu');
    if (menu && !menu.querySelector('[data-page="importar"]')) {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.dataset.page = 'importar';
      item.dataset.roles = 'admin';
      item.textContent = '⇧  Importar pacientes';
      item.addEventListener('click', () => root.navegar('importar'));
      menu.appendChild(item);
    }
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('page-importar')) {
      const page = document.createElement('div');
      page.className = 'page';
      page.id = 'page-importar';
      page.innerHTML = `
        <div class="page-heading-row"><div><h1 class="page-title">Importar pacientes</h1><p class="text-muted">Revise todos os registros antes de gravar no banco.</p></div></div>
        <div class="card">
          <div class="card-title">Arquivo CSV ou XLSX</div>
          <p class="text-muted" style="margin-bottom:14px">Limite de 5.000 linhas. Pacientes existentes nunca são sobrescritos automaticamente.</p>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="import-select-file" style="width:auto">Selecionar arquivo</button><button class="btn btn-secondary btn-sm" id="import-cancel" style="display:none">Cancelar prévia</button></div>
          <div id="import-file-name" class="text-muted" style="margin-top:10px"></div>
        </div>
        <div id="import-preview-card" class="card" hidden>
          <div class="card-title">Prévia da importação</div>
          <div id="import-summary" class="import-summary"></div>
          <div class="table-wrapper"><table class="import-preview-table"><thead><tr><th>Linha</th><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Status</th></tr></thead><tbody id="import-preview-body"></tbody></table></div>
          <div class="form-actions" style="margin-top:16px"><button class="btn btn-success btn-sm" id="import-confirm">Confirmar registros válidos</button><button class="btn btn-secondary btn-sm" id="import-cancel-bottom">Cancelar</button></div>
        </div>`;
      main.appendChild(page);
      page.querySelector('#import-select-file').addEventListener('click', selectFile);
      page.querySelector('#import-cancel').addEventListener('click', clearPreview);
      page.querySelector('#import-cancel-bottom').addEventListener('click', clearPreview);
      page.querySelector('#import-confirm').addEventListener('click', confirmImport);
    }
  }

  function allExistingPatients() {
    return DB.query('SELECT id,nome,cpf,data_nascimento FROM pacientes WHERE ativo=1');
  }

  async function selectFile() {
    if (!isAdmin()) return alert('A importação de pacientes é restrita ao administrador.');
    if (!window.electronAPI?.selecionarArquivoImportacao) return alert('Importação disponível no aplicativo desktop.');
    const selected = await window.electronAPI.selecionarArquivoImportacao();
    if (!selected?.ok) {
      if (!selected?.cancelado) alert(selected?.error || 'Não foi possível ler o arquivo.');
      return;
    }
    currentFileName = selected.name || 'importacao';
    let rows = selected.rows;
    if (!rows && selected.type === 'csv') rows = root.PlennusImportModel.parseCsv(selected.text || '');
    if (!Array.isArray(rows)) return alert('Formato de arquivo não reconhecido.');
    currentPreview = root.PlennusImportModel.buildImportPreview(rows.slice(0, 5000), allExistingPatients());
    renderPreview();
  }

  function statusRows() {
    if (!currentPreview) return [];
    return [
      ...currentPreview.valid.map(item => ({ ...item, status: 'valid', label: 'Válido' })),
      ...currentPreview.duplicates.map(item => ({ ...item, status: 'duplicate', label: item.duplicate.reason === 'cpf' ? 'Duplicado por CPF' : 'Duplicado por nome+nascimento' })),
      ...currentPreview.invalid.map(item => ({ ...item, status: 'invalid', label: 'Inválido' }))
    ].sort((a, b) => a.index - b.index);
  }

  function renderPreview() {
    const card = document.getElementById('import-preview-card');
    if (!card || !currentPreview) return;
    card.hidden = false;
    document.getElementById('import-file-name').textContent = currentFileName;
    document.getElementById('import-cancel').style.display = 'inline-flex';
    document.getElementById('import-summary').innerHTML = `
      <div><span>Total</span><strong>${currentPreview.total}</strong></div>
      <div><span>Válidos</span><strong>${currentPreview.valid.length}</strong></div>
      <div><span>Duplicados</span><strong>${currentPreview.duplicates.length}</strong></div>
      <div><span>Inválidos</span><strong>${currentPreview.invalid.length}</strong></div>`;
    const body = document.getElementById('import-preview-body');
    body.innerHTML = statusRows().slice(0, 250).map(item => {
      const p = item.patient || {};
      return `<tr><td>${item.index + 2}</td><td>${escapeHTML(p.nome || '')}</td><td>${escapeHTML(p.cpf || '')}</td><td>${escapeHTML(p.data_nascimento || '')}</td><td class="status-${item.status}">${escapeHTML(item.label)}</td></tr>`;
    }).join('');
    document.getElementById('import-confirm').disabled = currentPreview.valid.length === 0;
  }

  function clearPreview() {
    currentPreview = null;
    currentFileName = '';
    const card = document.getElementById('import-preview-card');
    if (card) card.hidden = true;
    const label = document.getElementById('import-file-name');
    if (label) label.textContent = '';
    const cancel = document.getElementById('import-cancel');
    if (cancel) cancel.style.display = 'none';
  }

  function insertPatient(patient) {
    DB.run(`INSERT INTO pacientes (nome,cpf,data_nascimento,celular,telefone,email,sexo,cidade,uf,observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      patient.nome || '', patient.cpf || '', patient.data_nascimento || '', patient.celular || '', patient.telefone || '',
      patient.email || '', patient.sexo || '', patient.cidade || '', patient.uf || '', patient.observacoes || ''
    ]);
  }

  function confirmImport() {
    if (!isAdmin() || !currentPreview) return;
    const total = currentPreview.total;
    const validRows = currentPreview.valid;
    let inserted = 0;
    try {
      validRows.forEach(item => { insertPatient(item.patient); inserted += 1; });
      DB.run(`INSERT INTO import_history (usuario_id,tipo,nome_arquivo,total_linhas,inseridos,ignorados,erros,resumo)
        VALUES (?,?,?,?,?,?,?,?)`, [
        currentUser?.id || null, 'pacientes', currentFileName, total, inserted,
        currentPreview.duplicates.length, currentPreview.invalid.length,
        JSON.stringify({ duplicates: currentPreview.duplicates.length, invalid: currentPreview.invalid.length })
      ]);
      root.PlennusAudit?.log({ acao:'importacao_pacientes', entidade:'import_history', camposAlterados:{ inserted }, contexto:{ file: currentFileName, total } }, { strict:true });
      DB.save?.();
      alert(`${inserted} paciente(s) importado(s) com sucesso.`);
      clearPreview();
    } catch (error) {
      console.error('Falha na importação:', error);
      alert('A importação não pôde ser concluída. Nenhum paciente existente foi sobrescrito.');
    }
  }

  function carregarImportacao() {
    ensureImportUi();
  }

  root.PlennusImports = { ensureImportUi, selectFile, renderPreview, clearPreview, confirmImport, carregarImportacao };
  root.carregarImportacao = carregarImportacao;
})(typeof window !== 'undefined' ? window : globalThis);
