// parse.js — a Mermaid mindmap block into the shared tree (model/tree.js). Indentation
// sets the tree; `::icon(...)` and `:::class` lines apply to the node above. The
// sections after the block are read by model/map.js.
import { parseIconCodes } from '../../model/icon-codes.js';
import { parseNodeSpec } from '../../model/shapes.js';
import { shortenLabel, labelToRuns } from '../../model/labels.js';
import { problem } from '../../model/problem.js';

// lines: the block's lines; start: the index of its `mindmap` line
export function parseMindmap(lines, start, title, warnings) {
  const byId = {};
  const stack = []; // [{indent, node}]
  let root = null;
  let last = null;
  let auto = 0;
  const shortened = [];

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    const indent = raw.length - raw.trimStart().length;

    const iconM = trimmed.match(/^::icon\((.*)\)\s*$/);
    if (iconM) {
      if (last) addIconCodes(last, iconM[1], warnings);
      continue;
    }
    const clsM = trimmed.match(/^:::\s*(.+)$/);
    if (clsM) {
      if (last) last.cls = clsM[1].trim();
      continue;
    }

    const node = parseNodeSpec(trimmed, () => `_a${++auto}`);
    const label = shortenLabel(node.label);
    if (label !== node.label) { node.label = label; shortened.push(node.id); }
    labelToRuns(node, warnings);

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (!stack.length) {
      if (root) {
        warnings.push(problem('mindmap-second-root', `Second root "${node.label}" ignored (line ${i + 1}).`));
        continue;
      }
      root = node;
      node.parent = null;
    } else {
      const parent = stack[stack.length - 1].node;
      node.parent = parent;
      parent.children.push(node);
    }
    if (byId[node.id]) {
      node.id = `${node.id}_${++auto}`;
    }
    byId[node.id] = node;
    stack.push({ indent, node });
    last = node;
  }
  return { root, byId, shortened };
}

// a mind map has no main icon (WO-38): the word main is reported and left out
function addIconCodes(node, spec, warnings) {
  const codes = parseIconCodes(spec);
  if (codes.includes('main')) warnings.push(problem('main-icon-mind-map', `Node ${node.id}: "main" in ::icon(${spec.trim()}); a mind map has no main icon.`));
  for (const code of codes.filter((c) => c !== 'main')) {
    if (!node.icons.includes(code)) node.icons.push(code);
  }
}
