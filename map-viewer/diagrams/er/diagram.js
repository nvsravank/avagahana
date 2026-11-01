// diagram.js — what an ER diagram tells the viewer about itself (see
// diagrams/index.js). The entities are tables (their own size, diagrams/er/table.js,
// and drawing, paint.js), laid out hub and spoke (layout.js) with column connections behind
// them. A table opens and closes like a box (the viewer's collapsed set): closed, it
// shows its key columns. Coloured by class, as a box diagram is: the table classes
// (fact, dimension, ...: words.js) are built in; a table with none takes one plain colour.
import { parseEr } from './parse.js';
import { layoutTables } from './layout.js';
import { buildScene, relationShapes } from './scene.js';
import { tableGeometry, tablesIn } from './table.js';
import { paintTable } from './paint.js';
import { tablePage } from './page.js';
import { TABLE_CLASSES, fansOut } from './words.js';

export const type = 'er';
export const label = 'ER diagram';
export const matches = (header) => /^erDiagram\b/.test(header);
export const parseBody = parseEr;
export const boxes = true;
// the icons its tables draw (loaded before the first draw)
export const icons = ['ph key'];

export const modes = [
  { id: 'tables', label: 'Tables', icon: 'tables' },
  { id: 'list', label: 'List', icon: 'list' },
];
export const colourBy = [{ id: 'class', label: 'Class' }];
// the map decides (WO-44): always by class; the reader's only other choice is Changes
export const autoColourBy = () => 'class';
export const builtInClasses = TABLE_CLASSES;
export const stableColours = true;
export const branchOrder = (kids) => kids;
// Only wide tables with optional columns start collapsed.
// (groups start open)
export const defaultCollapsed = (root) => new Set(tablesIn(root).filter((n) => n.attrs?.length > 15 && n.attrs.some((a) => !a.keys.has('PK') && !a.grain && !a.keys.has('FK') && !a.connected)).map((n) => n.id));
export const layoutByView = true;
// a selected table says what one row is and lights its lines: selecting draws again
export const drawsSelection = true;

// a scenario's step along r from `from` reaches its many side (model/scenarios.js)
export { fansOut };
export const nodeGeometry = tableGeometry;
export const paintNode = paintTable;
export const pageSections = tablePage;
export const layout = (mode, root, kids, size, input) => layoutTables(root, size, input);
export { buildScene, relationShapes };

export { parseErViews as parseViews, parseRenames } from './connections.js';

// The stage must redraw when the smaller column text crosses its bar threshold.
export const detailSizes = [16, 14, 12];

// Reader-facing look names for tables; keep the shared preference values.
export const looks = [['outline', 'Flat'], ['fade', 'Zebra']];
export const defaultLook = 'fade';
