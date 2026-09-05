(function (root) {
  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function buildClinicalEvolution(patientId) {
    const encounters = root.DB.query(`
      SELECT id, data_hora, tipo_atendimento, pressao_arterial, frequencia_cardiaca, temperatura, peso, altura, imc
      FROM prontuario_atendimentos
      WHERE paciente_id=?
      ORDER BY id ASC`, [patientId]);
    const labs = root.DB.query(`
      SELECT e.id AS exame_id, e.data_coleta, e.laboratorio, e.status_revisao,
             r.id AS resultado_id, r.marcador, r.valor, r.valor_texto, r.unidade,
             r.referencia_min, r.referencia_max, r.referencia_texto
      FROM exames_laboratoriais e
      LEFT JOIN exames_resultados r ON r.exame_id=e.id
      WHERE e.paciente_id=?
      ORDER BY e.id ASC, r.id ASC`, [patientId]);
    return {
      encounters,
      labs,
      series: root.PlennusClinicalModel.buildVitalSeries(encounters)
    };
  }

  function latest(series) {
    return series && series.length ? series[series.length - 1] : null;
  }

  function renderClinicalEvolution(patientId, container) {
    const evolution = buildClinicalEvolution(patientId);
    const latestWeight = latest(evolution.series.peso);
    const latestImc = latest(evolution.series.imc);
    const latestPa = latest(evolution.series.pressao_arterial);
    const latestTemp = latest(evolution.series.temperatura);

    const timelineRows = [];
    evolution.encounters.forEach(encounter => {
      const values = [];
      if (encounter.peso !== null && encounter.peso !== undefined) values.push(`Peso ${encounter.peso} kg`);
      if (encounter.imc !== null && encounter.imc !== undefined) values.push(`IMC ${encounter.imc}`);
      if (encounter.pressao_arterial) values.push(`PA ${encounter.pressao_arterial}`);
      if (encounter.frequencia_cardiaca) values.push(`FC ${encounter.frequencia_cardiaca} bpm`);
      if (encounter.temperatura) values.push(`Temp ${encounter.temperatura} °C`);
      timelineRows.push({ date: encounter.data_hora || '', type: 'Atendimento', title: encounter.tipo_atendimento || 'Consulta', detail: values.join(' · ') || 'Sem sinais vitais registrados' });
    });
    evolution.labs.forEach(row => {
      if (!row.marcador) return;
      const resultValue = row.valor !== null && row.valor !== undefined ? `${row.valor}${row.unidade ? ` ${row.unidade}` : ''}` : (row.valor_texto || '—');
      timelineRows.push({ date: row.data_coleta || '', type: 'Exame', title: row.marcador, detail: `${resultValue}${row.laboratorio ? ` · ${row.laboratorio}` : ''}` });
    });
    timelineRows.sort((a, b) => root.PlennusClinicalModel.clinicalDateSortValue(a.date) - root.PlennusClinicalModel.clinicalDateSortValue(b.date));

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Último peso</div><strong>${latestWeight ? `${esc(latestWeight.value)} kg` : '—'}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Último IMC</div><strong>${latestImc ? esc(latestImc.value) : '—'}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Última PA</div><strong>${latestPa ? esc(latestPa.value) : '—'}</strong></div>
        <div class="card" style="margin:0;background:#FAFAFA;"><div class="text-muted">Última temperatura</div><strong>${latestTemp ? `${esc(latestTemp.value)} °C` : '—'}</strong></div>
      </div>
      <div class="card" style="margin:0;background:#FAFAFA;">
        <div class="card-title">Evolução longitudinal</div>
        <p class="text-muted mb-10">Consolidação cronológica de sinais vitais do PEP e resultados laboratoriais. Sem interpretação diagnóstica automática.</p>
        ${timelineRows.length ? `<div class="table-wrapper"><table><thead><tr><th>Data</th><th>Origem</th><th>Registro</th><th>Valor / detalhe</th></tr></thead><tbody>${timelineRows.map(row => `<tr><td>${esc(row.date)}</td><td>${esc(row.type)}</td><td>${esc(row.title)}</td><td>${esc(row.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="text-muted" style="padding:24px;text-align:center;">Ainda não há dados suficientes para evolução longitudinal.</div>'}
      </div>`;
  }

  const api = { buildClinicalEvolution, renderClinicalEvolution };
  root.PlennusClinicalTimeline = api;
  root.buildClinicalEvolution = buildClinicalEvolution;
  root.renderClinicalEvolution = renderClinicalEvolution;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
