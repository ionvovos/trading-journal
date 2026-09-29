// Format registry. One id per named format (architecture section 2.1); adding a format is one
// module in src/import/formats/, one id here, one fixture pair, one test file (section 2.4).
//
// The modules load through dynamic import so the registry works while a format module is not on
// disk yet (cloud sessions C1-C4 deliver them one by one). Once all four are merged the ids become
// static imports (L3 S2 step 4) and `loadFormats` resolves at once.

export const FORMAT_IDS = ['ibkr-activity', 'kraken-trades', 'mt4-statement', 'generic-csv'];
export const MIN_CONFIDENCE = 0.6;

// Live list of loaded format objects in FORMAT_IDS order. Filled by loadFormats().
export const formats = [];

let loading = null;

export function loadFormats() {
  if (!loading) {
    loading = (async () => {
      const found = [];
      for (const id of FORMAT_IDS) {
        try {
          const mod = await import(`./formats/${id}.js`);
          if (mod.format && mod.format.id === id) found.push(mod.format);
        } catch (err) {
          const missing = err && (err.code === 'ERR_MODULE_NOT_FOUND' || /Failed to fetch|Cannot find module|Failed to load/.test(String(err.message)));
          if (!missing) throw err;
        }
      }
      formats.length = 0;
      formats.push(...found);
      return formats;
    })();
  }
  return loading;
}

export function getFormat(id) {
  return formats.find((f) => f.id === id) || null;
}

// { format, score, scores } where format is the highest scorer at or above MIN_CONFIDENCE (first
// registered wins a tie), else null so the caller asks the user which format the file is.
export function detectFormat(text) {
  const scores = formats.map((f) => ({ id: f.id, score: Number(f.detect(text)) || 0 }));
  let best = null;
  for (const s of scores) if (s.score >= MIN_CONFIDENCE && (!best || s.score > best.score)) best = s;
  return { format: best ? getFormat(best.id) : null, score: best ? best.score : 0, scores };
}
