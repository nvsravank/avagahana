// diagram.js — what a mind map tells the viewer about itself (see diagrams/index.js).
// colourBy: the meanings colour can carry in this diagram type, first = default.
// Each names a theme palette: 'category' (told apart) or 'level' (a ramp by depth).
// Other diagram types declare their own; themes never change for them.
import { parseMindmap } from './parse.js';
import { layoutMindmap, layoutOrg, clockwise, defaultCollapsed as collapsed } from './layout.js';
import { buildScene, relationShapes } from './scene.js';

export const type = 'mindmap';
export const label = 'Mindmap';
export const matches = (header) => header === 'mindmap';
export const parseBody = parseMindmap;

// the ways to show it; `icon` names an interface icon (chrome.js)
export const modes = [
  { id: 'mindmap', label: 'Mind map', icon: 'mindmap' },
  { id: 'org', label: 'Org chart', icon: 'org' },
  { id: 'list', label: 'List', icon: 'list' },
];

export const colourBy = [
  { id: 'category', label: 'Branch' },
  { id: 'level', label: 'Level' },
];

// main branches clockwise round the centre, so neighbours get contrasting colours
export const branchOrder = clockwise;
export const defaultCollapsed = collapsed;

// positions for a drawn mode: Map(node -> {x, y, w, h, ...}) and the tree's edges
export function layout(mode, root, kids, size) {
  return mode === 'org' ? layoutOrg(root, kids, size) : layoutMindmap(root, kids, size);
}
export { buildScene, relationShapes };
