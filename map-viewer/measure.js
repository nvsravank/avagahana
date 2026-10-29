// measure.js — text measurement and wrapping, shared by every viewer.
// One canvas for the document; widths cached per (font, size, weight, style,
// text). The cache is dropped when a web font finishes loading, since widths
// measured with the fallback font are then wrong.

const ctx = document.createElement('canvas').getContext('2d');
const cache = new Map();
let lastFont = '';   // setting ctx.font is costly: only when it changes
const MAX_ENTRIES = 50000;

export function measure(text, size, weight, italic, font) {
  const key = `${font}|${size}|${weight}|${italic ? 1 : 0}|${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    const f = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
    if (f !== lastFont) { ctx.font = f; lastFont = f; }
    w = ctx.measureText(text).width;
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, w);
  }
  return w;
}

export function clearMeasureCache() { cache.clear(); lastFont = ''; }

// Wrap label runs into lines no wider than maxLine.
// runsLines: [[{text, bold, italic}], ...] one array per hard line.
// measureFn has measure()'s signature; tests pass a fixed one so results are the
// same on every machine.
export function wrapRuns(runsLines, type, font, maxLine, measureFn = measure) {
  const out = [];
  for (const runs of runsLines) {
    // most labels fit on one line: one measurement per run, no word splitting
    let whole = 0;
    for (const r of runs) whole += measureFn(r.text, type.size, r.bold ? 700 : type.weight, r.italic, font);
    if (whole <= maxLine) {
      const line = [];
      for (const r of runs) {
        const text = line.length ? r.text : r.text.replace(/^\s+/, '');
        if (!text) continue;
        line.push({ text, bold: r.bold, italic: r.italic, weight: r.bold ? 700 : type.weight });
      }
      out.push({ runs: line, w: whole });
      continue;
    }
    let line = [];
    let w = 0;
    for (const r of runs) {
      const weight = r.bold ? 700 : type.weight;
      for (const word of r.text.split(/(\s+)/)) {
        if (!word) continue;
        const ww = measureFn(word, type.size, weight, r.italic, font);
        if (w + ww > maxLine && w > 0 && word.trim()) {
          out.push({ runs: line, w });
          line = [];
          w = 0;
        }
        if (!line.length && !word.trim()) continue;
        const prev = line[line.length - 1];
        if (prev && prev.bold === r.bold && prev.italic === r.italic) prev.text += word;
        else line.push({ text: word, bold: r.bold, italic: r.italic, weight });
        w += ww;
      }
    }
    out.push({ runs: line, w });
  }
  return out;
}
