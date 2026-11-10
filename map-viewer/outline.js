// outline.js — where an arrow meets a drawn shape (WO-59). Pure: no DOM.
//
// A shape's outline is the same SVG path the viewer draws (geometry.js outlineOf), so
// what is drawn and where arrows end can never disagree. samplePath turns a path into
// straight segments (curves and arcs sampled); clipToOutline moves an arrow's end along
// its last straight run, from the box round the shape, to the first outline it meets.
// Paths use M L H V Q A Z, absolute or relative.

const STEPS = 16;   // segments per curve or arc

// [[ax, ay, bx, by], ...]
export function samplePath(d) {
  const segs = [];
  const tok = String(d).match(/[MLHVQAZmlhvqaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let cmd = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tok[i++]);
  const line = (nx, ny) => { segs.push([x, y, nx, ny]); x = nx; y = ny; };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd == null) break;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': { x = num() + ox; y = num() + oy; sx = x; sy = y; cmd = rel ? 'l' : 'L'; break; }
      case 'L': { const nx = num() + ox; line(nx, num() + oy); break; }
      case 'H': line(num() + ox, y); break;
      case 'V': line(x, num() + oy); break;
      case 'Q': {
        const cx = num() + ox; const cy = num() + oy; const ex = num() + ox; const ey = num() + oy;
        const [x0, y0] = [x, y];
        for (let k = 1; k <= STEPS; k++) {
          const t = k / STEPS;
          const u = 1 - t;
          line(u * u * x0 + 2 * u * t * cx + t * t * ex, u * u * y0 + 2 * u * t * cy + t * t * ey);
        }
        break;
      }
      case 'A': {
        const rx = num(); const ry = num(); const rot = num(); const large = num(); const sweep = num();
        const ex = num() + ox; const ey = num() + oy;
        for (const [px, py] of arcPoints(x, y, rx, ry, rot, large, sweep, ex, ey)) line(px, py);
        break;
      }
      case 'Z': line(sx, sy); cmd = null; break;
      default: i++;
    }
  }
  return segs;
}

// an SVG arc as points after its start (endpoint to centre form, SVG 1.1 F.6.5)
function arcPoints(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy;
  const y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2;
  const cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let j = 1; j <= STEPS; j++) {
    const t = t1 + (dt * j) / STEPS;
    const px = rx * Math.cos(t);
    const py = ry * Math.sin(t);
    out.push(j === STEPS ? [x2, y2] : [c * px - s * py + cx, s * px + c * py + cy]);
  }
  return out;
}

// end: the arrow's end on the box round the shape; from: the point before it on the
// arrow (the end's run comes from there). Both in the shape's own coordinates (0..w,
// 0..h). Returns the end moved along the run to the first outline it meets, or the end
// itself when the run meets none (a shape with an open side).
export function clipToOutline(segs, end, from) {
  const ux = end[0] - from[0];
  const uy = end[1] - from[1];
  const len = Math.hypot(ux, uy);
  if (!len) return end;
  const dx = ux / len;
  const dy = uy / len;
  const E = 1e-6;
  let best = Infinity;
  for (const [ax, ay, bx, by] of segs) {
    const ex = bx - ax;
    const ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < E) continue;   // parallel to the run
    const qx = ax - end[0];
    const qy = ay - end[1];
    const t = (qx * ey - qy * ex) / den;    // along the run, from the end
    const s = (qx * dy - qy * dx) / den;    // along the segment
    if (t < -0.5 || s < -E || s > 1 + E) continue;
    if (t < best) best = t;
  }
  return best === Infinity ? end : [end[0] + dx * Math.max(0, best), end[1] + dy * Math.max(0, best)];
}
