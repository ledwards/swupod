/**
 * Measurement tools for building voice packs.
 *
 * These exist because "does it sound right?" is not answerable by argument, and
 * three separate attempts at the mask pack failed on exactly that. Each of them was
 * settled by measuring instead:
 *
 *   - a `say` voice pitched down by asetrate measured the SAME F0 as a real bass
 *     and sounded nothing like one, because resampling drags the formants with it
 *   - the mask chain was tuned against a band profile of a real Vader line, and a
 *     too-coarse reading of that profile produced a tenor
 *   - the breath was shaped against the measured formants of a real inhale/exhale
 *
 * Usage:
 *   node scripts/voice-lab/voice-lab.js f0 <file...>          median pitch
 *   node scripts/voice-lab/voice-lab.js spectrum <file>       per-third-octave, dB below peak
 *   node scripts/voice-lab/voice-lab.js envelope <file> [s]   loudness over time
 *   node scripts/voice-lab/voice-lab.js compare <ref> <file>  band-by-band delta vs a reference
 *   node scripts/voice-lab/voice-lab.js trend <file...>       duration, brightness, rising/falling
 */
import { execSync } from 'node:child_process'

const HZ = [40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300]

function pcm(file, rate) {
  const buf = execSync(`ffmpeg -v error -i "${file}" -ac 1 -ar ${rate} -f f32le -`, { maxBuffer: 1 << 28 })
  const n = buf.length / 4
  const x = new Float32Array(n)
  for (let i = 0; i < n; i += 1) x[i] = buf.readFloatLE(i * 4)
  return x
}

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k)
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
      }
    }
  }
}

/** Average magnitude spectrum over loud frames, in dB relative to the loudest bin. */
function spectrum(file, N = 2048, SR = 16000) {
  const x = pcm(file, SR)
  const pow = new Float64Array(N / 2)
  let frames = 0
  for (let s = 0; s + N < x.length; s += N / 2) {
    let e = 0
    for (let i = 0; i < N; i += 1) e += x[s + i] * x[s + i]
    if (Math.sqrt(e / N) < 0.008) continue // silence contributes nothing but noise
    const re = new Float64Array(N), im = new Float64Array(N)
    for (let i = 0; i < N; i += 1) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
    fft(re, im)
    frames += 1
    for (let k = 0; k < N / 2; k += 1) pow[k] += re[k] * re[k] + im[k] * im[k]
  }
  if (!frames) return null
  const db = HZ.map((hz) => 10 * Math.log10(pow[Math.round(hz * N / SR)] / frames + 1e-12))
  const max = Math.max(...db)
  return db.map((v) => Number((v - max).toFixed(1)))
}

/**
 * Median F0 by autocorrelation over voiced frames.
 *
 * Search range is 55-300 Hz. Values that pile up against 55 are suspect — check
 * them with `spectrum`, because autocorrelation happily locks onto a subharmonic
 * and reports an octave too low.
 */
function f0(file) {
  const SR = 16000, W = 1024, HOP = 256
  const x = pcm(file, SR)
  const lo = Math.floor(SR / 300), hi = Math.floor(SR / 55)
  const found = []
  for (let s = 0; s + W < x.length; s += HOP) {
    let e = 0
    for (let i = 0; i < W; i += 1) e += x[s + i] * x[s + i]
    if (Math.sqrt(e / W) < 0.02) continue
    let best = 0, bestLag = 0
    for (let lag = lo; lag <= hi; lag += 1) {
      let c = 0, na = 0, nb = 0
      for (let i = 0; i + lag < W; i += 1) {
        c += x[s + i] * x[s + i + lag]; na += x[s + i] * x[s + i]; nb += x[s + i + lag] * x[s + i + lag]
      }
      const r = c / (Math.sqrt(na * nb) + 1e-9)
      if (r > best) { best = r; bestLag = lag }
    }
    if (best > 0.5 && bestLag) found.push(SR / bestLag)
  }
  if (!found.length) return null
  found.sort((a, b) => a - b)
  return { median: found[found.length >> 1], lowDecile: found[Math.floor(found.length * 0.1)], frames: found.length }
}

