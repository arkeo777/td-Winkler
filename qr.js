/* Peptide Beach — tiny self-contained QR Code generator (byte mode, versions 1–40).
   Written for this project so the portal can make convention QR codes fully
   offline with no third-party code. Follows the ISO/IEC 18004 encoding steps:
   data codewords -> Reed–Solomon ECC -> interleave -> place -> best of 8 masks.

   Usage:
     var qr = PBQR.encode("https://example.com/convention.html?c=slug", "M");
     qr.size            // modules per side
     qr.get(x, y)       // true = dark module
     PBQR.toSvg(qr, { border: 4, dark: "#000", light: "#fff" })  // SVG string
*/
(function (root) {
  "use strict";

  var ECL = { L: { ord: 0, bits: 1 }, M: { ord: 1, bits: 0 }, Q: { ord: 2, bits: 3 }, H: { ord: 3, bits: 2 } };

  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 80]
  ];

  function numRawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawModules(ver) / 8) - ECC_PER_BLOCK[ecl.ord][ver] * NUM_BLOCKS[ecl.ord][ver];
  }

  /* ---- Reed–Solomon over GF(2^8), poly 0x11D ---- */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var root = 1;
    for (var j = 0; j < degree; j++) {
      for (var k = 0; k < res.length; k++) {
        res[k] = gfMul(res[k], root);
        if (k + 1 < res.length) res[k] ^= res[k + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    var res = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ res.shift();
      res.push(0);
      divisor.forEach(function (coef, i) { res[i] ^= gfMul(coef, factor); });
    });
    return res;
  }

  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encode(text, eclName) {
    var ecl = ECL[eclName] || ECL.M;
    var data = utf8Bytes(String(text));

    // pick the smallest version that fits (byte mode)
    var ver, cap;
    for (ver = 1; ver <= 40; ver++) {
      cap = numDataCodewords(ver, ecl) * 8;
      var ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + data.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error("Text too long for a QR code");
    // bump ECC level for free if it still fits
    ["M", "Q", "H"].forEach(function (n) {
      var e = ECL[n];
      if (e.ord > ecl.ord && 4 + (ver <= 9 ? 8 : 16) + data.length * 8 <= numDataCodewords(ver, e) * 8) ecl = e;
    });
    cap = numDataCodewords(ver, ecl) * 8;

    // bit stream
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(0x4, 4);
    put(data.length, ver <= 9 ? 8 : 16);
    data.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var dataCw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCw.push(b);
    }

    // split into blocks, add ECC, interleave
    var nBlocks = NUM_BLOCKS[ecl.ord][ver], eccLen = ECC_PER_BLOCK[ecl.ord][ver];
    var rawCw = Math.floor(numRawModules(ver) / 8);
    var nShort = nBlocks - rawCw % nBlocks, shortLen = Math.floor(rawCw / nBlocks);
    var blocks = [], div = rsDivisor(eccLen), k = 0;
    for (var bi = 0; bi < nBlocks; bi++) {
      var dlen = shortLen - eccLen + (bi < nShort ? 0 : 1);
      var dat = dataCw.slice(k, k + dlen); k += dlen;
      var ecc = rsRemainder(dat, div);
      if (bi < nShort) dat.push(0); // placeholder for equal length
      blocks.push(dat.concat(ecc));
    }
    var allCw = [];
    for (var c = 0; c < blocks[0].length; c++) {
      for (var bj = 0; bj < blocks.length; bj++) {
        if (c !== shortLen - eccLen || bj >= nShort) allCw.push(blocks[bj][c]);
      }
    }

    // matrix
    var size = ver * 4 + 17;
    var mod = [], fn = [];
    for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setFn(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
      }
    }
    function align(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function alignPositions() {
      if (ver === 1) return [];
      var n = Math.floor(ver / 7) + 2;
      var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      var res = [6];
      for (var pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
      return res;
    }
    function drawFormat(mask) {
      var d = ecl.bits << 3 | mask, rem = d;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fbits = (d << 10 | rem) ^ 0x5412;
      function g(i) { return ((fbits >>> i) & 1) !== 0; }
      for (var a = 0; a <= 5; a++) setFn(8, a, g(a));
      setFn(8, 7, g(6)); setFn(8, 8, g(7)); setFn(7, 8, g(8));
      for (var b2 = 9; b2 < 15; b2++) setFn(14 - b2, 8, g(b2));
      for (var c2 = 0; c2 < 8; c2++) setFn(size - 1 - c2, 8, g(c2));
      for (var d2 = 8; d2 < 15; d2++) setFn(8, size - 15 + d2, g(d2));
      setFn(8, size - 8, true); // dark module
    }
    function drawVersion() {
      if (ver < 7) return;
      var rem = ver;
      for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = ver << 12 | rem;
      for (var j = 0; j < 18; j++) {
        var bit = ((vb >>> j) & 1) !== 0, a = size - 11 + j % 3, b = Math.floor(j / 3);
        setFn(a, b, bit); setFn(b, a, bit);
      }
    }

    for (var t = 0; t < size; t++) { setFn(6, t, t % 2 === 0); setFn(t, 6, t % 2 === 0); }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = alignPositions(), na = ap.length;
    for (var ai = 0; ai < na; ai++) for (var aj = 0; aj < na; aj++) {
      if (!((ai === 0 && aj === 0) || (ai === 0 && aj === na - 1) || (ai === na - 1 && aj === 0))) align(ap[ai], ap[aj]);
    }
    drawFormat(0); // reserve
    drawVersion();

    // place data in zigzag
    var bitIdx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj, upward = ((right + 1) & 2) === 0;
          var yy = upward ? size - 1 - vert : vert;
          if (!fn[yy][x] && bitIdx < allCw.length * 8) {
            mod[yy][x] = ((allCw[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
        }
      }
    }

    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        if (fn[y][x]) continue;
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if (inv) mod[y][x] = !mod[y][x];
      }
    }

    function penalty() {
      var p = 0, x, y;
      function finderLike(run) {
        var n = run[1];
        var core = n > 0 && run[2] === n && run[3] === n * 3 && run[4] === n && run[5] === n;
        return (core && run[0] >= n * 4 && run[6] >= n ? 1 : 0) + (core && run[6] >= n * 4 && run[0] >= n ? 1 : 0);
      }
      function addHist(len, run) { if (run[0] === 0) len += size; run.pop(); run.unshift(len); }
      function terminate(color, len, run) {
        if (color) { addHist(len, run); len = 0; }
        len += size; addHist(len, run);
        return finderLike(run);
      }
      function line(get) {
        var color = false, len = 0, run = [0, 0, 0, 0, 0, 0, 0], s = 0;
        for (var i = 0; i < size; i++) {
          if (get(i) === color) { len++; if (len === 5) s += 3; else if (len > 5) s++; }
          else { addHist(len, run); if (!color) s += finderLike(run) * 40; color = get(i); len = 1; }
        }
        s += terminate(color, len, run) * 40;
        return s;
      }
      for (y = 0; y < size; y++) p += line(function (i) { return mod[y][i]; });
      for (x = 0; x < size; x++) p += line(function (i) { return mod[i][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      var dark = 0;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    }

    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var pen = penalty();
      if (pen < bestP) { bestP = pen; best = m; }
      applyMask(m); // undo
    }
    applyMask(best); drawFormat(best);

    return {
      version: ver, size: size, mask: best,
      ecc: Object.keys(ECL).filter(function (k) { return ECL[k] === ecl; })[0],
      get: function (x, y) { return x >= 0 && x < size && y >= 0 && y < size && mod[y][x]; }
    };
  }

  function toSvg(qr, opts) {
    opts = opts || {};
    var border = opts.border == null ? 4 : opts.border;
    var dark = opts.dark || "#000000", light = opts.light || "#FFFFFF";
    var dim = qr.size + border * 2, path = [];
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
      if (qr.get(x, y)) path.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim + '" shape-rendering="crispEdges"' +
      (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : "") + ">" +
      (light === "none" ? "" : '<rect width="100%" height="100%" fill="' + light + '"/>') +
      '<path d="' + path.join("") + '" fill="' + dark + '"/></svg>';
  }

  root.PBQR = { encode: encode, toSvg: toSvg };
})(typeof window !== "undefined" ? window : this);
