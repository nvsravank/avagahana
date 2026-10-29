// diagram.js — what a flowchart (a box diagram) tells the viewer about itself (see
// diagrams/index.js). Boxes hold boxes; the relations of the current view are its
// arrows, and the view decides the layout: only the boxes the view uses are drawn,
// laid out by its arrows.
import { parseFlowchart } from './parse.js';
import { layoutBoxes } from './layout.js';
import { buildScene, relationShapes } from './scene.js';

export const type = 'flowchart';
export const label = 'Flowchart';
export const matches = (header) => /^(flowchart|graph)\b/.test(header);
export const parseBody = parseFlowchart;
export const boxes = true;

export const modes = [
  { id: 'boxes', label: 'Boxes', icon: 'flowchart' },
  // the top level as stacked rows of bands, every row as wide as the widest, each band running left to right
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'list', label: 'List', icon: 'list' },
];

// No "colour by" choice: the map decides. A map with classes colours by class (a kind
// of thing, model/classes.js); one without, by its top-level boxes (group), counted
// from the map's top (stableColours), so drilling in never recolours.
export const colourBy = [
  { id: 'class', label: 'Class' },
  { id: 'category', label: 'Group' },
];
export const autoColourBy = (map) => (Object.values(map.byId).some((n) => n.kind) ? 'class' : 'category');
export const stableColours = true;

export const branchOrder = (kids) => kids;
export const defaultCollapsed = () => new Set();
// switching view lays the diagram out again (the view's arrows place the boxes)
export const layoutByView = true;

export const layout = (mode, root, kids, size, input) => layoutBoxes(root, kids, size, { ...input, layers: mode === 'layers' });
export { buildScene, relationShapes };
