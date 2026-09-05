(function (root) {
  let selectedDesktopFile = null;

  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function listClinicalFiles(patientId) {
    return root.DB.query(`
      SELECT * FROM arquivos_clinicos
      WHERE paciente_id=?
      ORDER BY COALESCE(data_registro, criado_em) DESC, id DESC`, [patientId]);
  }

  function saveClinicalFileMetadata(patientId, input) {
    const payload = {
      paciente_id: Number(patientId),
      categoria: String(input?.categoria || '').trim(),
      nome_arquivo: String(input?.nome_arquivo || '').trim(),
      caminho_arquivo: String(input?.caminho_arquivo || '').trim() || null,
      mime_type: String(input?.mime_type || '').trim() || null,
      observacao: String(input?.observacao || '').trim() || null,
      data_registro: String(input?.data_registro || '').trim() || new Date().toISOString().slice(0, 10)
    };
    const errors = root.PlennusClinicalModel.validateClinicalFileMetadata(payload);
    if (errors.length) return { ok: false, errors };
    root.DB.run(`INSERT INTO arquivos_clinicos
      (paciente_id, categoria, nome_arquivo, caminho_arquivo, mime_type, observacao, data_registro)
      VALUES (?,?,?,?,?,?,?)`, [
      payload.paciente_id, payload.categoria, payload.nome_arquivo, payload.caminho_arquivo,
      payload.mime_type, payload.observacao, payload.data_registro
    ]);
    return { ok: true, id: root.DB.getLastId() };
  }

  async function chooseClinicalFile() {
    if (root.electronAPI?.selecionarArquivoClinico) {
      const result = await root.electronAPI.selecionarArquivoClinico();
      if (result?.ok) selectedDesktopFile = result;
      return result;
    }
    return { ok: false, unsupported: true };
  }

  async function openClinicalFile(id) {
    const row = root.DB.query('SELECT caminho_arquivo FROM arquivos_clinicos WHERE id=?', [id])[0];
    if (!row?.caminho_arquivo || !root.electronAPI?.abrirArquivoClinico) return { ok: false };
    return root.electronAPI.abrirArquivoClinico(row.caminho_arquivo);
  }

  function deleteClinicalFileMetadata(id, patientId, container) {
    if (typeof confirm === 'function' && !confirm('Remover este arquivo do prontuário? O arquivo original não será apagado do computador.')) return;
    root.DB.run('DELETE FROM arquivos_clinicos WHERE id=?', [id]);
    renderClinicalFiles(patientId, container);
  }

  function renderClinicalFiles(patientId, container) {
    const rows = listClinicalFiles(patientId);
    container.innerHTML = `
      <div class="card" style="margin:0 0 12px;background:#FAFAFA;">
        <div class="card-title">Novo arquivo clínico</div>
        <div class="form-row">
          <div class="form-group" style="max-width:190px;"><label>Categoria *</label>
            <select id="clinical-file-category">
              <option value="Imagem clínica">Imagem clínica</option>
              <option value="Exame">Exame / laudo</option>
              <option value="Documento externo">Documento externo</option>
              <option value="Encaminhamento">Encaminhamento</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div class="form-group"><label>Arquivo *</label><input id="clinical-file-name" type="text" readonly placeholder="Nenhum arquivo selecionado"></div>
          <div class="form-group" style="max-width:180px;align-self:flex-end;"><button class="btn btn-secondary btn-sm" id="clinical-file-choose" style="width:100%;">Selecionar arquivo</button></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Observação</label><input id="clinical-file-note" type="text" placeholder="Descrição clínica opcional"></div>
          <div class="form-group" style="max-width:170px;"><label>Data</label><input id="clinical-file-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="clinical-file-save">Adicionar ao prontuário</button></div>
      </div>
      <div>
        <div class="card-title">Arquivos do paciente</div>
        ${rows.length ? rows.map(row => `
          <div class="card" style="margin:8px 0;background:#FAFAFA;display:flex;justify-content:space-between;gap:12px;align-items:center;">
            <div style="min-width:0;">
              <div><strong>${esc(row.nome_arquivo)}</strong> <span class="badge-role badge-medico">${esc(row.categoria)}</span></div>
              <div class="text-muted">${esc(row.data_registro || row.criado_em || '')}${row.mime_type ? ` · ${esc(row.mime_type)}` : ''}</div>
              ${row.observacao ? `<div style="margin-top:4px;">${esc(row.observacao)}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
              ${row.caminho_arquivo && root.electronAPI?.abrirArquivoClinico ? `<button class="btn btn-info btn-sm" data-open-clinical-file="${row.id}">Abrir</button>` : ''}
              <button class="btn btn-danger btn-sm" data-delete-clinical-file="${row.id}">Remover vínculo</button>
            </div>
          </div>`).join('') : '<div class="text-muted" style="padding:24px;text-align:center;">Nenhum arquivo clínico registrado.</div>'}
      </div>`;

    const chooseButton = container.querySelector('#clinical-file-choose');
    const fileName = container.querySelector('#clinical-file-name');
    if (selectedDesktopFile?.name) fileName.value = selectedDesktopFile.name;
    chooseButton?.addEventListener('click', async () => {
      const result = await chooseClinicalFile();
      if (result?.ok) fileName.value = result.name || result.path || '';
      else if (result?.unsupported && typeof alert === 'function') alert('Seleção de arquivo disponível apenas no aplicativo desktop.');
    });

    container.querySelector('#clinical-file-save')?.addEventListener('click', () => {
      const result = saveClinicalFileMetadata(patientId, {
        categoria: container.querySelector('#clinical-file-category')?.value,
        nome_arquivo: selectedDesktopFile?.name || fileName.value,
        caminho_arquivo: selectedDesktopFile?.path || null,
        mime_type: selectedDesktopFile?.mimeType || null,
        observacao: container.querySelector('#clinical-file-note')?.value,
        data_registro: container.querySelector('#clinical-file-date')?.value
      });
      if (!result.ok) {
        if (typeof alert === 'function') alert('Selecione um arquivo e informe a categoria.');
        return;
      }
      selectedDesktopFile = null;
      renderClinicalFiles(patientId, container);
    });

    container.querySelectorAll('[data-open-clinical-file]').forEach(button => {
      button.addEventListener('click', () => openClinicalFile(Number(button.dataset.openClinicalFile)));
    });
    container.querySelectorAll('[data-delete-clinical-file]').forEach(button => {
      button.addEventListener('click', () => deleteClinicalFileMetadata(Number(button.dataset.deleteClinicalFile), patientId, container));
    });
  }

  const api = { renderClinicalFiles, saveClinicalFileMetadata, listClinicalFiles, chooseClinicalFile, openClinicalFile };
  root.PlennusClinicalFiles = api;
  root.renderClinicalFiles = renderClinicalFiles;
  root.saveClinicalFileMetadata = saveClinicalFileMetadata;
  root.listClinicalFiles = listClinicalFiles;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
