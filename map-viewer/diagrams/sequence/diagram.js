// diagram.js — what a sequence diagram tells the viewer about itself (see
// diagrams/index.js). The participants are the nodes; the messages are not relations
// but steps (parse.js), drawn as lifelines and walked through by the player. A sequence
// linked to a box diagram's view (`## Plays over`) also plays over that view.
import { parseSequence } from './parse.js';
import { layoutLifelines } from './layout.js';
import { buildScene, relationShapes } from './scene.js';
import { renderSequenceList } from './list.js';

export const type = 'sequence';
export const label = 'Sequence';
export const matches = (header) => /^sequenceDiagram\b/.test(header);
export const parseBody = parseSequence;

export const modes = [
  { id: 'lifelines', label: 'Lifelines', icon: 'lifelines' },
  { id: 'list', label: 'List', icon: 'list' },
];

// each participant its own colour (a box's together)
export const colourBy = [{ id: 'category', label: 'Participant' }];
export const stableColours = true;
// one look: no Look row (WO-38)
export const looks = [];
export const branchOrder = (kids) => kids;
export const defaultCollapsed = () => new Set();
// no related links: the messages are the sequence's own (no related-links button)
export const noRelations = true;

export const layout = (mode, root, kids, size, input) => layoutLifelines(root, size, input.sequence);
export { buildScene, relationShapes };
// List mode: the numbered steps, not the participants' outline
export const renderList = renderSequenceList;