function envelope(file, step) {
  const SR = 44100
  const x = pcm(file, SR)
  const N = Math.round(SR * step), rows = []
  for (let i = 0; i < x.length; i += N) {
    let s = 0, c = 0
    for (let j = i; j < Math.min(i + N, x.length); j += 1) { s += x[j] * x[j]; c += 1 }
    rows.push([i / SR, Math.sqrt(s / c)])
  }
  const max = Math.max(...rows.map((r) => r[1])) || 1
  return rows.map(([t, r]) => [t, r / max, 20 * Math.log10(r + 1e-9)])
}

/**
 * Mean spectral centroid over loud frames, and whether it rises or falls.
 *
 * This is how the `artoo` pack was mapped to cues. Astromech has no words to go on,
 * so each sound was assigned by measured contour instead: a rising centroid reads as
 * cheerful or affirmative, a falling one as doubtful or wrong. Useful for any pack
 * whose cues carry meaning through tone rather than content.
 */
function trend(file) {
  const SR = 16000, N = 1024
  const x = pcm(file, SR)
  const points = []
  for (let s = 0; s + N < x.length; s += N / 2) {
    let e = 0
    for (let i = 0; i < N; i += 1) e += x[s + i] * x[s + i]
    if (Math.sqrt(e / N) < 0.02) continue
    const re = new Float64Array(N), im = new Float64Array(N)
    for (let i = 0; i < N; i += 1) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))
    fft(re, im)
    let num = 0, den = 0
    for (let k = 1; k < N / 2; k += 1) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k])
      num += m * k * SR / N
      den += m
    }
    points.push(den ? num / den : 0)
  }
  if (!points.length) return null
  const third = Math.max(1, Math.floor(points.length / 3))
  const head = points.slice(0, third).reduce((a, b) => a + b, 0) / third
  const tail = points.slice(-third).reduce((a, b) => a + b, 0) / third
  const mean = points.reduce((a, b) => a + b, 0) / points.length
  return { dur: x.length / SR, mean, head, tail, slope: tail - head }
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'f0') {
  for (const f of rest) {
    const r = f0(f)
    console.log(f.split('/').pop().padEnd(26) +
      (r ? `median ${r.median.toFixed(1)} Hz   low-decile ${r.lowDecile.toFixed(1)} Hz   (${r.frames} frames)` : 'no voiced frames'))
  }
} else if (cmd === 'spectrum') {
  const s = spectrum(rest[0])
  if (!s) { console.error('no loud frames'); process.exit(1) }
  console.log(rest[0].split('/').pop())
  HZ.forEach((hz, i) => console.log(
    String(hz).padStart(6) + ' Hz ' + '#'.repeat(Math.max(0, Math.round((s[i] + 60) / 1.6))) + ' ' + s[i]))
} else if (cmd === 'envelope') {
  const step = Number(rest[1] || 0.15)
  for (const [t, rel, db] of envelope(rest[0], step)) {
    console.log(t.toFixed(2).padStart(6) + ' ' + '#'.repeat(Math.round(rel * 50)).padEnd(50, '.') + ' ' + db.toFixed(1))
  }
} else if (cmd === 'compare') {
  const [refFile, file] = rest
  const a = spectrum(refFile), b = spectrum(file)
  if (!a || !b) { console.error('no loud frames'); process.exit(1) }
  let err = 0
  console.log('    Hz     ref     this    delta')
  HZ.forEach((hz, i) => {
    const d = b[i] - a[i]
    err += Math.abs(d)
    console.log(String(hz).padStart(6) + String(a[i]).padStart(8) + String(b[i]).padStart(9) +
      String(d.toFixed(1)).padStart(9) + (Math.abs(d) > 7 ? (d > 0 ? '  << too strong' : '  << too weak') : ''))
  })
  console.log('  total error ' + err.toFixed(1))
} else if (cmd === 'trend') {
  for (const f of rest) {
    const t = trend(f)
    if (!t) { console.log(f.split('/').pop().padEnd(24) + '(silent)'); continue }
    // 350 Hz: below that the contour is not audible as a direction, it is just texture.
    const dir = t.slope > 350 ? 'RISING' : t.slope < -350 ? 'falling' : 'flat'
    console.log(f.split('/').pop().padEnd(24) +
      `dur ${t.dur.toFixed(2)}s  bright ${Math.round(t.mean)}Hz  ` +
      `${Math.round(t.head)} -> ${Math.round(t.tail)}  ${dir}`)
  }
} else {
  console.error('Usage: voice-lab.js <f0|spectrum|envelope|compare|trend> <file...>')
  process.exit(1)
}
