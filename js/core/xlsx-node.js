'use strict';

const zlib = require('zlib');

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function unzipEntries(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo XLSX/ZIP inválido');
  const entriesCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = centralOffset;
  for (let i = 0; i < entriesCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Diretório ZIP inválido');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Entrada ZIP inválida');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`Compressão ZIP não suportada: ${method}`);
    entries.set(name, data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const values = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const parts = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let text;
    while ((text = tRegex.exec(match[1]))) parts.push(decodeXml(text[1]));
    values.push(parts.join(''));
  }
  return values;
}

function columnIndex(reference) {
  const letters = String(reference || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function parseWorksheet(xml, sharedStrings = []) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml || ''))) {
    const cells = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] || `A${rows.length + 1}`;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || '';
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<is\b[^>]*>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
      let value = inline != null ? decodeXml(inline) : decodeXml(raw || '');
      if (type === 's') value = sharedStrings[Number(raw)] ?? '';
      cells[columnIndex(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(value => String(value || '').trim());
  return rows.slice(1).filter(row => row.some(value => String(value || '').trim())).map(row => {
    const result = {};
    headers.forEach((header, index) => { if (header) result[header] = row[index] ?? ''; });
    return result;
  });
}

function parseXlsx(buffer, maxRows = 5000) {
  const entries = unzipEntries(buffer);
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'));
  let sheetName = 'xl/worksheets/sheet1.xml';
  if (!entries.has(sheetName)) {
    sheetName = [...entries.keys()].find(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  }
  if (!sheetName) throw new Error('Planilha XLSX sem worksheet');
  const rows = parseWorksheet(entries.get(sheetName).toString('utf8'), shared);
  if (rows.length - 1 > maxRows) throw new Error(`Planilha excede o limite de ${maxRows} linhas`);
  return rowsToObjects(rows);
}

module.exports = { decodeXml, unzipEntries, parseSharedStrings, columnIndex, parseWorksheet, rowsToObjects, parseXlsx };
