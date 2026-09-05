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
      @page { size: A4 portrait; margin: 18mm 18mm 22mm 18mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color:#222; margin:0; padding:0; font-size:14px; line-height:1.6; }
      .header { text-align:center; border-bottom:2px solid ${clinica.cor}; padding-bottom:12px; margin-bottom:20px; }
      .clinic-name { font-size:22px; font-weight:700; color:${clinica.cor}; text-transform:uppercase; letter-spacing:1px; }
      .clinic-info { font-size:12px; color:#666; margin-top:4px; }
      .doc-title { text-align:center; font-size:18px; font-weight:700; margin:20px 0; letter-spacing:.5px; text-transform:uppercase; }
      .patient-box { background:#F9F9F9; border:1px solid #E0E0E0; border-radius:6px; padding:10px 14px; margin-bottom:24px; display:flex; justify-content:space-between; font-size:13px; }
      .content { min-height:380px; font-size:15px; line-height:1.8; }
      .signature-area { margin-top:50px; text-align:center; }
      .signature-line { width:320px; border-top:1px solid #333; margin:0 auto 6px; }
      .doctor-name { font-weight:700; font-size:15px; }
      .doctor-crm { font-size:13px; color:#555; }
      .footer-legal { margin-top:40px; border-top:1px solid #EEE; padding-top:8px; font-size:10px; color:#888; display:flex; justify-content:space-between; }
    </style>
  </head>
  <body>
    <div class="header"><div class="clinic-name">${escapeHTML(clinica.nome)}</div><div class="clinic-info">${escapeHTML(clinica.endereco)} • ${escapeHTML(clinica.cidade)}</div><div class="clinic-info">Tel: ${escapeHTML(clinica.telefone)} • CNPJ: ${escapeHTML(clinica.cnpj)}</div></div>
    <div class="doc-title">${escapeHTML(titulo)}</div>
    <div class="patient-box"><div><strong>Paciente:</strong> ${escapeHTML(paciente.nome)}</div><div><strong>CPF:</strong> ${escapeHTML(paciente.cpf || 'Não informado')}</div><div><strong>Data:</strong> ${dataExtenso}</div></div>
    <div class="content">${corpoHtml}</div>
    <div class="signature-area"><div class="signature-line"></div><div class="doctor-name">Dr(a). ${escapeHTML(profissional.nome)}</div><div class="doctor-crm">${escapeHTML(profissional.crm || 'CRM')} ${profissional.especialidade ? '• ' + escapeHTML(profissional.especialidade) : ''}</div></div>
    <div class="footer-legal"><span>Documento emitido eletronicamente por Plennus Clinic</span><span>${dataExtenso}</span></div>
  </body>
  </html>`;
}

async function enviarParaImpressaoOuPdf(html, nomeArquivo) {
  if (window.electronAPI && window.electronAPI.gerarPdf) {
    const res = await window.electronAPI.gerarPdf(html, nomeArquivo);
    if (res.ok) alert('PDF gerado e salvo com sucesso em:\n' + res.path);
    else if (!res.cancelado) alert('Não foi possível gerar o PDF: ' + (res.error || 'Erro desconhecido'));
  } else {
    const win = window.open('', '_blank');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 500);
  }
}

async function enviarParaImpressaoDireta(html) {
  if (window.electronAPI && window.electronAPI.imprimirDocumento) await window.electronAPI.imprimirDocumento(html);
  else {
    const win = window.open('', '_blank');
    win.document.write(html); win.document.close(); win.focus();
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
  const html = gerarHtmlDocumentoTimbrado({ titulo: 'Receituário Médico', paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'receita' });
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
  const corpo = `<h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;color:var(--primary);">Resumo do Atendimento Clínico (SOAP)</h3>
    <p><strong>Queixa Principal / História Clínica:</strong><br>${escapeHTML(subj || 'Não relatado')}</p>
    <p><strong>Exame Físico / Achados:</strong><br>${escapeHTML(obj || 'Sem alterações')}</p>
    <p><strong>Hipótese Diagnóstica:</strong> ${cid ? '[' + escapeHTML(cid) + '] ' : ''}${escapeHTML(aval || 'Em investigação')}</p>
    <p><strong>Conduta / Orientações:</strong><br>${escapeHTML(plano || 'Sem orientações adicionais')}</p>
    ${presc ? `<p><strong>Medicamentos Prescritos:</strong><br>${escapeHTML(presc).replace(/\n/g, '<br>')}</p>` : ''}`;
  const html = gerarHtmlDocumentoTimbrado({ titulo: 'Resumo de Consulta Médica', paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'resumo' });
  enviarParaImpressaoOuPdf(html, `resumo_${pac.nome.replace(/\s+/g, '_')}_${hoje().replace(/\//g,'-')}.pdf`);
}

function reimprimirReceitaTimeline(atendimentoId) {
  const at = DB.query('SELECT * FROM prontuario_atendimentos WHERE id=?', [atendimentoId])[0];
  if (!at || !at.prescricao_medicamentos) return alert('Atendimento sem prescrição registrada.');
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [at.paciente_id])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [at.profissional_id])[0] || { nome: 'Profissional', crm: '' };
  const corpo = `<div style="white-space:pre-wrap;font-size:15px;">${escapeHTML(at.prescricao_medicamentos)}</div>`;
  enviarParaImpressaoDireta(gerarHtmlDocumentoTimbrado({ titulo: 'Receituário Médico', paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'receita' }));
}

function imprimirResumoTimeline(atendimentoId) {
  const at = DB.query('SELECT * FROM prontuario_atendimentos WHERE id=?', [atendimentoId])[0];
  if (!at) return;
  const pac = DB.query('SELECT * FROM pacientes WHERE id=?', [at.paciente_id])[0];
  const prof = DB.query('SELECT * FROM profissionais WHERE id=?', [at.profissional_id])[0] || { nome: 'Profissional', crm: '' };
  const corpo = `<h3 style="border-bottom:1px solid #ddd;padding-bottom:4px;color:var(--primary);">Evolução Clínica do Dia ${at.data_hora}</h3>
    <p><strong>Queixa:</strong> ${escapeHTML(at.subjetivo_queixa || 'Não relatado')}</p>
    <p><strong>Exame Físico:</strong> ${escapeHTML(at.objetivo_exame || 'Sem alterações')}</p>
    <p><strong>Diagnóstico:</strong> ${at.cid10 ? '[' + escapeHTML(at.cid10) + '] ' : ''}${escapeHTML(at.avaliacao_diagnostico || 'Sem diagnóstico')}</p>
    <p><strong>Conduta:</strong> ${escapeHTML(at.plano_conduta || 'Sem orientações')}</p>
    ${at.prescricao_medicamentos ? `<p><strong>Prescrição:</strong><br>${escapeHTML(at.prescricao_medicamentos).replace(/\n/g, '<br>')}</p>` : ''}`;
  enviarParaImpressaoDireta(gerarHtmlDocumentoTimbrado({ titulo: 'Registro de Atendimento Prontuário', paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'resumo' }));
}

function carregarConvenios() {
  const rows = DB.query('SELECT * FROM convenios WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-convenios').innerHTML = rows.map(r => `<tr onclick="selecionarConvenio(${r.id})" style="cursor:pointer"><td>${r.id}</td><td>${escapeHTML(r.nome)}</td><td>${escapeHTML(r.codigo)}</td><td>${escapeHTML(r.telefone)}</td></tr>`).join('');
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
  const dados = [nome, document.getElementById('conv-codigo').value, document.getElementById('conv-tel').value, document.getElementById('conv-contato').value];
  if (id) DB.run('UPDATE convenios SET nome=?,codigo=?,telefone=?,contato=? WHERE id=?', [...dados, id]);
  else DB.run('INSERT INTO convenios (nome,codigo,telefone,contato) VALUES (?,?,?,?)', dados);
  alert('Convênio salvo com sucesso!');
  limparConvenio(); carregarConvenios();
}

function carregarProcedimentos() {
  const rows = DB.query('SELECT * FROM procedimentos WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-procedimentos').innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${escapeHTML(r.nome)}</td><td>${formatMoney(r.valor_particular)}</td></tr>`).join('');
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
  const html = gerarHtmlDocumentoTimbrado({ titulo: tipo, paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'documento' });
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
  enviarParaImpressaoDireta(gerarHtmlDocumentoTimbrado({ titulo: tipo, paciente: pac, profissional: prof, corpoHtml: corpo, tipoDoc: 'documento' }));
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
    a.href = URL.createObjectURL(blob); a.download = 'documento.txt'; a.click();
  }
}
