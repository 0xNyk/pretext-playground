import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

// ─── Config (mutated by UI panel) ───────────────────────────

export const cfg = {
  // Dragon
  dragonSegments: 60,
  dragonSpeed: 0.18,
  dragonScale: 1.0,
  showWings: true,
  showSpines: true,
  // Physics
  pushForce: 6,
  springStrength: 0.015,
  damping: 0.93,
  burnGravity: 0.8,
  // Fire
  fireRadius: 120,
  fireForce: 25,
  screenShake: true,
  showEmbers: true,
  showParticles: true,
  // Atmosphere
  showRunes: true,
  showCursor: true,
  textOpacity: 1.0,
  // Enemies
  showEnemies: true,
  enemyCount: 8,
  enemySpeed: 0.6,
}

// Presets
const PRESETS: Record<string, Partial<typeof cfg>> = {
  Default: {},
  Gentle: {
    dragonSpeed: 0.10, pushForce: 5, fireForce: 10, fireRadius: 60,
    screenShake: false, burnGravity: 0.2, springStrength: 0.03,
  },
  Chaos: {
    pushForce: 25, fireForce: 50, fireRadius: 200, burnGravity: 2.5,
    springStrength: 0.005, damping: 0.96, screenShake: true,
  },
  Zen: {
    showParticles: false, showEmbers: false, screenShake: false,
    showRunes: false, pushForce: 4, fireForce: 8,
    springStrength: 0.04, burnGravity: 0,
  },
  Tiny: {
    dragonSegments: 20, dragonScale: 0.6, fireRadius: 50, pushForce: 6,
  },
  Leviathan: {
    dragonSegments: 80, dragonScale: 2.0, dragonSpeed: 0.08,
    pushForce: 20, fireRadius: 180,
  },
}

const DEFAULT_CFG = { ...cfg }

function applyPreset(name: string) {
  Object.assign(cfg, DEFAULT_CFG, PRESETS[name] || {})
  rebuildDragon()
  syncUI()
}

// ─── Canvas ─────────────────────────────────────────────────

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1
let W = innerWidth, H = innerHeight

let initialized = false
function resize() {
  W = innerWidth; H = innerHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (initialized) { layoutAllText(); buildTunnel(); buildFloatingCards() }
}
resize()
addEventListener('resize', resize)

// ─── Mouse ──────────────────────────────────────────────────

const mouse = { x: W / 2, y: H / 2 }
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY })
addEventListener('touchmove', (e) => {
  e.preventDefault()
  mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY
}, { passive: false })

// ─── Screen shake ───────────────────────────────────────────

let shakeIntensity = 0, shakeX = 0, shakeY = 0

function triggerShake(intensity: number) {
  if (!cfg.screenShake) return
  shakeIntensity = Math.max(shakeIntensity, Math.min(intensity, 8))
}

function updateShake() {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity
    shakeY = (Math.random() - 0.5) * shakeIntensity
    shakeIntensity *= 0.85
  } else { shakeX = 0; shakeY = 0; shakeIntensity = 0 }
}

// ─── Letters ────────────────────────────────────────────────

type Letter = {
  char: string
  homeX: number; homeY: number
  x: number; y: number
  vx: number; vy: number
  angle: number; angularVel: number
  font: string; fontSize: number
  color: string; baseAlpha: number
  burning: boolean; burnTimer: number
  charWidth: number
  scaleMultiplier: number
  gravity: number
}

const letters: Letter[] = []

// ─── Embers ─────────────────────────────────────────────────

type Ember = { x: number; y: number; vx: number; vy: number; life: number; char: string; size: number; color: string }
const embers: Ember[] = []

function spawnEmbers(x: number, y: number, count: number) {
  if (!cfg.showEmbers || embers.length > 60) return
  for (let i = 0; i < Math.min(count, 3); i++) {
    const a = Math.random() * Math.PI * 2
    embers.push({
      x, y, vx: Math.cos(a) * (1 + Math.random() * 3), vy: Math.sin(a) * (1 + Math.random() * 3) - 2,
      life: 0.3 + Math.random() * 0.6,
      char: ['·', '•', '∘', '˚'][Math.floor(Math.random() * 4)],
      size: 4 + Math.random() * 7,
      color: ['#ff6600', '#ffaa00', '#ff4400'][Math.floor(Math.random() * 3)],
    })
  }
}

// ─── Text entries ───────────────────────────────────────────

type TextEntry = {
  text: string; font: string; fontSize: number; color: string; alpha: number
  yOffset: number; maxWidth: number; lineHeight: number
  style: 'heading' | 'body' | 'quote' | 'cjk' | 'code' | 'huge'
  column: 'left' | 'right' | 'center'
}

