// diagram.js — what a state diagram tells the viewer about itself (see
// diagrams/index.js). A box diagram: states are boxes, composite states boxes holding
// boxes, transitions the arrows; laid out and drawn as a flowchart is, with the state
// marks (start and end dots, choice, fork / join bar) as small shapes, regions as dashed
// parts of their composite, and a transition to itself as a loop round a top corner.
import { parseState } from './parse.js';
import { layoutBoxes } from '../flowchart/layout.js';
import { buildScene, relationShapes } from './scene.js';

export const type = 'state';
export const label = 'State diagram';
export const matches = (header) => /^stateDiagram(-v2)?\b/.test(header);
export const parseBody = parseState;
export const boxes = true;
// a state links to another diagram (a sub-machine) through a link in its note: Mermaid's
// state diagrams have no click
export const noteLinks = true;

export const modes = [
  { id: 'boxes', label: 'Boxes', icon: 'state' },
  { id: 'list', label: 'List', icon: 'list' },
];
export const colourBy = [
  { id: 'class', label: 'Class' },
  { id: 'category', label: 'Group' },
];
export const autoColourBy = (map) => (Object.values(map.byId).some((n) => n.kind) ? 'class' : 'category');
export const stableColours = true;
// one look: no Look row (WO-38)
export const looks = [];
export const branchOrder = (kids) => kids;
export const defaultCollapsed = () => new Set();
export const layoutByView = true;

export const layout = (mode, root, kids, size, input) => layoutBoxes(root, kids, size, input);
export { buildScene, relationShapes };
