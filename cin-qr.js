/* Tiny offline QR code maker (byte mode, error correction M, versions 1-14). window.CINQR.make(text) -> array of rows of booleans */
(function () {
  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24], BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9];
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  function raw(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
  const dataCw = v => Math.floor(raw(v) / 8) - ECC[v] * BLK[v];
  function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function divisor(d) { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = mul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
  function rem(data, div) { const r = new Array(div.length).fill(0); data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); }); return r; }
  function align(v) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, r = [6]; for (let p = v * 4 + 10; r.length < n; p -= step) r.splice(1, 0, p); return r; }
  function make(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let v = 1; while (v <= 14 && 4 + (v < 10 ? 8 : 16) + 8 * bytes.length > dataCw(v) * 8) v++;
    if (v > 14) throw new Error('Text too long for the QR code');
    const size = v * 4 + 17, bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCw(v) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    // error correction + interleave
    const nb = BLK[v], el = ECC[v], rawCw = Math.floor(raw(v) / 8), nShort = nb - rawCw % nb, sLen = Math.floor(rawCw / nb), div = divisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + sLen - el + (i < nShort ? 0 : 1)); k += d.length; const e = rem(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
    const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== sLen - el || j >= nShort) all.push(b[i]); });
    const m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, c) => { m[y][x] = c; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = align(v), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    function fmt(mask) { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i)); set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i)); set(8, size - 8, true); }
    fmt(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const c = bit(b, i), a = size - 11 + i % 3, d = Math.floor(i / 3); set(a, d, c); set(d, a, c); } }
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && k < all.length * 8) { m[y][x] = bit(all[k >>> 3], 7 - (k & 7)); k++; } } }
    const mask = (n) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let inv; switch (n) { case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break; case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: inv = x * y % 2 + x * y % 3 === 0; break; case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break; default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0; } if (!fn[y][x] && inv) m[y][x] = !m[y][x]; } };
    function penalty() { let p = 0;
      for (let y = 0; y < size; y++) for (const row of [0, 1]) { let run = 1; for (let x = 1; x < size; x++) { const a = row ? m[x][y] : m[y][x], b = row ? m[x - 1][y] : m[y][x - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      let dark = 0; m.forEach(r => r.forEach(c => { if (c) dark++; })); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; return p; }
    let best = 0, bp = 1e9;
    for (let n = 0; n < 8; n++) { mask(n); fmt(n); const p = penalty(); if (p < bp) { bp = p; best = n; } mask(n); }
    mask(best); fmt(best); return m;
  }
  window.CINQR = { make };
})();