const textEntries: TextEntry[] = [
  { text: 'PRETEXT', font: '"Courier New", monospace', fontSize: 120, color: '#222', alpha: 0.5, yOffset: -20, maxWidth: 1200, lineHeight: 130, style: 'huge', column: 'center' },
  { text: 'HERE BE DRAGONS', font: '"Courier New", monospace', fontSize: 54, color: '#f0f0f0', alpha: 1.0, yOffset: 100, maxWidth: 900, lineHeight: 64, style: 'heading', column: 'left' },
  { text: 'Text measurement without DOM reflow — pure arithmetic, pure fire', font: '"Courier New", monospace', fontSize: 18, color: '#999', alpha: 0.75, yOffset: 175, maxWidth: 700, lineHeight: 26, style: 'body', column: 'left' },
  { text: 'In the age of AI, text layout was the last and biggest bottleneck for unlocking much more interesting UIs. No longer do we have to choose between the flashiness of a WebGL landing page versus the practicality of a blog article. The engine is tiny, aware of browser quirks, and supports every language you will ever need.', font: '"Courier New", monospace', fontSize: 14, color: '#bbb', alpha: 0.65, yOffset: 225, maxWidth: 500, lineHeight: 21, style: 'body', column: 'left' },
  { text: '春天到了 — 龍が目を覚ます。بدأت الرحلة الكبرى 🐉🔥 prepare() once, layout() forever. 每一个文字都是一个粒子。', font: '"Courier New", monospace', fontSize: 16, color: '#ee9944', alpha: 0.8, yOffset: 460, maxWidth: 520, lineHeight: 24, style: 'cjk', column: 'left' },
  { text: "import { prepare, layout } from '@chenglou/pretext'\nconst prepared = prepare(text, '16px Inter')\nconst { height } = layout(prepared, width, 20)\n// ~0.0002ms per layout call. Pure math.", font: '"Courier New", monospace', fontSize: 13, color: '#77cc77', alpha: 0.6, yOffset: 550, maxWidth: 520, lineHeight: 18, style: 'code', column: 'left' },
  { text: '"Fast, accurate and comprehensive userland text measurement algorithm in pure TypeScript, usable for laying out entire web pages without CSS"', font: '"Courier New", monospace', fontSize: 14, color: '#cc9966', alpha: 0.65, yOffset: 120, maxWidth: 380, lineHeight: 21, style: 'quote', column: 'right' },
  { text: 'Shrinkwrapped chat bubbles. Responsive magazine layouts. Variable font width ASCII art. Canvas, SVG, WebGL — render anywhere. 120fps masonry with 100k items.', font: '"Courier New", monospace', fontSize: 13, color: '#bbb', alpha: 0.6, yOffset: 310, maxWidth: 380, lineHeight: 19, style: 'body', column: 'right' },
  { text: '✦ CJK per-character breaking\n✦ Arabic/Hebrew bidi\n✦ Emoji correction\n✦ Soft hyphens & tab stops\n✦ overflow-wrap: break-word\n✦ Grapheme-level breaking', font: '"Courier New", monospace', fontSize: 12, color: '#ff9955', alpha: 0.55, yOffset: 470, maxWidth: 350, lineHeight: 17, style: 'code', column: 'right' },
  { text: 'The serpent coils through canvas. Each scale a character. Each breath a particle. The text scatters and reforms.', font: '"Courier New", monospace', fontSize: 15, color: '#998877', alpha: 0.5, yOffset: 680, maxWidth: 800, lineHeight: 22, style: 'quote', column: 'center' },
]

function layoutAllText() {
  letters.length = 0
  const mx = Math.max(50, W * 0.06), my = Math.max(60, H * 0.06)
  const cw = W - mx * 2
  const twoCol = cw > 700
  const col2X = twoCol ? mx + cw * 0.56 : mx

  for (const entry of textEntries) {
    const fontStr = `${entry.fontSize}px ${entry.font}`
    let baseX: number, maxW: number
    if (entry.column === 'right') {
      baseX = twoCol ? col2X : mx
      maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.4 : cw)
    } else if (entry.column === 'center') {
      maxW = Math.min(entry.maxWidth, cw)
      baseX = mx + (cw - maxW) / 2
    } else {
      baseX = mx
      maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.5 : cw)
    }
    const baseY = my + entry.yOffset

    try {
      const prepared = prepareWithSegments(entry.text, fontStr, entry.style === 'code' ? { whiteSpace: 'pre-wrap' } : undefined)
      const { lines } = layoutWithLines(prepared, maxW, entry.lineHeight)
      for (let li = 0; li < lines.length; li++) {
        let xc = baseX
        const y = baseY + li * entry.lineHeight
        ctx.font = fontStr
        for (const char of lines[li].text) {
          if (char === '\n') continue
          const cw2 = ctx.measureText(char).width
          letters.push({
            char, homeX: xc + cw2 / 2, homeY: y + entry.lineHeight / 2,
            x: xc + cw2 / 2, y: y + entry.lineHeight / 2,
            vx: 0, vy: 0, angle: 0, angularVel: 0,
            font: fontStr, fontSize: entry.fontSize,
            color: entry.color, baseAlpha: entry.alpha,
            burning: false, burnTimer: 0, charWidth: cw2,
            scaleMultiplier: 1, gravity: 0,
          })
          xc += cw2
        }
      }
    } catch { /* skip */ }
  }
}

// ─── Dragon chain ───────────────────────────────────────────

const SEG_SPACING = 10
let chain: { x: number; y: number; px: number; py: number }[] = []

function rebuildDragon() {
  const n = cfg.dragonSegments
  chain = []
  for (let i = 0; i < n; i++) {
    chain.push({ x: W / 2, y: H / 2 + i * SEG_SPACING, px: W / 2, py: H / 2 + i * SEG_SPACING })
  }
}
rebuildDragon()

const dragonChars = '◆◆◇▼█▓▓▒╬╬╬╬╬╬╬╬╬╬╫╫╫╪╪╪╧╧╤╤╥╥║║││┃┃╎╎╏╏::····..'.split('')

function segScale(i: number): number {
  const n = chain.length
  if (i < 3) return (2.5 - i * 0.15) * cfg.dragonScale
  const t = (i - 3) / (n - 3)
  return (2.0 * (1 - t * t) + 0.2) * cfg.dragonScale
}

