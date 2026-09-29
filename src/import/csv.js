// CSV reader (RFC 4180). Pure. Handles a BOM, CRLF or LF or CR line ends, quoted fields with
// delimiters, doubled quotes and line breaks inside quotes, `,` or `;` as the delimiter.

const CANDIDATES = [',', ';'];

// Split into raw physical lines outside quotes, for delimiter counting only.
function sampleLines(text, max) {
  const lines = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length && lines.length < max; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (cur.trim() !== '') lines.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '' && lines.length < max) lines.push(cur);
  return lines;
}

function countOutsideQuotes(line, delimiter) {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) n++;
  }
  return n;
}

// The delimiter whose per-line count is the same on most of the first lines; ties go to the
// larger total, then to the comma.
export function detectDelimiter(text) {
  const lines = sampleLines(text, 20);
  let best = ',';
  let bestScore = [-1, -1];
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const freq = new Map();
    for (const n of counts) if (n > 0) freq.set(n, (freq.get(n) || 0) + 1);
    const consistent = freq.size ? Math.max(...freq.values()) : 0;
    const total = counts.reduce((s, n) => s + n, 0);
    if (consistent > bestScore[0] || (consistent === bestScore[0] && total > bestScore[1])) {
      best = d;
      bestScore = [consistent, total];
    }
  }
  return best;
}

// parseCsv(text, { delimiter }) -> { rows: string[][], delimiter, lines: number[] }
// Rows that are entirely blank are dropped; lines[i] is the 1-based source line on which rows[i]
// starts, for messages that name a row. Whitespace outside quotes is kept (callers trim).
export function parseCsv(text, { delimiter } = {}) {
  let src = String(text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const delim = delimiter || detectDelimiter(src);
  const rows = [];
  const lines = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  let wasQuotedRow = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => { row.push(field); field = ''; wasQuoted = false; };
  const endRow = () => {
    endField();
    const blank = row.length === 1 && row[0].trim() === '' && !wasQuotedRow;
    if (!blank) { rows.push(row); lines.push(rowLine); }
    row = [];
    wasQuotedRow = false;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field.trim() === '') { quoted = true; wasQuoted = true; wasQuotedRow = true; field = ''; continue; }
    if (c === delim) { endField(); continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0 || wasQuoted) endRow();
  return { rows, delimiter: delim, lines };
}
