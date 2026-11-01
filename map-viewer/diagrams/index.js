// index.js — the diagram types the viewer knows. The Mermaid block's first line picks
// one (mindmap, flowchart, sequenceDiagram, stateDiagram, erDiagram). Each type (diagrams/<type>/diagram.js) exports:
//   type, label, matches(headerLine), parseBody(lines, start, title, warnings),
//   modes [{id, label, icon}] (list mode is shared), colourBy [{id, label}],
//   branchOrder(children), defaultCollapsed(top), layout(mode, root, kids, size, input),
//   buildScene(input), and optionally renderList(v, on) (a list mode of its own) and
//   boxes: true (a box diagram: boxes holding boxes, arrows, sequences and walks play over it),
//   and hooks for a type that draws its nodes its own way: nodeGeometry(n, rel, font,
//   measure) (a node's size), paintNode(g, s, {svgEl, href}) (a scene node with custom
//   set), builtInClasses (classes of its own, as person and database are: an ER
//   diagram's table classes), autoColourBy(map) (the map decides its colouring),
//   icons: ['ph …'] (icons it draws itself, loaded before the first draw), drawsSelection
//   (the drawing changes with the selection: selecting draws again), fansOut(r, from) (a
//   walk's step along r reaches the many side), pageSections(n) -> [{title, el}] (sections
//   of the node's page), noteLinks (a link in a node's note to another diagram links
//   the node, as a flowchart's click does: a state diagram, which has no click)
//   looks ([[preference value, reader-facing label, data-look when not the value]]) for
//   type-specific looks (each type keeps its own; [] or one look: no Look row), defaultLook,
//   detailSizes (font sizes whose semantic-zoom thresholds trigger redraws),
//   parseViews(sections, byId, warnings, own) (type-specific connection sections)
// Everything else (labels, shapes, notes, icons, relations and views, list mode,
// painting, the stage) is shared.
import * as mindmap from './mindmap/diagram.js';
import * as flowchart from './flowchart/diagram.js';
import * as sequence from './sequence/diagram.js';
import * as state from './state/diagram.js';
import * as er from './er/diagram.js';

export const DIAGRAMS = [mindmap, flowchart, sequence, state, er];

export const diagramForHeader = (header) => DIAGRAMS.find((d) => d.matches(header)) || null;
export const diagramOf = (map) => DIAGRAMS.find((d) => d.type === map?.type) || mindmap;