function segColor(i: number, time: number): string {
  const t = i / chain.length
  const p = Math.sin(time * 3 + i * 0.3) * 0.12
  if (i < 3) return `rgb(255,${180 + p * 60 | 0},${40 + p * 30 | 0})`
  const w = Math.sin(time * 2 - i * 0.15) * 0.15
  return `rgba(${(255 * (1 - t * 0.5) + p * 20) | 0},${(140 * (1 - t * 0.8) + w * 60) | 0},${(30 * (1 - t) + w * 20) | 0},${1 - t * 0.45})`
}

function updateChain() {
  const n = chain.length
  for (let i = 0; i < n; i++) { chain[i].px = chain[i].x; chain[i].py = chain[i].y }
  chain[0].x += (mouse.x - chain[0].x) * cfg.dragonSpeed
  chain[0].y += (mouse.y - chain[0].y) * cfg.dragonSpeed
  for (let i = 1; i < n; i++) {
    const p = chain[i - 1], c = chain[i]
    const dx = c.x - p.x, dy = c.y - p.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > SEG_SPACING) { const r = SEG_SPACING / d; c.x = p.x + dx * r; c.y = p.y + dy * r }
  }
}

// ─── Physics ────────────────────────────────────────────────

function interactLetters(dt: number) {
  const n = chain.length
  for (const L of letters) {
    // Dragon body collision
    const checkSegs = Math.min(Math.round(n * 0.4), n)
    for (let si = 0; si < checkSegs; si++) {
      const seg = chain[si], sc = segScale(si)
      const rad = 14 * sc * 0.45
      const dx = L.x - seg.x, dy = L.y - seg.y
      const dSq = dx * dx + dy * dy
      const minD = rad + L.charWidth * 0.4 + 4
      if (dSq < minD * minD && dSq > 0.01) {
        const d = Math.sqrt(dSq)
        const f = cfg.pushForce * ((minD - d) / minD) * sc
        const nx = dx / d, ny = dy / d
        L.vx += nx * f + (seg.x - seg.px) * 0.4
        L.vy += ny * f + (seg.y - seg.py) * 0.4
        L.angularVel += (nx * 0.3 - ny * 0.2) * f * 0.12
      }
    }

    // Wake turbulence (gentle)
    for (let si = 5; si < n; si += 5) {
      const seg = chain[si], dx = L.x - seg.x, dy = L.y - seg.y
      const dSq = dx * dx + dy * dy
      if (dSq < 1600 && dSq > 100) {
        const w = (1 - Math.sqrt(dSq) / 40) * 0.12
        L.vx += (seg.x - seg.px) * w
        L.vy += (seg.y - seg.py) * w
      }
    }

    // Burn
    if (L.burning) {
      L.burnTimer -= dt
      L.scaleMultiplier = 1 + L.burnTimer * 0.4
      L.gravity = cfg.burnGravity
      if (Math.random() < dt * 2) spawnEmbers(L.x, L.y, 1)
      if (L.burnTimer <= 0) { L.burning = false; L.burnTimer = 0; L.scaleMultiplier = 1; L.gravity = 0 }
    }

    // Spring home
    const hdx = L.homeX - L.x, hdy = L.homeY - L.y
    const hd = Math.sqrt(hdx * hdx + hdy * hdy)
    if (hd > 0.5) {
      const sf = cfg.springStrength * (1 + hd * 0.001)
      L.vx += hdx * sf; L.vy += hdy * sf
      L.angularVel -= L.angle * 0.05
    } else { L.angle *= 0.9 }

    L.vy += L.gravity
    L.vx *= cfg.damping; L.vy *= cfg.damping
    L.angularVel *= 0.91
    L.x += L.vx; L.y += L.vy; L.angle += L.angularVel
  }
}

function fireBlastAt(x: number, y: number, dx: number, dy: number) {
  let hits = 0
  const rSq = cfg.fireRadius * cfg.fireRadius
  for (const L of letters) {
    const ldx = L.x - x, ldy = L.y - y, dSq = ldx * ldx + ldy * ldy
    if (dSq < rSq && dSq > 0.01) {
      const d = Math.sqrt(dSq), f = cfg.fireForce * ((1 - d / cfg.fireRadius) ** 2)
      L.vx += (ldx / d * 0.4 + dx * 0.6) * f
      L.vy += (ldy / d * 0.4 + dy * 0.6) * f - f * 0.2
      L.angularVel += (Math.random() - 0.5) * f * 0.3
      L.burning = true; L.burnTimer = Math.max(L.burnTimer, 0.5 + Math.random() * 1.2)
      hits++
    }
  }
  if (hits > 3) { triggerShake(Math.min(hits * 0.4, 6)); spawnEmbers(x, y, Math.min(hits, 6)) }
}

// ─── Draw letters ───────────────────────────────────────────

function drawLetters() {
  const opMul = cfg.textOpacity
  for (const L of letters) {
    let alpha = L.baseAlpha * opMul, color = L.color
    if (L.burning) {
      const h = Math.min(1, L.burnTimer)
      color = `rgb(255,${80 + h * 175 | 0},${h * 60 | 0})`
      alpha = Math.min(1, L.baseAlpha * opMul + 0.5)
    }
    ctx.save()
    ctx.translate(L.x, L.y); ctx.rotate(L.angle); ctx.scale(L.scaleMultiplier, L.scaleMultiplier)
    ctx.globalAlpha = alpha; ctx.font = L.font; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(L.char, 0, 0)
    if (L.burning && L.burnTimer > 0.3) {
      ctx.globalAlpha = L.burnTimer * 0.2; ctx.fillStyle = '#ffaa00'
      ctx.fillText(L.char, 0, 0)
    }
    ctx.restore()
  }
}

// ─── Fire particles ─────────────────────────────────────────

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; char: string; size: number }
const particles: Particle[] = []
const fireChars = '*✦✧⁕❋✺◌•∘˚⋆·'.split('')
let isBreathingFire = false, fireAccum = 0, totalFireTime = 0

addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('mouseup', () => { isBreathingFire = false })
addEventListener('touchstart', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('touchend', () => { isBreathingFire = false })

function emitFire(dt: number) {
  if (!isBreathingFire) { totalFireTime = 0; return }
  fireAccum += dt; totalFireTime += dt
  const head = chain[0], neck = chain[Math.min(3, chain.length - 1)]
  const fdx = head.x - neck.x, fdy = head.y - neck.y
  const len = Math.sqrt(fdx * fdx + fdy * fdy) || 1
  const dx = fdx / len, dy = fdy / len, angle = Math.atan2(fdy, fdx)

  if (cfg.showParticles) {
    while (fireAccum > 0.025) {
      fireAccum -= 0.025
      if (particles.length > 150) break
      for (let i = 0; i < 2; i++) {
        const sp = (Math.random() - 0.5) * 1.0, spd = 5 + Math.random() * 7
        particles.push({
          x: head.x + dx * 15, y: head.y + dy * 15,
          vx: Math.cos(angle + sp) * spd, vy: Math.sin(angle + sp) * spd - Math.random(),
          life: 1, maxLife: 0.3 + Math.random() * 0.4,
          char: fireChars[Math.random() * fireChars.length | 0], size: 6 + Math.random() * 12,
        })
      }
    }
  } else { fireAccum = 0 }

  const bx = head.x + dx * 50, by = head.y + dy * 50
  fireBlastAt(bx, by, dx, dy)
  hitEnemiesWithFire(bx, by)
  triggerShake(Math.min(1 + totalFireTime * 0.2, 3))
}

function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx; p.y += p.vy; p.vy -= 0.25; p.vx *= 0.97; p.life -= dt / p.maxLife
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop() }
  }
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i]
    e.x += e.vx; e.y += e.vy; e.vy += 0.15; e.vx *= 0.97; e.life -= dt
    if (e.life <= 0) { embers[i] = embers[embers.length - 1]; embers.pop() }
  }
}

function drawParticles(time: number) {
  if (cfg.showEmbers) {
    for (const e of embers) {
      ctx.save(); ctx.globalAlpha = Math.min(1, e.life * 2)
      ctx.font = `${e.size}px "Courier New",monospace`; ctx.fillStyle = e.color
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(e.char, e.x, e.y); ctx.restore()
    }
  }
  if (cfg.showParticles) {
    for (const p of particles) {
      const t = 1 - p.life
      let r: number, g: number, b: number
      if (t < 0.15) { r = 255; g = 255; b = 255 * (1 - t * 6.67) | 0 }
      else if (t < 0.4) { r = 255; g = 255 * (1 - (t - 0.15) * 3.2) | 0; b = 0 }
      else { const f = (t - 0.4) * 1.67; r = 255 * (1 - f * 0.6) | 0; g = 80 * (1 - f) | 0; b = 0 }
      ctx.save(); ctx.globalAlpha = p.life * 0.85
      ctx.font = `${p.size * (0.4 + p.life * 0.6)}px "Courier New",monospace`
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.translate(p.x, p.y); ctx.rotate(Math.sin(time * 6 + p.x * 0.04) * 0.4)
      ctx.fillText(p.char, 0, 0); ctx.restore()
    }
  }
}

// ─── 3D Text Tunnel Background ──────────────────────────────
// Rings of Pretext-measured multilingual text receding into a vanishing point

const tunnelTexts = [
  'PRETEXT — pure text measurement',
  '春天到了 — テキストレイアウト革命',
  'prepare() → layout() → render',
  'بدأت الرحلة · Начало пути · 시작',
  'No DOM. No reflow. Pure math.',
  'Canvas · SVG · WebGL · anywhere',
  'CJK · Bidi · Emoji · Graphemes',
  '0.0002ms per layout call',
]
const tunnelFont = '13px "Courier New",monospace'
const TUNNEL_RINGS = 18
const TUNNEL_DEPTH = 1200

type TunnelRing = {
  z: number              // depth (0=near, TUNNEL_DEPTH=far)
  text: string           // the text line
  measuredWidth: number  // pretext-measured width
  side: number           // 0=top, 1=right, 2=bottom, 3=left
}

let tunnelRings: TunnelRing[] = []

function buildTunnel() {
  tunnelRings = []
  // Measure all tunnel texts with Pretext
  const widths: number[] = []
  for (const t of tunnelTexts) {
    try {
      const p = prepareWithSegments(t, tunnelFont)
      const { lines } = layoutWithLines(p, 9999, 18)
      widths.push(lines.length > 0 ? lines[0].width : 200)
    } catch { widths.push(200) }
  }

  for (let i = 0; i < TUNNEL_RINGS; i++) {
    const ti = i % tunnelTexts.length
    tunnelRings.push({
      z: (i / TUNNEL_RINGS) * TUNNEL_DEPTH,
      text: tunnelTexts[ti],
      measuredWidth: widths[ti],
      side: i % 4,
    })
  }
}
buildTunnel()

