// Shared dependency-free digest fallback for offline HTML policies.
export function sha256(bytes) {
  const k = [];
  let h = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (h.length < 8) h.push((n ** (1 / 2) * 2 ** 32) | 0);
    k.push((n ** (1 / 3) * 2 ** 32) | 0);
  }
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(total - 4, (bytes.length * 8) >>> 0);
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Int32Array(64);
  for (let at = 0; at < total; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, x] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (x + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      x = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [a, b, c, d, e, f, g, x].map((v, i) => (v + h[i]) | 0);
  }
  const out = new DataView(new ArrayBuffer(32));
  h.forEach((v, i) => out.setInt32(i * 4, v));
  return new Uint8Array(out.buffer);
}

