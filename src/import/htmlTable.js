// HTML table reader for saved broker reports (MetaTrader statements). No DOM, no dependency.
// htmlRows(html) -> [{ cells: [{ text, title, colspan }] }], every <tr> in document order.
// Cells are <td> and <th>. `text` has tags removed, entities decoded, whitespace collapsed and
// trimmed; `title` is the cell's title attribute ('' when absent); `colspan` defaults to 1.
// Nested tables are not supported (MetaTrader reports do not nest). Missing </td> and </tr>
// tags are tolerated, as saved statements often omit them.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', minus: '−', euro: '€', pound: '£', yen: '¥' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return all;
      return String.fromCodePoint(code);
    }
    const v = NAMED[body.toLowerCase()];
    return v === undefined ? all : v;
  });
}

const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function attributes(text) {
  const out = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(text))) {
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    out[m[1].toLowerCase()] = value;
  }
  return out;
}

const TAG_BODY = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*';

function cellText(inner) {
  return decodeEntities(inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/[\s ]+/g, ' ')
    .trim();
}

export function htmlRows(html) {
  const clean = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  const rows = [];
  const trRe = new RegExp(`<tr\\b(${TAG_BODY})>`, 'gi');
  const starts = [];
  let m;
  while ((m = trRe.exec(clean))) starts.push({ index: m.index, end: m.index + m[0].length });
  for (let i = 0; i < starts.length; i++) {
    let chunk = clean.slice(starts[i].end, i + 1 < starts.length ? starts[i + 1].index : clean.length);
    const close = chunk.search(/<\/tr\s*>|<\/table\s*>/i);
    if (close !== -1) chunk = chunk.slice(0, close);
    const cells = [];
    const tdRe = new RegExp(`<t([dh])\\b(${TAG_BODY})>`, 'gi');
    const tds = [];
    let c;
    while ((c = tdRe.exec(chunk))) tds.push({ index: c.index, end: c.index + c[0].length, attrs: c[2] });
    for (let j = 0; j < tds.length; j++) {
      let inner = chunk.slice(tds[j].end, j + 1 < tds.length ? tds[j + 1].index : chunk.length);
      const endTag = inner.search(/<\/t[dh]\s*>/i);
      if (endTag !== -1) inner = inner.slice(0, endTag);
      const a = attributes(tds[j].attrs);
      const span = parseInt(a.colspan, 10);
      cells.push({
        text: cellText(inner),
        title: a.title === undefined ? '' : decodeEntities(a.title).trim(),
        colspan: Number.isFinite(span) && span > 0 ? span : 1,
      });
    }
    rows.push({ cells });
  }
  return rows;
}