function drawTunnel(time: number) {
  const cx = W * 0.5, cy = H * 0.5
  const fov = 400

  ctx.save()
  ctx.font = tunnelFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const ring of tunnelRings) {
    // Advance ring toward camera
    ring.z -= 40 * (1 / 60) // ~40 units/sec
    if (ring.z < 10) {
      ring.z += TUNNEL_DEPTH
      ring.side = (ring.side + 1) % 4
      const ti = Math.random() * tunnelTexts.length | 0
      ring.text = tunnelTexts[ti]
    }

    const scale = fov / (fov + ring.z)
    const alpha = Math.max(0, Math.min(0.06, 0.08 * scale - 0.01))
    if (alpha < 0.003) continue

    // Position on the tunnel walls
    const spread = 350 * scale
    let x: number, y: number, rotation: number
    switch (ring.side) {
      case 0: x = cx; y = cy - spread; rotation = 0; break       // top
      case 1: x = cx + spread; y = cy; rotation = Math.PI / 2; break   // right
      case 2: x = cx; y = cy + spread; rotation = 0; break       // bottom
      case 3: x = cx - spread; y = cy; rotation = -Math.PI / 2; break  // left
      default: x = cx; y = cy - spread; rotation = 0
    }

    const fontSize = Math.max(4, 13 * scale)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)
    ctx.scale(scale, scale)
    ctx.globalAlpha = alpha
    ctx.font = `${fontSize / scale}px "Courier New",monospace`
    ctx.fillStyle = '#ff8844'
    ctx.fillText(ring.text, 0, 0)
    ctx.restore()
  }

  // Subtle vanishing point glow
  ctx.save()
  ctx.globalAlpha = 0.025
  ctx.fillStyle = '#ff6600'
  ctx.beginPath()
  ctx.arc(cx, cy, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.restore()
}

// ─── 3D Floating Text Cards ─────────────────────────────────
// Pretext-measured text blocks rotating in pseudo-3D

type FloatingCard = {
  x: number; y: number
  rotY: number      // Y-axis rotation (creates perspective skew)
  rotSpeed: number
  text: string
  font: string
  lines: { text: string; width: number }[]
  lineHeight: number
  maxWidth: number
  phase: number
  driftX: number; driftY: number
}

const floatingCards: FloatingCard[] = []
const cardTexts = [
  { text: 'prepare()', font: '18px "Courier New",monospace', maxW: 200, lh: 24 },
  { text: 'layout()', font: '18px "Courier New",monospace', maxW: 200, lh: 24 },
  { text: '0.0002ms', font: '22px "Courier New",monospace', maxW: 200, lh: 28 },
  { text: '120 fps', font: '20px "Courier New",monospace', maxW: 200, lh: 26 },
  { text: '龍 DRAGON', font: '20px "Courier New",monospace', maxW: 200, lh: 26 },
  { text: 'npm install\n@chenglou/pretext', font: '11px "Courier New",monospace', maxW: 200, lh: 15 },
]

function buildFloatingCards() {
  floatingCards.length = 0
  for (let i = 0; i < cardTexts.length; i++) {
    const ct = cardTexts[i]
    let measuredLines: { text: string; width: number }[] = []
    try {
      const p = prepareWithSegments(ct.text, ct.font, { whiteSpace: 'pre-wrap' })
      const { lines } = layoutWithLines(p, ct.maxW, ct.lh)
      measuredLines = lines.map(l => ({ text: l.text, width: l.width }))
    } catch {
      measuredLines = [{ text: ct.text, width: ct.maxW }]
    }

    // Place around the edges of the screen
    const angle = (i / cardTexts.length) * Math.PI * 2
    const rx = W * 0.38, ry = H * 0.35
    floatingCards.push({
      x: W / 2 + Math.cos(angle) * rx,
      y: H / 2 + Math.sin(angle) * ry,
      rotY: Math.random() * Math.PI * 2,
      rotSpeed: 0.3 + Math.random() * 0.5,
      text: ct.text,
      font: ct.font,
      lines: measuredLines,
      lineHeight: ct.lh,
      maxWidth: ct.maxW,
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.3,
      driftY: (Math.random() - 0.5) * 0.2,
    })
  }
}
buildFloatingCards()

function drawFloatingCards(time: number) {
  for (const card of floatingCards) {
    // Slow orbit drift
    card.x += card.driftX
    card.y += card.driftY
    if (card.x < -100) card.x = W + 80
    if (card.x > W + 100) card.x = -80
    if (card.y < -100) card.y = H + 80
    if (card.y > H + 100) card.y = -80

    card.rotY += card.rotSpeed * (1 / 60)

    // Faux 3D: use cos of rotation for horizontal scale (creates card flip)
    const cosR = Math.cos(card.rotY)
    const scaleX = cosR  // -1 to 1, creates flip effect
    const absScale = Math.abs(cosR)
    if (absScale < 0.1) continue // edge-on, skip

    // Depth-based alpha
    const depthAlpha = 0.03 + absScale * 0.04

    ctx.save()
    ctx.translate(card.x, card.y + Math.sin(time * 0.8 + card.phase) * 10)
    ctx.scale(scaleX, 1)
    ctx.globalAlpha = depthAlpha
    ctx.font = card.font
    ctx.fillStyle = '#ff9966'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const totalH = card.lines.length * card.lineHeight
    const startY = -totalH / 2

    for (let li = 0; li < card.lines.length; li++) {
      ctx.fillText(card.lines[li].text, 0, startY + li * card.lineHeight)
    }

    ctx.restore()
  }
}

// ─── Enemies ────────────────────────────────────────────────

type Enemy = {
  x: number; y: number
  vx: number; vy: number
  hp: number; maxHp: number
  char: string; size: number; color: string
  phase: number
  dying: boolean; deathTimer: number
  kind: 'grunt' | 'tank' | 'fast' | 'ghost'
}

const enemies: Enemy[] = []
let score = 0
let scoreFlash = 0 // brief flash when scoring

