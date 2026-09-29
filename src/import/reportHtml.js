// The import report as a file to keep with the broker file (AC-A4.1): JSON, and a self-contained printable HTML page.
// Pure. Every value is escaped; the HTML carries its own small stylesheet (it opens from a file, outside the app's CSP).

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// reportJson(record, reconciliation?) -> plain object; what the person saved is the stored report plus the answers.
export function reportJson(record, reconciliation = null) {
  return {
    format: 'trading-journal-import-report', version: 1, importId: record.id, fileName: record.fileName, formatId: record.formatId, createdAt: record.createdAt,
    fileZone: record.fileZone, report: record.report,
    anomalies: record.anomalies.map((a) => ({ id: a.id, kind: a.kind, trades: a.tradeIds.length, answer: a.answer ? { optionId: a.answer.optionId, at: a.answer.at ?? null } : null, overrides: Object.keys(a.overrides || {}).length })),
    reconciliation: reconciliation ? { from: reconciliation.from, to: reconciliation.to, zone: reconciliation.zone, state: reconciliation.state, brokerMinor: reconciliation.broker?.valueMinor ?? null, oursMinor: reconciliation.oursMinor, differenceMinor: reconciliation.differenceMinor, explanations: reconciliation.explanations } : null,
  };
}

// reportHtml(record, { t, fmt, reconciliation, accountName, currency }) -> string
// `t` is the catalogue lookup so the page follows the app language.
export function reportHtml(record, { t, fmt, reconciliation = null, accountName = '', currency = 'USD' }) {
  const rep = record.report;
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const money = (m) => (m === null || m === undefined ? '–' : fmt.money(m, currency));
  const skipped = (rep.skipped || []).map((s) => `<li>${esc(t('import.report.row', { n: s.row }))}: ${esc(t(s.reasonKey))}</li>`).join('');
  const anomalies = record.anomalies.map((a) => `<li>${esc(t(`import.kind.${a.kind}`))}: ${esc(a.answer ? t(`import.opt.${a.kind}.${a.answer.optionId}`) : t('import.report.unanswered'))}</li>`).join('');
  const rc = reconciliation
    ? `<h2>${esc(t('import.report.check'))}</h2><table>${[
      row(t('import.report.period'), `${reconciliation.from} – ${reconciliation.to} (${reconciliation.zone})`),
      row(t('import.report.broker'), money(reconciliation.broker?.valueMinor ?? null)), row(t('import.report.ours'), money(reconciliation.oursMinor)),
      row(t('import.report.difference'), money(reconciliation.differenceMinor)), row(t('import.report.state'), t(`status.${reconciliation.state === 'difference' ? 'difference' : reconciliation.state === 'reconciled' ? 'reconciled' : reconciliation.state === 'skipped' ? 'skipped' : 'notAsked'}`))].join('')}</table>`
    : '';
  return `<!doctype html><html lang="${esc(fmt.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t('import.report.title'))}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px auto;max-width:720px;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:17px;margin-top:24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}th{width:45%;font-weight:600}@media print{body{margin:0}}</style></head><body>
<h1>${esc(t('import.report.title'))}</h1><table>${[
    row(t('import.report.file'), record.fileName || '–'), row(t('import.report.account'), accountName), row(t('import.report.format'), record.formatId), row(t('import.report.date'), record.createdAt),
    row(t('import.report.rowsInFile'), rep.rowsInFile), row(t('import.report.rowsRead'), rep.rowsRead), row(t('import.report.trades'), rep.tradesBuilt), row(t('import.report.matched'), rep.matched),
    row(t('import.report.rKnown'), `${rep.rKnownShare.known} / ${rep.rKnownShare.of}`), row(t('import.report.period'), rep.period ? `${rep.period.from} – ${rep.period.to} (${rep.period.zone})` : '–')].join('')}</table>
<h2>${esc(t('import.report.skipped'))}</h2>${skipped ? `<ul>${skipped}</ul>` : `<p>${esc(t('import.report.none'))}</p>`}
<h2>${esc(t('import.report.questions'))}</h2>${anomalies ? `<ul>${anomalies}</ul>` : `<p>${esc(t('import.report.none'))}</p>`}${rc}</body></html>`;
}
