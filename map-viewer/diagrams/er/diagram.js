// diagram.js — what an ER diagram tells the viewer about itself (see
// diagrams/index.js). The entities are tables (their own size, diagrams/er/table.js,
// and drawing, paint.js), laid out hub and spoke (layout.js) with column connections behind
// them. A table opens and closes like a box (the viewer's collapsed set): closed, it
// shows its key columns. Colour by Role (fact, dimension, bridge: roles.js) or by Class.
import { parseEr } from './parse.js';
import { layoutTables } from './layout.js';
import { buildScene, relationShapes } from './scene.js';
import { tableGeometry } from './table.js';
import { paintTable } from './paint.js';
import { tablePage } from './page.js';
import { ROLE_ORDER, ROLE_LABELS, fansOut } from './roles.js';

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
export const colourBy = [
  { id: 'category', label: 'Role' },
  { id: 'class', label: 'Class' },
];
export const stableColours = true;
export const branchOrder = (kids) => kids;
// Only wide tables with optional columns start collapsed.
export const defaultCollapsed = (root) => new Set(root.children.filter((n) => n.attrs?.length > 15 && n.attrs.some((a) => !a.keys.has('PK') && !a.grain && !a.keys.has('FK') && !a.connected)).map((n) => n.id));
export const layoutByView = true;
// a selected table says what one row is and lights its lines: selecting draws again
export const drawsSelection = true;

// the Role colouring: a colour per role, in ROLE_ORDER (the key lists them)
export const categoryOf = (n) => (n.role ? ROLE_ORDER.indexOf(n.role) + 1 : 0);
export const categoryKey = (map) => ROLE_ORDER.filter((r) => map.root.children.some((n) => n.role === r)).map((r) => ({ k: ROLE_ORDER.indexOf(r) + 1, label: ROLE_LABELS[r] }));

// a walk's step along r from `from` reaches its many side (model/walks.js)
export { fansOut };
export const nodeGeometry = tableGeometry;
export const paintNode = paintTable;
export const pageSections = tablePage;
export const layout = (mode, root, kids, size, input) => layoutTables(root, size, input);
export { buildScene, relationShapes };

export { parseErViews as parseViews } from './connections.js';

// The stage must redraw when the smaller column text crosses its bar threshold.
export const detailSizes = [16, 14, 12];

// Reader-facing look names for tables; keep the shared preference values.
export const looks = [['outline', 'Flat'], ['fade', 'Zebra']];
export const defaultLook = 'fade';