const ENEMY_KINDS: { char: string; color: string; hp: number; size: number; speed: number; kind: Enemy['kind'] }[] = [
  { char: '◈', color: '#ff4466', hp: 1, size: 22, speed: 1.0, kind: 'grunt' },
  { char: '◆', color: '#ff4466', hp: 1, size: 18, speed: 1.0, kind: 'grunt' },
  { char: '⬢', color: '#ff6688', hp: 3, size: 28, speed: 0.5, kind: 'tank' },
  { char: '◇', color: '#44ddff', hp: 1, size: 16, speed: 2.2, kind: 'fast' },
  { char: '⊕', color: '#44ddff', hp: 1, size: 14, speed: 2.5, kind: 'fast' },
  { char: '◌', color: '#aa88ff', hp: 2, size: 20, speed: 0.8, kind: 'ghost' },
]

function spawnEnemy() {
  const kind = ENEMY_KINDS[Math.random() * ENEMY_KINDS.length | 0]
  // Spawn from edges
  const edge = Math.random() * 4 | 0
  let x: number, y: number
  if (edge === 0) { x = -30; y = Math.random() * H }
  else if (edge === 1) { x = W + 30; y = Math.random() * H }
  else if (edge === 2) { x = Math.random() * W; y = -30 }
  else { x = Math.random() * W; y = H + 30 }

  enemies.push({
    x, y,
    vx: (Math.random() - 0.5) * kind.speed * 2,
    vy: (Math.random() - 0.5) * kind.speed * 2,
    hp: kind.hp, maxHp: kind.hp,
    char: kind.char, size: kind.size, color: kind.color,
    phase: Math.random() * Math.PI * 2,
    dying: false, deathTimer: 0,
    kind: kind.kind,
  })
}

function updateEnemies(dt: number, time: number) {
  if (!cfg.showEnemies) return

  // Maintain enemy count
  while (enemies.filter(e => !e.dying).length < cfg.enemyCount) spawnEnemy()

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]

    if (e.dying) {
      e.deathTimer -= dt
      // Explode outward
      e.x += e.vx; e.y += e.vy
      e.vx *= 0.95; e.vy *= 0.95
      if (e.deathTimer <= 0) {
        enemies[i] = enemies[enemies.length - 1]; enemies.pop()
      }
      continue
    }

    // Movement patterns by kind
    const spd = cfg.enemySpeed
    if (e.kind === 'ghost') {
      // Ghosts drift in sine waves
      e.x += Math.sin(time * 1.5 + e.phase) * spd * 1.2
      e.y += Math.cos(time * 1.2 + e.phase * 1.3) * spd * 0.8
    } else if (e.kind === 'fast') {
      // Fast enemies dart around, occasionally change direction
      e.x += e.vx * spd; e.y += e.vy * spd
      if (Math.random() < dt * 0.5) {
        e.vx += (Math.random() - 0.5) * 3
        e.vy += (Math.random() - 0.5) * 3
      }
      e.vx *= 0.99; e.vy *= 0.99
    } else {
      // Grunts and tanks drift slowly, gently attracted to center
      e.vx += (W / 2 - e.x) * 0.0001 + (Math.random() - 0.5) * 0.1
      e.vy += (H / 2 - e.y) * 0.0001 + (Math.random() - 0.5) * 0.1
      e.vx *= 0.995; e.vy *= 0.995
      e.x += e.vx * spd; e.y += e.vy * spd
    }

    // Keep on screen (wrap around)
    if (e.x < -50) e.x = W + 40
    if (e.x > W + 50) e.x = -40
    if (e.y < -50) e.y = H + 40
    if (e.y > H + 50) e.y = -40

    // Flee from dragon head (enemies aren't suicidal)
    const head = chain[0]
    const dx = e.x - head.x, dy = e.y - head.y
    const dSq = dx * dx + dy * dy
    if (dSq < 15000) { // within ~120px
      const d = Math.sqrt(dSq) || 1
      const flee = 1.5 * (1 - d / 122)
      e.vx += (dx / d) * flee
      e.vy += (dy / d) * flee
    }
  }

  // Score flash decay
  if (scoreFlash > 0) scoreFlash -= dt * 3
}

function hitEnemiesWithFire(x: number, y: number) {
  if (!cfg.showEnemies) return
  for (const e of enemies) {
    if (e.dying) continue
    const dx = e.x - x, dy = e.y - y
    const dSq = dx * dx + dy * dy
    const hitRadius = cfg.fireRadius * 0.6
    if (dSq < hitRadius * hitRadius) {
      const d = Math.sqrt(dSq) || 1
      e.hp--
      // Knockback
      e.vx += (dx / d) * 5
      e.vy += (dy / d) * 5
      if (e.hp <= 0) {
        e.dying = true
        e.deathTimer = 0.5
        // Burst velocity
        e.vx = (dx / d) * 8
        e.vy = (dy / d) * 8 - 3
        // Score
        const points = e.kind === 'tank' ? 30 : e.kind === 'fast' ? 20 : e.kind === 'ghost' ? 25 : 10
        score += points
        scoreFlash = 1
        // Spawn embers at death
        spawnEmbers(e.x, e.y, 5)
      }
    }
  }
}

