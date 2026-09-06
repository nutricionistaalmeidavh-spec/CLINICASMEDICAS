(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusDocumentRenderer = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function section(title, html, options = {}) {
    return { type: 'section', title, html: String(html || ''), breakBefore: !!options.breakBefore, keepTogether: options.keepTogether !== false };
  }

  function pageBreak() { return { type: 'page-break' }; }

  function safeColor(value) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#C41E3A';
  }

  function renderDocument({ title, clinic = {}, patient = {}, professional = {}, sections = [], images = [], footer = '' } = {}) {
    const color = safeColor(clinic.cor);
    const imageHtml = images
      .filter(image => /^data:image\/(png|jpe?g|webp);base64,/i.test(String(image?.dataUrl || '')))
      .slice(0, 12)
      .map(image => `<figure class="clinical-image"><img src="${image.dataUrl}" alt="${escape(image.name || 'Imagem clínica')}"><figcaption>${escape(image.name || '')}</figcaption></figure>`)
      .join('');
    const sectionsHtml = sections.map(item => {
      if (item?.type === 'page-break') return '<div class="page-break" aria-hidden="true"></div>';
      if (item?.type !== 'section') return '';
      return `<section class="document-section${item.keepTogether ? ' keep-together' : ''}${item.breakBefore ? ' break-before' : ''}">
        ${item.title ? `<h2>${escape(item.title)}</h2>` : ''}
        <div class="section-content">${item.html}</div>
      </section>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${escape(title || 'Documento')}</title>
<style>
@page { size: A4 portrait; margin: 18mm 18mm 22mm 18mm; }
:root { --primary: ${color}; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; color:#202124; margin:0; font-size:13px; line-height:1.55; }
.header { border-bottom:2px solid ${color}; padding-bottom:10px; margin-bottom:18px; }
.clinic-name { color:${color}; font-size:20px; font-weight:750; text-transform:uppercase; letter-spacing:.04em; }
.clinic-info { color:#667085; font-size:11px; margin-top:2px; }
.document-title { text-align:center; text-transform:uppercase; letter-spacing:.04em; font-size:18px; margin:18px 0; }
.patient-box { display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px 18px; background:#F8FAFC; border:1px solid #E4E7EC; border-radius:6px; padding:10px 12px; margin-bottom:18px; }
.document-section { margin:0 0 18px; }
.document-section h2 { color:${color}; font-size:14px; margin:0 0 7px; padding-bottom:5px; border-bottom:1px solid #E4E7EC; }
.keep-together { break-inside: avoid; page-break-inside: avoid; }
.break-before, .page-break { break-before: page; page-break-before: always; }
.image-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:16px; }
.clinical-image { margin:0; break-inside:avoid; }
.clinical-image img { width:100%; max-height:90mm; object-fit:contain; border:1px solid #E4E7EC; border-radius:4px; }
.clinical-image figcaption { font-size:10px; color:#667085; margin-top:3px; }
.signature-area { margin-top:36px; text-align:center; break-inside:avoid; }
.signature-line { width:300px; border-top:1px solid #344054; margin:0 auto 6px; }
.doctor-name { font-weight:700; }
.doctor-crm { color:#667085; font-size:11px; }
.footer-legal { margin-top:28px; padding-top:7px; border-top:1px solid #EAECF0; color:#98A2B3; font-size:9px; display:flex; justify-content:space-between; }
</style></head><body>
<header class="header"><div class="clinic-name">${escape(clinic.nome || 'Plennus Clinic')}</div><div class="clinic-info">${escape([clinic.endereco, clinic.cidade].filter(Boolean).join(' • '))}</div><div class="clinic-info">${escape([clinic.telefone && `Tel: ${clinic.telefone}`, clinic.cnpj && `CNPJ: ${clinic.cnpj}`].filter(Boolean).join(' • '))}</div></header>
<h1 class="document-title">${escape(title || 'Documento')}</h1>
<div class="patient-box"><div><strong>Paciente:</strong> ${escape(patient.nome || 'Não informado')}</div><div><strong>CPF:</strong> ${escape(patient.cpf || 'Não informado')}</div><div><strong>Data:</strong> ${escape(footer || '')}</div></div>
<main>${sectionsHtml}${imageHtml ? `<section class="document-section"><h2>Imagens clínicas</h2><div class="image-grid">${imageHtml}</div></section>` : ''}</main>
<div class="signature-area"><div class="signature-line"></div><div class="doctor-name">Dr(a). ${escape(professional.nome || 'Profissional')}</div><div class="doctor-crm">${escape([professional.crm, professional.especialidade].filter(Boolean).join(' • '))}</div></div>
<footer class="footer-legal"><span>Documento emitido eletronicamente por Plennus Clinic</span><span>${escape(footer)}</span></footer>
</body></html>`;
  }

  return { escape, section, pageBreak, renderDocument };
});
