// main-icon.js — a node's main icon (WO-38): the one picture that stands for the node,
// drawn as the node in the Poster look and above its name in Outline. Pure: no DOM.
//
// - The first cloud icon (aws, azure, gcp) is main: the node's own before its class's.
//   Further cloud icons are tags, like Phosphor icons.
// - With no cloud icon, a map may mark one other icon main with the reserved word
//   `main` before it, in ## Node icons or ## Classes (`- sched : main ph clock`). It is
//   never required. Mermaid never reads those sections, so the word is safe there.
// - Anything else is a problem: main before a cloud icon, or before a mark (a trust mark
//   or a status code); two marked; main with no icon after it; a marked icon on a node
//   with a cloud icon; main on an arrow; main in a mind map's ::icon.
import { problem } from './problem.js';

export const MAIN = 'main';
export const isCloudCode = (code) => /^(aws|azure|gcp) [a-z0-9-]+$/.test(code);
// marks say how sure, or how things stand: never what a node is
const TRUST = new Set(['verified', 'inferred', 'hypothesis', 'unsourced']);
const isMark = (code) => TRUST.has(code) || /^status-/.test(code);

// The word main taken out of an icon list. where: who the list belongs to, for messages.
// -> {codes (without main), marked (the code after main, or null), problems}
export function takeMain(codes, where) {
  const out = [];
  const problems = [];
  let marked = null;
  for (let i = 0; i < codes.length; i++) {
    if (codes[i] !== MAIN) { out.push(codes[i]); continue; }
    const next = codes[i + 1];
    if (!next || next === MAIN) problems.push(problem('main-icon-alone', `${where}: "main" with no icon after it.`));
    else if (isCloudCode(next)) problems.push(problem('main-icon-cloud', `${where}: "main" before ${next}. A cloud icon is main by its place (the first one), never marked.`));
    else if (isMark(next)) problems.push(problem('main-icon-mark', `${where}: "main" before ${next}, a mark: a main icon shows what the node is.`));
    else if (marked) problems.push(problem('main-icon-twice', `${where}: two icons marked main (${marked}, ${next}); a node has one.`));
    else marked = next;
  }
  return { codes: out, marked, problems };
}

// A node's main icon once its icons and class are known. n.icons: its own icons (with
// its class's, as model/map.js gave them); n.mainMark: the icon its ## Node icons line
// marked; cls: the class the node names itself, {icons, main} or null. Sets n.main
// (a code in n.icons, or null) and adds the class's cloud icon to n.icons when it is main.
// -> problems
export function resolveMain(n, cls) {
  const problems = [];
  const own = n.icons.find(isCloudCode);
  const fromClass = !own && cls?.icons?.find(isCloudCode);
  if (fromClass && !n.icons.includes(fromClass)) n.icons = [fromClass, ...n.icons];
  const cloud = own || fromClass || null;
  n.main = cloud;
  if (n.mainMark) {
    if (cloud) problems.push(problem('main-icon-with-cloud', `Node ${n.id}: ${n.mainMark} is marked main, but ${own ? `the node has a cloud icon (${own})` : `its class brings a cloud icon (${fromClass})`}, which is main.`));
    else n.main = n.mainMark;
  } else if (!cloud && cls?.main && n.icons.includes(cls.main)) n.main = cls.main;
  delete n.mainMark;
  return problems;
}
