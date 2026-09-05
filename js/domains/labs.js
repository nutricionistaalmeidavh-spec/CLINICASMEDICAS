(function (root) {
  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function listLabExams(patientId) {
    const exams = root.DB.query('SELECT * FROM exames_laboratoriais WHERE paciente_id=? ORDER BY COALESCE(data_coleta, criado_em) DESC, id DESC', [patientId]);
    return exams.map(exam => ({
      ...exam,
      resultados: root.DB.query('SELECT * FROM exames_resultados WHERE exame_id=? ORDER BY id', [exam.id])
    }));
  }

  function saveLabExam(patientId, exam, results) {
    const dataColeta = String(exam?.data_coleta || '').trim() || null;
    const laboratorio = String(exam?.laboratorio || '').trim() || null;
    const observacao = String(exam?.observacao || '').trim() || null;
    root.DB.run(`INSERT INTO exames_laboratoriais
      (paciente_id, data_coleta, laboratorio, status_revisao, observacao)
      VALUES (?,?,?,?,?)`, [Number(patientId), dataColeta, laboratorio, 'pendente', observacao]);
    const examId = root.DB.getLastId();

    (results || []).forEach(result => {
      const marker = String(result?.marcador || '').trim();
      if (!marker) return;
      const rawValue = String(result?.valor_entrada ?? result?.valor ?? '').trim();
      const numericValue = toNumberOrNull(rawValue);
      const textValue = numericValue === null && rawValue ? rawValue : String(result?.valor_texto || '').trim() || null;
      root.DB.run(`INSERT INTO exames_resultados
        (exame_id, marcador, valor, valor_texto, unidade, referencia_min, referencia_max, referencia_texto)
        VALUES (?,?,?,?,?,?,?,?)`, [
        examId,
        marker,
        numericValue,
        textValue,
        String(result?.unidade || '').trim() || null,
        toNumberOrNull(result?.referencia_min),
        toNumberOrNull(result?.referencia_max),
        String(result?.referencia_texto || '').trim() || null
      ]);
    });

    return { ok: true, id: examId };
  }

  function markLabReviewed(id) {
    root.DB.run("UPDATE exames_laboratoriais SET status_revisao='revisado' WHERE id=?", [id]);
    return { ok: true };
  }

  function resultStatusLabel(result) {
    const status = root.PlennusClinicalModel.labResultStatus(result);
    if (status === 'baixo') return 'Abaixo da referência';
    if (status === 'alto') return 'Acima da referência';
    if (status === 'normal') return 'Dentro da referência';
    return '';
  }

  function resultReference(result) {
    if (result.referencia_texto) return result.referencia_texto;
    if (result.referencia_min !== null && result.referencia_min !== undefined && result.referencia_max !== null && result.referencia_max !== undefined) {
      return `${result.referencia_min}–${result.referencia_max}${result.unidade ? ` ${result.unidade}` : ''}`;
    }
    return '';
  }

  function resultEditorRow() {
    return `<div class="lab-result-row" style="display:grid;grid-template-columns:1.5fr 1fr .8fr .8fr .8fr 1.3fr;gap:6px;margin-bottom:6px;">
      <input data-lab-field="marcador" placeholder="Marcador *">
      <input data-lab-field="valor" placeholder="Valor / texto">
      <input data-lab-field="unidade" placeholder="Unidade">
      <input data-lab-field="min" placeholder="Ref. mín.">
      <input data-lab-field="max" placeholder="Ref. máx.">
      <input data-lab-field="reftexto" placeholder="Referência textual">
    </div>`;
  }

  function readResultRows(container) {
    return Array.from(container.querySelectorAll('.lab-result-row')).map(row => ({
      marcador: row.querySelector('[data-lab-field="marcador"]')?.value,
      valor_entrada: row.querySelector('[data-lab-field="valor"]')?.value,
      unidade: row.querySelector('[data-lab-field="unidade"]')?.value,
      referencia_min: row.querySelector('[data-lab-field="min"]')?.value,
      referencia_max: row.querySelector('[data-lab-field="max"]')?.value,
      referencia_texto: row.querySelector('[data-lab-field="reftexto"]')?.value
    })).filter(row => String(row.marcador || '').trim());
  }

  function renderLabs(patientId, container) {
    const exams = listLabExams(patientId);
    container.innerHTML = `
      <div class="card" style="margin:0 0 12px;background:#FAFAFA;">
        <div class="card-title">Registrar exame laboratorial</div>
        <div class="form-row">
          <div class="form-group" style="max-width:180px;"><label>Data da coleta</label><input id="lab-date" type="date"></div>
          <div class="form-group"><label>Laboratório</label><input id="lab-name" type="text" placeholder="Nome do laboratório"></div>
        </div>
        <div class="form-group"><label>Observação</label><input id="lab-note" type="text" placeholder="Observação clínica ou administrativa"></div>
        <div style="margin:10px 0 6px;"><strong>Resultados</strong><div class="text-muted">A classificação é exibida apenas quando valor e limites numéricos são informados.</div></div>
        <div id="lab-results-editor">${resultEditorRow()}</div>
        <div class="form-actions" style="justify-content:space-between;">
          <button class="btn btn-secondary btn-sm" id="lab-add-result">+ Resultado</button>
          <button class="btn btn-primary btn-sm" id="lab-save">Salvar exame</button>
        </div>
      </div>
      <div class="card-title">Exames registrados</div>
      ${exams.length ? exams.map(exam => `
        <div class="card" style="margin:8px 0;background:#FAFAFA;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div><strong>${esc(exam.laboratorio || 'Exame laboratorial')}</strong><div class="text-muted">${esc(exam.data_coleta || exam.criado_em || '')} · ${exam.status_revisao === 'revisado' ? 'Revisado' : 'Aguardando revisão'}</div></div>
            ${exam.status_revisao !== 'revisado' ? `<button class="btn btn-success btn-sm" data-review-lab="${exam.id}">Marcar revisado</button>` : ''}
          </div>
          ${exam.observacao ? `<div style="margin-top:6px;">${esc(exam.observacao)}</div>` : ''}
          <div class="table-wrapper" style="margin-top:8px;"><table><thead><tr><th>Marcador</th><th>Resultado</th><th>Referência</th><th>Situação</th></tr></thead><tbody>
            ${exam.resultados.length ? exam.resultados.map(result => {
              const value = result.valor !== null && result.valor !== undefined ? `${result.valor}${result.unidade ? ` ${esc(result.unidade)}` : ''}` : esc(result.valor_texto || '—');
              return `<tr><td>${esc(result.marcador)}</td><td>${value}</td><td>${esc(resultReference(result) || '—')}</td><td>${esc(resultStatusLabel(result) || 'Sem classificação automática')}</td></tr>`;
            }).join('') : '<tr><td colspan="4" class="text-muted">Nenhum resultado estruturado.</td></tr>'}
          </tbody></table></div>
        </div>`).join('') : '<div class="text-muted" style="padding:24px;text-align:center;">Nenhum exame laboratorial registrado.</div>'}`;

    container.querySelector('#lab-add-result')?.addEventListener('click', () => {
      container.querySelector('#lab-results-editor')?.insertAdjacentHTML('beforeend', resultEditorRow());
    });
    container.querySelector('#lab-save')?.addEventListener('click', () => {
      saveLabExam(patientId, {
        data_coleta: container.querySelector('#lab-date')?.value,
        laboratorio: container.querySelector('#lab-name')?.value,
        observacao: container.querySelector('#lab-note')?.value
      }, readResultRows(container));
      renderLabs(patientId, container);
    });
    container.querySelectorAll('[data-review-lab]').forEach(button => {
      button.addEventListener('click', () => {
        markLabReviewed(Number(button.dataset.reviewLab));
        renderLabs(patientId, container);
      });
    });
  }

  const api = { listLabExams, saveLabExam, markLabReviewed, renderLabs };
  root.PlennusLabs = api;
  root.renderLabs = renderLabs;
  root.saveLabExam = saveLabExam;
  root.markLabReviewed = markLabReviewed;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