function drawEnemies(time: number) {
  if (!cfg.showEnemies) return

  for (const e of enemies) {
    ctx.save()

    if (e.dying) {
      // Death animation: scale down, spin, fade
      const t = e.deathTimer / 0.5
      ctx.translate(e.x, e.y)
      ctx.rotate(time * 15)
      ctx.scale(t, t)
      ctx.globalAlpha = t * 0.8
      ctx.font = `${e.size}px "Courier New",monospace`
      ctx.fillStyle = '#ffaa00'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(e.char, 0, 0)
    } else {
      // Alive: bob and pulse
      const bob = Math.sin(time * 2.5 + e.phase) * 4
      const pulse = 1 + Math.sin(time * 4 + e.phase) * 0.08
      const hpRatio = e.hp / e.maxHp

      ctx.translate(e.x, e.y + bob)
      ctx.scale(pulse, pulse)

      // Glow when damaged
      if (hpRatio < 1) {
        ctx.globalAlpha = 0.15
        ctx.fillStyle = '#ff4400'
        ctx.beginPath(); ctx.arc(0, 0, e.size * 0.8, 0, Math.PI * 2); ctx.fill()
      }

      ctx.globalAlpha = e.kind === 'ghost' ? 0.4 + Math.sin(time * 3 + e.phase) * 0.2 : 0.75
      ctx.font = `${e.size}px "Courier New",monospace`
      ctx.fillStyle = e.color
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(e.char, 0, 0)

      // HP pips for tanks
      if (e.maxHp > 1 && e.hp > 0) {
        ctx.globalAlpha = 0.5
        ctx.font = '8px "Courier New",monospace'
        ctx.fillStyle = '#ff6688'
        const pips = '●'.repeat(e.hp) + '○'.repeat(e.maxHp - e.hp)
        ctx.fillText(pips, 0, e.size * 0.7)
      }
    }

    ctx.restore()
  }

  // Score display
  if (score > 0) {
    ctx.save()
    ctx.globalAlpha = 0.3 + scoreFlash * 0.4
    ctx.font = '600 14px Inter,system-ui,sans-serif'
    ctx.fillStyle = scoreFlash > 0 ? '#ffaa33' : '#666'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(`SCORE ${score}`, 20, 20)
    ctx.restore()
  }
}

// ─── Runes ──────────────────────────────────────────────────

type Rune = { x: number; y: number; char: string; speed: number; phase: number; size: number; opacity: number }
const runes: Rune[] = []
const runeChars = '龍火竜鱗焔ᚱᚦᛏᛟ◈◇⬡'.split('')
for (let i = 0; i < 12; i++) {
  runes.push({ x: Math.random() * W, y: Math.random() * H,
    char: runeChars[Math.random() * runeChars.length | 0],
    speed: 0.1 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2,
    size: 14 + Math.random() * 14, opacity: 0.02 + Math.random() * 0.04,
  })
}
function drawRunes(time: number) {
  if (!cfg.showRunes) return
  for (const r of runes) {
    r.y -= r.speed
    if (r.y < -30) { r.y = H + 30; r.x = Math.random() * W }
    ctx.save()
    ctx.globalAlpha = r.opacity * (0.5 + Math.sin(time * 0.4 + r.phase) * 0.5)
    ctx.font = `${r.size}px "Courier New",monospace`; ctx.fillStyle = '#ff6600'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(r.char, r.x + Math.sin(time * 0.7 + r.phase) * 12, r.y)
    ctx.restore()
  }
}

// ─── Draw dragon ────────────────────────────────────────────

function drawDragon(time: number) {
  const n = chain.length
  for (let i = n - 1; i >= 0; i--) {
    const seg = chain[i], sc = segScale(i), color = segColor(i, time)
    const ci = Math.min(i, dragonChars.length - 1), size = 14 * sc
    let angle = i === 0
      ? Math.atan2(mouse.y - seg.y, mouse.x - seg.x)
      : Math.atan2(chain[i - 1].y - seg.y, chain[i - 1].x - seg.x)

    // Head glow
    if (i < 4) {
      ctx.save(); ctx.globalAlpha = 0.06 * (isBreathingFire ? 2 : 1)
      ctx.fillStyle = '#ff6600'; ctx.beginPath()
      ctx.arc(seg.x, seg.y, size * 1.1, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    }

    // Spines
    if (cfg.showSpines && i >= 4 && i <= 30 && i % 3 === 0) {
      const sa = angle + Math.PI / 2
      ctx.save(); ctx.globalAlpha = 0.35
      ctx.font = `${size * (0.6 + Math.sin(time * 3 + i) * 0.15)}px "Courier New",monospace`
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('▴', seg.x + Math.cos(sa) * size * 0.35, seg.y + Math.sin(sa) * size * 0.35)
      ctx.restore()
    }

    // Wings
    if (cfg.showWings && i >= 7 && i <= 16 && i % 2 === 0) {
      const wp = Math.sin(time * 3.5 + i * 0.4) * 0.5
      const ws = size * (1.8 - Math.abs(i - 11.5) * 0.12), wd = size * 1.4
      const w1 = angle + Math.PI / 2 + wp, w2 = angle - Math.PI / 2 - wp
      ctx.save(); ctx.globalAlpha = 0.4
      ctx.font = `${ws}px "Courier New",monospace`; ctx.fillStyle = color
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('≺', seg.x + Math.cos(w1) * wd, seg.y + Math.sin(w1) * wd)
      ctx.fillText('≻', seg.x + Math.cos(w2) * wd, seg.y + Math.sin(w2) * wd)
      if (i >= 9 && i <= 14) {
        ctx.font = `${ws * 0.7}px "Courier New",monospace`; ctx.globalAlpha = 0.2
        ctx.fillText('‹', seg.x + Math.cos(w1) * wd * 1.7, seg.y + Math.sin(w1) * wd * 1.7)
        ctx.fillText('›', seg.x + Math.cos(w2) * wd * 1.7, seg.y + Math.sin(w2) * wd * 1.7)
      }
      ctx.restore()
    }

    // Body
    ctx.save(); ctx.translate(seg.x, seg.y); ctx.rotate(angle)
    ctx.font = `bold ${size}px "Courier New",monospace`; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const wb = Math.sin(time * 5 + i * 0.35) * 1.5
    ctx.fillText(dragonChars[ci], 0, wb)
    if (isBreathingFire && i < 3) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffcc00'; ctx.fillText(dragonChars[ci], 0, wb) }
    ctx.restore()
  }

  // Eyes
  const head = chain[0], ha = Math.atan2(mouse.y - head.y, mouse.x - head.x)
  const ex = head.x + Math.cos(ha + 0.5) * 10, ey = head.y + Math.sin(ha + 0.5) * 10
  ctx.save(); ctx.globalAlpha = isBreathingFire ? 0.2 : 0.1; ctx.fillStyle = '#ff8800'
  ctx.beginPath(); ctx.arc(ex, ey, isBreathingFire ? 18 : 12, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  ctx.fillStyle = isBreathingFire ? '#fff' : '#ffcc00'
  ctx.font = '16px "Courier New"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(time % 5 > 4.7 ? '—' : isBreathingFire ? '◉' : '⊙', ex, ey)
  const ex2 = head.x + Math.cos(ha - 0.5) * 10, ey2 = head.y + Math.sin(ha - 0.5) * 10
  ctx.fillStyle = isBreathingFire ? '#ffee88' : '#ffbb33'; ctx.font = '12px "Courier New"'
  ctx.fillText(time % 5 > 4.7 ? '—' : '·', ex2, ey2)
}

// ─── Cursor ─────────────────────────────────────────────────

function drawCursor(time: number) {
  if (!cfg.showCursor) return
  const mx = mouse.x, my = mouse.y

  // Outer ring — slow rotation
  ctx.save()
  ctx.translate(mx, my); ctx.rotate(time * 0.4)
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 0.5); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI, Math.PI * 1.5); ctx.stroke()
  ctx.restore()

  // Inner dot
  ctx.save()
  ctx.globalAlpha = isBreathingFire ? 0.8 : 0.5
  ctx.fillStyle = isBreathingFire ? '#ffaa33' : '#ff8844'
  ctx.beginPath(); ctx.arc(mx, my, isBreathingFire ? 3 : 2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // Crosshair lines
  ctx.save()
  ctx.globalAlpha = 0.15; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my)
  ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my)
  ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8)
  ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24)
  ctx.stroke()
  ctx.restore()
}

