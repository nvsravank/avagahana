// walkthroughs.js — a walkthrough: a story over the map's own items, in the order written.
// Each stop is a ### heading (its kind and the name of the item it shows) with its note
// as Markdown underneath. Items are named as their headings name them.
//
//   ## Walkthrough: Security
//
//   ### Diagram: Shop platform
//
//   The shop at its top. Watch where card data enters.
//
//   ### Perspective: Data flow
//
//   Only the arrows that carry card data.
//
// A stop is found by its kind and name (the viewer's walkthroughs(), the checker's
// check_walkthroughs). The file's walkthroughs are read from every diagram's sections.
import { problem } from './problem.js';
import { headings, optionsSection } from './options.js';

// a stop's kind -> the contents entry kind it opens (viewer.js contents())
export const STOP_KINDS = { diagram: 'diagram', perspective: 'view', join: 'join', deployment: 'deployment', scenario: 'scenario', sequence: 'sequence' };

// -> [{kind, name, text, known}] in the order written
export function readStops(text, warnings = []) {
  const stops = [];
  const hs = headings(text).filter((h) => h.level === 3);
  for (const [i, h] of hs.entries()) {
    const head = h.title;
    const body = text.slice(h.end, hs[i + 1]?.start ?? text.length).trim();
    const parsed = optionsSection(body, 'Stop options', ['title', 'label', 'notes', 'diagram'], 'walkthrough-options', warnings);
    const m = head.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    const kind = m ? m[1].toLowerCase() : null;
    stops.push({ kind, name: m ? m[2].trim() : head, text: parsed.text, options: parsed.options, invalidReference: !!parsed.invalid, known: !!(kind && STOP_KINDS[kind]) });
  }
  return stops;
}

// -> [{name, stops}] for the file; a walkthrough named twice is read once (first wins)
export function readWalkthroughs(sections, warnings) {
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) { warnings.push(problem('walkthrough-twice', `Two walkthroughs are named "${s.name}": only the first is used.`)); continue; }
    seen.add(key);
    const stops = readStops(s.text, warnings);
    if (!stops.length) warnings.push(problem('walkthrough-empty', `Walkthrough "${s.name}" has no stops.`));
    for (const st of stops) if (!st.known) warnings.push(problem('walkthrough-stop-kind', `Walkthrough "${s.name}": stop "${st.name}" must start with Diagram, Perspective, Deployment, Scenario, Join or Sequence.`));
    const first = headings(s.text).find((h) => h.level === 3);
    out.push({ name: s.name, intro: s.text.slice(0, first?.start ?? s.text.length).trim(), stops });
  }
  return out;
}
