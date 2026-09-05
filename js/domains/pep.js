function carregarSelectsPep() {
  const pacs = DB.query('SELECT id, nome, cpf FROM pacientes WHERE ativo=1 ORDER BY nome');
  const profs = DB.query('SELECT id, nome FROM profissionais WHERE ativo=1 ORDER BY nome');
  const optsP = ['<option value="">-- Selecione um paciente --</option>']
    .concat(pacs.map(p => `<option value="${p.id}">${p.nome} ${p.cpf ? '(' + p.cpf + ')' : ''}</option>`)).join('');
  const optsR = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option value="">Nenhum</option>';
  document.getElementById('pep-paciente').innerHTML = optsP;
  document.getElementById('pep-profissional').innerHTML = optsR;
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
    if (typeof refreshPatientWorkspace === 'function') refreshPatientWorkspace(null);
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

  const alertBox = document.getElementById('pep-alergia-alert');
  const alertText = document.getElementById('pep-alergia-text');
  if (p.alergias && p.alergias.trim()) {
    alertBox.className = 'pep-alert-box';
    alertText.innerHTML = `⚠️ <strong>ALERGIAS REGISTRADAS:</strong> ${escapeHTML(p.alergias)}`;
  } else {
    alertBox.className = 'pep-alert-box no-allergy';
    alertText.innerHTML = `✅ <strong>Nenhuma alergia conhecida</strong>`;
  }

  const comorbText = [];
  if (p.comorbidades) comorbText.push(p.comorbidades);
  if (p.medicamentos_continuos) comorbText.push(`Em uso de: ${p.medicamentos_continuos}`);
  document.getElementById('pep-display-comorbidades').textContent = comorbText.join(' | ') || 'Nenhuma comorbidade registrada';
  document.getElementById('pep-patient-card').style.display = 'block';
  document.getElementById('pep-corpo').style.display = 'grid';
  novoAtendimentoPep();
  carregarTimelinePep(pid);
  if (typeof refreshPatientWorkspace === 'function') refreshPatientWorkspace(pid);
}

function novoAtendimentoPep() {
  document.getElementById('pep-atendimento-id').value = '';
  document.getElementById('pep-data-atendimento').textContent = `Data: ${hoje()} às ${agoraHora()}`;
  document.getElementById('pep-tipo-atendimento').value = 'Consulta';
  ['pep-subjetivo','pep-pa','pep-fc','pep-temp','pep-peso','pep-altura','pep-imc','pep-objetivo','pep-cid10','pep-avaliacao','pep-plano','pep-prescricao']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pep-imc-tag').innerHTML = '';
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
  if (!subj && !aval && !plano && !presc) return alert('Preencha ao menos um dos campos clínicos da consulta (Subjetivo, Avaliação ou Conduta).');
  const dataHora = `${hoje()} ${agoraHora()}`;
  DB.run(`INSERT INTO prontuario_atendimentos
    (paciente_id, profissional_id, data_hora, tipo_atendimento, subjetivo_queixa, objetivo_exame,
     pressao_arterial, frequencia_cardiaca, temperatura, peso, altura, imc, avaliacao_diagnostico,
     cid10, plano_conduta, prescricao_medicamentos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [selectedPepPacienteId, profId, dataHora, tipo, subj, obj, pa, fc, temp, peso, altura, imc, aval, cid, plano, presc]);
  alert('Atendimento salvo com sucesso no prontuário do paciente!');
  carregarTimelinePep(selectedPepPacienteId);
  if (typeof refreshPatientWorkspace === 'function') refreshPatientWorkspace(selectedPepPacienteId, 'pep');
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
    container.innerHTML = `<div class="card" style="text-align:center;padding:30px 10px;background:#FAFAFA;"><p class="text-muted">Nenhum atendimento anterior registrado para este paciente.</p><button class="btn btn-primary btn-sm mt-10" onclick="novoAtendimentoPep()">Iniciar Primeiro Atendimento</button></div>`;
    return;
  }
  container.innerHTML = atendimentos.map(at => {
    const vitalsParts = [];
    if (at.pressao_arterial) vitalsParts.push(`PA: ${escapeHTML(at.pressao_arterial)}`);
    if (at.frequencia_cardiaca) vitalsParts.push(`FC: ${at.frequencia_cardiaca} bpm`);
    if (at.temperatura) vitalsParts.push(`Temp: ${at.temperatura}°C`);
    if (at.peso) vitalsParts.push(`Peso: ${at.peso} kg`);
    if (at.imc) vitalsParts.push(`IMC: ${at.imc}`);
    const vitalsStr = vitalsParts.length ? `<div style="font-size:12px;color:#0277BD;margin:4px 0;">📊 ${vitalsParts.join(' | ')}</div>` : '';
    const cidStr = at.cid10 ? `<span class="badge-role badge-admin">CID: ${escapeHTML(at.cid10)}</span> ` : '';
    return `
      <div class="timeline-item">
        <div class="timeline-date"><span>📅 ${at.data_hora} • <strong>${escapeHTML(at.tipo_atendimento || 'Consulta')}</strong></span><span style="color:var(--primary);">${escapeHTML(at.profissional_nome || 'Médico')}</span></div>
        <div class="timeline-content">
          ${cidStr}<strong>${escapeHTML(at.avaliacao_diagnostico || 'Sem diagnóstico formal')}</strong>${vitalsStr}
          ${at.subjetivo_queixa ? `<p style="margin-top:4px;"><strong>Queixa:</strong> ${escapeHTML(at.subjetivo_queixa)}</p>` : ''}
          ${at.plano_conduta ? `<p style="margin-top:4px;"><strong>Conduta:</strong> ${escapeHTML(at.plano_conduta)}</p>` : ''}
          ${at.prescricao_medicamentos ? `<div style="background:#F1F8E9;border:1px solid #DCEDC8;padding:6px 10px;border-radius:6px;margin-top:6px;font-size:12px;"><strong>💊 Prescrição:</strong><br>${escapeHTML(at.prescricao_medicamentos).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;">${at.prescricao_medicamentos ? `<button class="btn btn-sm btn-success" style="height:26px;font-size:11px;padding:0 8px;" onclick="reimprimirReceitaTimeline(${at.id})">🖨️ Imprimir Receita</button>` : ''}<button class="btn btn-sm btn-info" style="height:26px;font-size:11px;padding:0 8px;" onclick="imprimirResumoTimeline(${at.id})">📄 Resumo Completo</button></div>
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
  if (typeof openPatientWorkspace === 'function') openPatientWorkspace(id, 'pep');
}

function abrirProntuarioDaAgenda(pacId, profId) {
  navegar('prontuario');
  document.getElementById('pep-paciente').value = pacId;
  if (profId) document.getElementById('pep-profissional').value = profId;
  selecionarPacientePep(pacId);
  if (typeof openPatientWorkspace === 'function') openPatientWorkspace(pacId, 'pep');
}

function limparFormularioPep() {
  novoAtendimentoPep();
}