// ─── UI Panel binding ───────────────────────────────────────

const panel = document.getElementById('panel')!
const toggle = document.getElementById('panel-toggle')!
const closeBtn = document.getElementById('panel-close')!
const presetsEl = document.getElementById('presets')!
const statsEl = document.getElementById('stats')!

let panelOpen = false
function setPanelOpen(open: boolean) {
  panelOpen = open
  panel.classList.toggle('open', open)
  toggle.style.display = open ? 'none' : 'flex'
  document.body.style.cursor = open ? 'default' : 'none'
}

toggle.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(true) })
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(false) })
addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') { if (!(e.target as HTMLElement).closest('input,textarea')) setPanelOpen(!panelOpen) }
  if (e.key === 'Escape' && panelOpen) setPanelOpen(false)
})

// Prevent fire when interacting with panel
panel.addEventListener('mousedown', (e) => e.stopPropagation())
panel.addEventListener('touchstart', (e) => e.stopPropagation())

// Build preset buttons
for (const name of Object.keys(PRESETS)) {
  const btn = document.createElement('button')
  btn.className = 'preset-btn'
  btn.textContent = name
  btn.addEventListener('click', () => {
    applyPreset(name)
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
  presetsEl.appendChild(btn)
}

// Bind range inputs
function syncUI() {
  panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
    const key = input.dataset.key as keyof typeof cfg
    if (input.type === 'checkbox') {
      input.checked = cfg[key] as boolean
    } else {
      input.value = String(cfg[key])
    }
    const valEl = panel.querySelector(`[data-val="${key}"]`)
    if (valEl) valEl.textContent = String(cfg[key])
  })
}

panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
  const key = input.dataset.key as keyof typeof cfg

  const handler = () => {
    if (input.type === 'checkbox') {
      (cfg as any)[key] = input.checked
    } else {
      (cfg as any)[key] = parseFloat(input.value)
    }
    const valEl = panel.querySelector(`[data-val="${key}"]`)
    if (valEl) valEl.textContent = input.type === 'checkbox' ? String(input.checked) : parseFloat(input.value).toFixed(input.step?.includes('.') ? 3 : 0)

    // Rebuild dragon if segment count changed
    if (key === 'dragonSegments') rebuildDragon()

    // Clear active preset
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
  }

  input.addEventListener('input', handler)
  input.addEventListener('change', handler)
})

syncUI()

// ─── Main loop ──────────────────────────────────────────────

let lastTime = performance.now(), time = 0, frameCount = 0, fpsTime = 0, fps = 0

initialized = true
layoutAllText()
document.fonts.ready.then(layoutAllText)

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now; time += dt

  // FPS counter
  frameCount++; fpsTime += dt
  if (fpsTime >= 0.5) { fps = Math.round(frameCount / fpsTime); frameCount = 0; fpsTime = 0 }
  statsEl.textContent = `${fps} fps · ${letters.length} letters · ${particles.length + embers.length} particles`

  updateShake()
  ctx.save(); ctx.translate(shakeX, shakeY)
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(-10, -10, W + 20, H + 20)
  drawTunnel(time)

  drawRunes(time)
  drawFloatingCards(time)
  updateChain()
  interactLetters(dt)
  emitFire(dt)
  updateParticles(dt)

  updateEnemies(dt, time)

  drawLetters()
  drawEnemies(time)
  drawDragon(time)
  drawParticles(time)
  drawCursor(time)

  ctx.restore()

  const hint = document.getElementById('hint')
  if (hint && time > 6) hint.style.opacity = '0'

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
