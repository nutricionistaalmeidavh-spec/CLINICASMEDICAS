(function (root) {
  function legacyBodyToSections(corpoHtml) {
    return [root.PlennusDocumentRenderer.section('', String(corpoHtml || ''), { keepTogether: false })];
  }

  function gerarHtmlDocumentoTimbrado({ titulo, paciente, profissional, corpoHtml }) {
    const clinica = typeof root.obterDadosClinica === 'function' ? root.obterDadosClinica() : {};
    return root.PlennusDocumentRenderer.renderDocument({
      title: titulo,
      clinic: clinica,
      patient: paciente || {},
      professional: profissional || {},
      sections: legacyBodyToSections(corpoHtml),
      footer: typeof root.hoje === 'function' ? root.hoje() : ''
    });
  }

  async function carregarImagensClinicasParaDocumento(fileRows, maxImages = 6) {
    const api = root.electronAPI?.dataIsolation;
    const token = root.DB?.session?.()?.token || null;
    if (!token || !api?.readClinicalImage) return [];
    const rows = (fileRows || []).filter(row => row?.caminho_arquivo).slice(0, Math.max(0, Math.min(maxImages, 12)));
    const images = [];
    for (const row of rows) {
      let filePath = row.caminho_arquivo;
      let result = await api.readClinicalImage(token, filePath);
      if (!result?.ok && api.adoptLegacyClinicalFile) {
        const adopted = await api.adoptLegacyClinicalFile(token, filePath);
        if (adopted?.ok && adopted.path) {
          filePath = adopted.path;
          if (row.id && root.DB?.run) root.DB.run('UPDATE arquivos_clinicos SET caminho_arquivo=?, mime_type=COALESCE(?,mime_type) WHERE id=?', [filePath, adopted.mimeType || null, row.id]);
          result = await api.readClinicalImage(token, filePath);
        }
      }
      if (result?.ok && result.dataUrl) images.push({ name: row.nome_arquivo || result.name, dataUrl: result.dataUrl });
    }
    return images;
  }

  root.gerarHtmlDocumentoTimbrado = gerarHtmlDocumentoTimbrado;
  root.PlennusPlatformDocuments = { gerarHtmlDocumentoTimbrado, carregarImagensClinicasParaDocumento };
})(typeof window !== 'undefined' ? window : globalThis);
