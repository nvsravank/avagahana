// diagram.js — what a lane diagram (WO-62: swim lanes) tells the viewer about itself (see
// diagrams/index.js). Its block is a Mermaid flowchart (read by the flowchart's parser);
// a `## Lanes` section after it (model/lanes.js) makes it this type: steps in rows
// (horizontal swimlanes), columns (vertical swimlanes) or a grid, always drawn as lanes
// (layout.js, scene.js). No boxes: a subgraph's steps are drawn flat. Colours, classes,
// shapes, arrows, notes, views and List are the flowchart's.
import { parseFlowchart } from '../flowchart/parse.js';
import { layoutLanes } from './layout.js';
import { buildScene, relationShapes, paintLane, LANE_ID } from './scene.js';
import { paintLanePins } from './pins.js';

export const type = 'lanes';
export const label = 'Lane diagram';
export const matches = () => false;
export const parseBody = parseFlowchart;
export const boxes = true;

export const modes = [
  { id: 'lanes', label: 'Lanes', icon: 'lanes' },
  { id: 'list', label: 'List', icon: 'list' },
];
export const colourBy = [
  { id: 'class', label: 'Class' },
  { id: 'category', label: 'Group' },
];
export const autoColourBy = (map) => (Object.values(map.byId).some((n) => n.kind) ? 'class' : 'category');
export const stableColours = true;
// Looks as in ER diagrams (WO-62): the shared outline / poster preference, named Flat and
// Zebra; both draw steps as the flowchart's Outline does (data-look fade); the lanes read
// data-lane-look (base.css)
export const looks = [['outline', 'Flat', 'fade'], ['poster', 'Zebra', 'fade']];
export const defaultLook = 'outline';

export const branchOrder = (kids) => kids;
export const defaultCollapsed = () => new Set();
export const layoutByView = true;
// a lane selected by its name lights its steps: selecting draws again
export const drawsSelection = true;
// a lane's name in the drawing (a click selects the lane, not a node)
export const isLane = (id) => LANE_ID.test(id || '');
// lane names pinned at the edges once their headers scroll away
export const paintPins = paintLanePins;
export const layout = (mode, root, kids, size, input) => layoutLanes(root, size, input);
// a lane band is a custom frame (paint.js): its fill and name
export const paintNode = paintLane;
export { buildScene, relationShapes };
