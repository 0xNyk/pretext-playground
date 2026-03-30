import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

// ─── Config (mutated by UI panel) ───────────────────────────

export const cfg = {
  dragonSegments: 60,
  dragonSpeed: 0.18,
  dragonScale: 1.0,
  showWings: true,
  showSpines: true,
  pushForce: 6,
  springStrength: 0.015,
  damping: 0.93,
  burnGravity: 0.8,
  fireRadius: 120,
  fireForce: 25,
  screenShake: true,
  showEmbers: true,
  showParticles: true,
  showRunes: true,
  showCursor: true,
  textOpacity: 1.0,
  showEnemies: true,
  enemyCount: 8,
  enemySpeed: 0.6,
}

const PRESETS: Record<string, Partial<typeof cfg>> = {
  Default: {},
  Gentle: { dragonSpeed: 0.10, pushForce: 5, fireForce: 10, fireRadius: 60, screenShake: false, burnGravity: 0.2, springStrength: 0.03 },
  Chaos: { pushForce: 25, fireForce: 50, fireRadius: 200, burnGravity: 2.5, springStrength: 0.005, damping: 0.96, screenShake: true },
  Zen: { showParticles: false, showEmbers: false, screenShake: false, showRunes: false, pushForce: 4, fireForce: 8, springStrength: 0.04, burnGravity: 0 },
  Tiny: { dragonSegments: 20, dragonScale: 0.6, fireRadius: 50, pushForce: 6 },
  Leviathan: { dragonSegments: 80, dragonScale: 2.0, dragonSpeed: 0.08, pushForce: 20, fireRadius: 180 },
}
const DEFAULT_CFG = { ...cfg }

function applyPreset(name: string) {
  Object.assign(cfg, DEFAULT_CFG, PRESETS[name] || {})
  rebuildDragon()
  syncUI()
}

// ─── Canvas (cap DPR to limit memory) ───────────────────────

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
// Cap DPR at 2 to avoid 4x+ memory on high-res displays
const dpr = Math.min(window.devicePixelRatio || 1, 2)
const NAV_H = 44
let W = innerWidth, H = innerHeight - NAV_H

let initialized = false
function resize() {
  W = innerWidth; H = innerHeight - NAV_H
  canvas.width = W * dpr; canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (initialized) { layoutAllText(); buildTunnel() }
}
resize()
addEventListener('resize', resize)

// ─── Mouse ──────────────────────────────────────────────────

const mouse = { x: W / 2, y: H / 2 }
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY })
addEventListener('touchmove', (e) => { e.preventDefault(); mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY }, { passive: false })

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

// ─── Letters (SoA — struct-of-arrays for cache/memory efficiency) ─

// Instead of an array of objects, use parallel typed arrays.
// This eliminates per-letter object overhead and GC pressure.
const MAX_LETTERS = 2000
let letterCount = 0

// Per-letter data in typed arrays (no object allocation per letter)
const lHomeX = new Float32Array(MAX_LETTERS)
const lHomeY = new Float32Array(MAX_LETTERS)
const lX = new Float32Array(MAX_LETTERS)
const lY = new Float32Array(MAX_LETTERS)
const lVx = new Float32Array(MAX_LETTERS)
const lVy = new Float32Array(MAX_LETTERS)
const lAngle = new Float32Array(MAX_LETTERS)
const lAngVel = new Float32Array(MAX_LETTERS)
const lCharW = new Float32Array(MAX_LETTERS)
const lBaseAlpha = new Float32Array(MAX_LETTERS)
const lFontSize = new Float32Array(MAX_LETTERS)
const lBurnTimer = new Float32Array(MAX_LETTERS)
const lScaleMul = new Float32Array(MAX_LETTERS)
const lGravity = new Float32Array(MAX_LETTERS)

// These can't be typed arrays (strings) — but we intern them to avoid duplication
const lChar: string[] = []
const lFont: string[] = []     // index into fontPool
const lColor: string[] = []    // index into colorPool

// ─── Embers + Particles — pooled with fixed max ────────────

const MAX_EMBERS = 60
let emberCount = 0
const emX = new Float32Array(MAX_EMBERS)
const emY = new Float32Array(MAX_EMBERS)
const emVx = new Float32Array(MAX_EMBERS)
const emVy = new Float32Array(MAX_EMBERS)
const emLife = new Float32Array(MAX_EMBERS)
const emSize = new Float32Array(MAX_EMBERS)
const emChar: string[] = new Array(MAX_EMBERS)
const emColor: string[] = new Array(MAX_EMBERS)
const emberChars = ['·', '•', '∘', '˚']
const emberColors = ['#ff6600', '#ffaa00', '#ff4400']

function spawnEmber(x: number, y: number) {
  if (!cfg.showEmbers || emberCount >= MAX_EMBERS) return
  const i = emberCount++
  const a = Math.random() * Math.PI * 2
  emX[i] = x; emY[i] = y
  emVx[i] = Math.cos(a) * (1 + Math.random() * 3)
  emVy[i] = Math.sin(a) * (1 + Math.random() * 3) - 2
  emLife[i] = 0.3 + Math.random() * 0.6
  emSize[i] = 4 + Math.random() * 7
  emChar[i] = emberChars[Math.random() * 4 | 0]
  emColor[i] = emberColors[Math.random() * 3 | 0]
}

const MAX_PARTICLES = 150
let particleCount = 0
const pX = new Float32Array(MAX_PARTICLES)
const pY = new Float32Array(MAX_PARTICLES)
const pVx = new Float32Array(MAX_PARTICLES)
const pVy = new Float32Array(MAX_PARTICLES)
const pLife = new Float32Array(MAX_PARTICLES)
const pMaxLife = new Float32Array(MAX_PARTICLES)
const pSize = new Float32Array(MAX_PARTICLES)
const pChar: string[] = new Array(MAX_PARTICLES)
const fireChars = '*✦✧⁕❋✺◌•∘˚⋆·'.split('')

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
  letterCount = 0
  lChar.length = 0; lFont.length = 0; lColor.length = 0

  const mx = Math.max(50, W * 0.06), my = Math.max(60, H * 0.06)
  const cw = W - mx * 2
  const twoCol = cw > 700
  const col2X = twoCol ? mx + cw * 0.56 : mx

  for (const entry of textEntries) {
    const fontStr = `${entry.fontSize}px ${entry.font}`
    let baseX: number, maxW: number
    if (entry.column === 'right') { baseX = twoCol ? col2X : mx; maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.4 : cw) }
    else if (entry.column === 'center') { maxW = Math.min(entry.maxWidth, cw); baseX = mx + (cw - maxW) / 2 }
    else { baseX = mx; maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.5 : cw) }
    const baseY = my + entry.yOffset

    try {
      const prepared = prepareWithSegments(entry.text, fontStr, entry.style === 'code' ? { whiteSpace: 'pre-wrap' } : undefined)
      const { lines } = layoutWithLines(prepared, maxW, entry.lineHeight)
      for (let li = 0; li < lines.length; li++) {
        let xc = baseX
        const y = baseY + li * entry.lineHeight
        ctx.font = fontStr
        for (const char of lines[li].text) {
          if (char === '\n' || letterCount >= MAX_LETTERS) continue
          const cw2 = ctx.measureText(char).width
          const i = letterCount++
          lHomeX[i] = xc + cw2 / 2; lHomeY[i] = y + entry.lineHeight / 2
          lX[i] = lHomeX[i]; lY[i] = lHomeY[i]
          lVx[i] = 0; lVy[i] = 0; lAngle[i] = 0; lAngVel[i] = 0
          lCharW[i] = cw2; lBaseAlpha[i] = entry.alpha
          lFontSize[i] = entry.fontSize; lBurnTimer[i] = 0
          lScaleMul[i] = 1; lGravity[i] = 0
          lChar[i] = char; lFont[i] = fontStr; lColor[i] = entry.color
          xc += cw2
        }
      }
    } catch { /* skip */ }
  }
}

// ─── Dragon chain ───────────────────────────────────────────

const SEG_SPACING = 10
// SoA for chain too
let chainN = 0
let chX = new Float32Array(80), chY = new Float32Array(80)
let chPx = new Float32Array(80), chPy = new Float32Array(80)

function rebuildDragon() {
  chainN = cfg.dragonSegments
  if (chX.length < chainN) {
    chX = new Float32Array(chainN); chY = new Float32Array(chainN)
    chPx = new Float32Array(chainN); chPy = new Float32Array(chainN)
  }
  for (let i = 0; i < chainN; i++) {
    chX[i] = W / 2; chY[i] = H / 2 + i * SEG_SPACING
    chPx[i] = chX[i]; chPy[i] = chY[i]
  }
}
rebuildDragon()

const dragonChars = '◆◆◇▼█▓▓▒╬╬╬╬╬╬╬╬╬╬╫╫╫╪╪╪╧╧╤╤╥╥║║││┃┃╎╎╏╏::····..'.split('')

function segScale(i: number): number {
  if (i < 3) return (2.5 - i * 0.15) * cfg.dragonScale
  const t = (i - 3) / (chainN - 3)
  return (2.0 * (1 - t * t) + 0.2) * cfg.dragonScale
}

function updateChain() {
  for (let i = 0; i < chainN; i++) { chPx[i] = chX[i]; chPy[i] = chY[i] }
  chX[0] += (mouse.x - chX[0]) * cfg.dragonSpeed
  chY[0] += (mouse.y - chY[0]) * cfg.dragonSpeed
  for (let i = 1; i < chainN; i++) {
    const dx = chX[i] - chX[i - 1], dy = chY[i] - chY[i - 1]
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > SEG_SPACING) { const r = SEG_SPACING / d; chX[i] = chX[i - 1] + dx * r; chY[i] = chY[i - 1] + dy * r }
  }
}

// ─── Physics — operates on SoA arrays ───────────────────────

function interactLetters(dt: number) {
  const checkSegs = Math.min(Math.round(chainN * 0.4), chainN)
  const damp = cfg.damping, spring = cfg.springStrength, push = cfg.pushForce, bGrav = cfg.burnGravity

  for (let li = 0; li < letterCount; li++) {
    let vx = lVx[li], vy = lVy[li], av = lAngVel[li]
    const x = lX[li], y = lY[li], cw = lCharW[li]

    // Dragon body collision
    for (let si = 0; si < checkSegs; si++) {
      const sc = segScale(si)
      const rad = 14 * sc * 0.45
      const dx = x - chX[si], dy = y - chY[si]
      const dSq = dx * dx + dy * dy
      const minD = rad + cw * 0.4 + 4
      if (dSq < minD * minD && dSq > 0.01) {
        const d = Math.sqrt(dSq)
        const f = push * ((minD - d) / minD) * sc
        const nx = dx / d, ny = dy / d
        vx += nx * f + (chX[si] - chPx[si]) * 0.4
        vy += ny * f + (chY[si] - chPy[si]) * 0.4
        av += (nx * 0.3 - ny * 0.2) * f * 0.12
      }
    }

    // Wake (every 5th segment)
    for (let si = 5; si < chainN; si += 5) {
      const dx = x - chX[si], dy = y - chY[si]
      const dSq = dx * dx + dy * dy
      if (dSq < 1600 && dSq > 100) {
        const w = (1 - Math.sqrt(dSq) / 40) * 0.12
        vx += (chX[si] - chPx[si]) * w
        vy += (chY[si] - chPy[si]) * w
      }
    }

    // Burn
    if (lBurnTimer[li] > 0) {
      lBurnTimer[li] -= dt
      lScaleMul[li] = 1 + lBurnTimer[li] * 0.4
      lGravity[li] = bGrav
      if (Math.random() < dt * 2) spawnEmber(x, y)
      if (lBurnTimer[li] <= 0) { lBurnTimer[li] = 0; lScaleMul[li] = 1; lGravity[li] = 0 }
    }

    // Spring home
    const hdx = lHomeX[li] - x, hdy = lHomeY[li] - y
    const hd = Math.sqrt(hdx * hdx + hdy * hdy)
    if (hd > 0.5) {
      const sf = spring * (1 + hd * 0.001)
      vx += hdx * sf; vy += hdy * sf
      av -= lAngle[li] * 0.05
    } else { lAngle[li] *= 0.9 }

    vy += lGravity[li]
    lVx[li] = vx * damp; lVy[li] = vy * damp
    lAngVel[li] = av * 0.91
    lX[li] = x + lVx[li]; lY[li] = y + lVy[li]
    lAngle[li] += lAngVel[li]
  }
}

function fireBlastAt(bx: number, by: number, dx: number, dy: number) {
  let hits = 0
  const rSq = cfg.fireRadius * cfg.fireRadius, ff = cfg.fireForce, fr = cfg.fireRadius
  for (let li = 0; li < letterCount; li++) {
    const ldx = lX[li] - bx, ldy = lY[li] - by
    const dSq = ldx * ldx + ldy * ldy
    if (dSq < rSq && dSq > 0.01) {
      const d = Math.sqrt(dSq), f = ff * ((1 - d / fr) ** 2)
      lVx[li] += (ldx / d * 0.4 + dx * 0.6) * f
      lVy[li] += (ldy / d * 0.4 + dy * 0.6) * f - f * 0.2
      lAngVel[li] += (Math.random() - 0.5) * f * 0.3
      lBurnTimer[li] = Math.max(lBurnTimer[li], 0.5 + Math.random() * 1.2)
      hits++
    }
  }
  if (hits > 3) { triggerShake(Math.min(hits * 0.4, 6)); for (let i = 0; i < Math.min(hits, 4); i++) spawnEmber(bx, by) }
}

// ─── Draw letters — minimal ctx state changes ───────────────

function drawLetters() {
  const opMul = cfg.textOpacity
  let prevFont = ''

  for (let i = 0; i < letterCount; i++) {
    const burning = lBurnTimer[i] > 0
    let alpha = lBaseAlpha[i] * opMul
    let color = lColor[i]

    if (burning) {
      const h = Math.min(1, lBurnTimer[i])
      color = `rgb(255,${80 + h * 175 | 0},${h * 60 | 0})`
      alpha = Math.min(1, alpha + 0.5)
    }

    const font = lFont[i]
    if (font !== prevFont) { ctx.font = font; prevFont = font }

    ctx.save()
    ctx.translate(lX[i], lY[i])
    if (lAngle[i] !== 0) ctx.rotate(lAngle[i])
    const sm = lScaleMul[i]
    if (sm !== 1) ctx.scale(sm, sm)
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(lChar[i], 0, 0)
    if (burning && lBurnTimer[i] > 0.3) {
      ctx.globalAlpha = lBurnTimer[i] * 0.2
      ctx.fillStyle = '#ffaa00'
      ctx.fillText(lChar[i], 0, 0)
    }
    ctx.restore()
  }
}

// ─── Fire emission + particle update ────────────────────────

let isBreathingFire = false, fireAccum = 0, totalFireTime = 0

addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('mouseup', () => { isBreathingFire = false })
addEventListener('touchstart', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('touchend', () => { isBreathingFire = false })

function emitFire(dt: number) {
  if (!isBreathingFire) { totalFireTime = 0; return }
  fireAccum += dt; totalFireTime += dt
  const hx = chX[0], hy = chY[0]
  const ni = Math.min(3, chainN - 1)
  const fdx = hx - chX[ni], fdy = hy - chY[ni]
  const len = Math.sqrt(fdx * fdx + fdy * fdy) || 1
  const dx = fdx / len, dy = fdy / len, angle = Math.atan2(fdy, fdx)

  if (cfg.showParticles) {
    while (fireAccum > 0.025) {
      fireAccum -= 0.025
      if (particleCount >= MAX_PARTICLES) break
      for (let j = 0; j < 2; j++) {
        if (particleCount >= MAX_PARTICLES) break
        const i = particleCount++
        const sp = (Math.random() - 0.5), spd = 5 + Math.random() * 7
        pX[i] = hx + dx * 15; pY[i] = hy + dy * 15
        pVx[i] = Math.cos(angle + sp) * spd; pVy[i] = Math.sin(angle + sp) * spd - Math.random()
        pLife[i] = 1; pMaxLife[i] = 0.3 + Math.random() * 0.4
        pSize[i] = 6 + Math.random() * 12
        pChar[i] = fireChars[Math.random() * fireChars.length | 0]
      }
    }
  } else { fireAccum = 0 }

  const bx = hx + dx * 50, by = hy + dy * 50
  fireBlastAt(bx, by, dx, dy)
  hitEnemiesWithFire(bx, by)
  triggerShake(Math.min(1 + totalFireTime * 0.2, 3))
}

function updateParticlesAndEmbers(dt: number) {
  // Particles — swap-remove
  for (let i = particleCount - 1; i >= 0; i--) {
    pX[i] += pVx[i]; pY[i] += pVy[i]; pVy[i] -= 0.25; pVx[i] *= 0.97
    pLife[i] -= dt / pMaxLife[i]
    if (pLife[i] <= 0) {
      particleCount--
      pX[i] = pX[particleCount]; pY[i] = pY[particleCount]
      pVx[i] = pVx[particleCount]; pVy[i] = pVy[particleCount]
      pLife[i] = pLife[particleCount]; pMaxLife[i] = pMaxLife[particleCount]
      pSize[i] = pSize[particleCount]; pChar[i] = pChar[particleCount]
    }
  }
  // Embers — swap-remove
  for (let i = emberCount - 1; i >= 0; i--) {
    emX[i] += emVx[i]; emY[i] += emVy[i]; emVy[i] += 0.15; emVx[i] *= 0.97
    emLife[i] -= dt
    if (emLife[i] <= 0) {
      emberCount--
      emX[i] = emX[emberCount]; emY[i] = emY[emberCount]
      emVx[i] = emVx[emberCount]; emVy[i] = emVy[emberCount]
      emLife[i] = emLife[emberCount]; emSize[i] = emSize[emberCount]
      emChar[i] = emChar[emberCount]; emColor[i] = emColor[emberCount]
    }
  }
}

function drawParticles(time: number) {
  if (cfg.showEmbers) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < emberCount; i++) {
      ctx.globalAlpha = Math.min(1, emLife[i] * 2)
      ctx.font = `${emSize[i]}px "Courier New",monospace`
      ctx.fillStyle = emColor[i]
      ctx.fillText(emChar[i], emX[i], emY[i])
    }
  }
  if (cfg.showParticles) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < particleCount; i++) {
      const t = 1 - pLife[i]
      let r: number, g: number, b: number
      if (t < 0.15) { r = 255; g = 255; b = 255 * (1 - t * 6.67) | 0 }
      else if (t < 0.4) { r = 255; g = 255 * (1 - (t - 0.15) * 3.2) | 0; b = 0 }
      else { const f = (t - 0.4) * 1.67; r = 255 * (1 - f * 0.6) | 0; g = 80 * (1 - f) | 0; b = 0 }
      const sz = pSize[i] * (0.4 + pLife[i] * 0.6)
      ctx.globalAlpha = pLife[i] * 0.85
      ctx.font = `${sz}px "Courier New",monospace`
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillText(pChar[i], pX[i], pY[i])
    }
  }
  ctx.globalAlpha = 1
}

// ─── 3D Text Tunnel (simplified — fewer rings) ──────────────

const tunnelTexts = [
  'PRETEXT — pure text measurement',
  '春天到了 — テキストレイアウト革命',
  'prepare() → layout() → render',
  'بدأت الرحلة · Начало пути · 시작',
  'No DOM. No reflow. Pure math.',
  'CJK · Bidi · Emoji · Graphemes',
]
const tunnelFont = '13px "Courier New",monospace'
const TUNNEL_RINGS = 12
const TUNNEL_DEPTH = 1200

const tunnelZ = new Float32Array(TUNNEL_RINGS)
const tunnelSide = new Uint8Array(TUNNEL_RINGS)
const tunnelTextIdx = new Uint8Array(TUNNEL_RINGS)

function buildTunnel() {
  for (let i = 0; i < TUNNEL_RINGS; i++) {
    tunnelZ[i] = (i / TUNNEL_RINGS) * TUNNEL_DEPTH
    tunnelSide[i] = i % 4
    tunnelTextIdx[i] = i % tunnelTexts.length
  }
}
buildTunnel()

function drawTunnel() {
  const cx = W * 0.5, cy = H * 0.5
  ctx.font = tunnelFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff8844'

  for (let i = 0; i < TUNNEL_RINGS; i++) {
    tunnelZ[i] -= 0.67
    if (tunnelZ[i] < 10) {
      tunnelZ[i] += TUNNEL_DEPTH
      tunnelSide[i] = (tunnelSide[i] + 1) % 4
      tunnelTextIdx[i] = Math.random() * tunnelTexts.length | 0
    }
    const scale = 400 / (400 + tunnelZ[i])
    const alpha = Math.max(0, Math.min(0.06, 0.08 * scale - 0.01))
    if (alpha < 0.003) continue
    const spread = 350 * scale
    let x: number, y: number
    const s = tunnelSide[i]
    if (s === 0) { x = cx; y = cy - spread }
    else if (s === 1) { x = cx + spread; y = cy }
    else if (s === 2) { x = cx; y = cy + spread }
    else { x = cx - spread; y = cy }
    ctx.globalAlpha = alpha
    ctx.fillText(tunnelTexts[tunnelTextIdx[i]], x, y)
  }
  ctx.globalAlpha = 1
}

// ─── Enemies (reduced to simple arrays, fewer allocations) ──

type Enemy = {
  x: number; y: number; vx: number; vy: number
  hp: number; maxHp: number; char: string; size: number; color: string
  phase: number; dying: boolean; deathTimer: number; kind: number // 0=grunt,1=tank,2=fast,3=ghost
}

const enemies: Enemy[] = []
let score = 0, scoreFlash = 0

const EK = [
  { char: '◈', color: '#ff4466', hp: 1, size: 22, speed: 1.0 },
  { char: '⬢', color: '#ff6688', hp: 3, size: 28, speed: 0.5 },
  { char: '◇', color: '#44ddff', hp: 1, size: 16, speed: 2.2 },
  { char: '◌', color: '#aa88ff', hp: 2, size: 20, speed: 0.8 },
]

function spawnEnemy() {
  const k = EK[Math.random() * EK.length | 0], ki = EK.indexOf(k)
  const edge = Math.random() * 4 | 0
  let x = 0, y = 0
  if (edge === 0) { x = -30; y = Math.random() * H }
  else if (edge === 1) { x = W + 30; y = Math.random() * H }
  else if (edge === 2) { x = Math.random() * W; y = -30 }
  else { x = Math.random() * W; y = H + 30 }
  enemies.push({ x, y, vx: (Math.random() - 0.5) * k.speed * 2, vy: (Math.random() - 0.5) * k.speed * 2,
    hp: k.hp, maxHp: k.hp, char: k.char, size: k.size, color: k.color,
    phase: Math.random() * Math.PI * 2, dying: false, deathTimer: 0, kind: ki })
}

function updateEnemies(dt: number, time: number) {
  if (!cfg.showEnemies) return
  // Count alive
  let alive = 0
  for (let i = 0; i < enemies.length; i++) if (!enemies[i].dying) alive++
  while (alive < cfg.enemyCount) { spawnEnemy(); alive++ }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]
    if (e.dying) {
      e.deathTimer -= dt; e.x += e.vx; e.y += e.vy; e.vx *= 0.95; e.vy *= 0.95
      if (e.deathTimer <= 0) { enemies[i] = enemies[enemies.length - 1]; enemies.pop() }
      continue
    }
    const spd = cfg.enemySpeed
    if (e.kind === 3) { e.x += Math.sin(time * 1.5 + e.phase) * spd * 1.2; e.y += Math.cos(time * 1.2 + e.phase * 1.3) * spd * 0.8 }
    else if (e.kind === 2) { e.x += e.vx * spd; e.y += e.vy * spd; if (Math.random() < dt * 0.5) { e.vx += (Math.random() - 0.5) * 3; e.vy += (Math.random() - 0.5) * 3 }; e.vx *= 0.99; e.vy *= 0.99 }
    else { e.vx += (W / 2 - e.x) * 0.0001 + (Math.random() - 0.5) * 0.1; e.vy += (H / 2 - e.y) * 0.0001 + (Math.random() - 0.5) * 0.1; e.vx *= 0.995; e.vy *= 0.995; e.x += e.vx * spd; e.y += e.vy * spd }
    if (e.x < -50) e.x = W + 40; if (e.x > W + 50) e.x = -40
    if (e.y < -50) e.y = H + 40; if (e.y > H + 50) e.y = -40
    const dx = e.x - chX[0], dy = e.y - chY[0], dSq = dx * dx + dy * dy
    if (dSq < 15000) { const d = Math.sqrt(dSq) || 1; const fl = 1.5 * (1 - d / 122); e.vx += (dx / d) * fl; e.vy += (dy / d) * fl }
  }
  if (scoreFlash > 0) scoreFlash -= dt * 3
}

function hitEnemiesWithFire(fx: number, fy: number) {
  if (!cfg.showEnemies) return
  const hr = cfg.fireRadius * 0.6, hrSq = hr * hr
  for (const e of enemies) {
    if (e.dying) continue
    const dx = e.x - fx, dy = e.y - fy, dSq = dx * dx + dy * dy
    if (dSq < hrSq) {
      const d = Math.sqrt(dSq) || 1; e.hp--; e.vx += (dx / d) * 5; e.vy += (dy / d) * 5
      if (e.hp <= 0) {
        e.dying = true; e.deathTimer = 0.5; e.vx = (dx / d) * 8; e.vy = (dy / d) * 8 - 3
        score += e.kind === 1 ? 30 : e.kind === 2 ? 20 : e.kind === 3 ? 25 : 10
        scoreFlash = 1; for (let j = 0; j < 3; j++) spawnEmber(e.x, e.y)
      }
    }
  }
}

function drawEnemies(time: number) {
  if (!cfg.showEnemies) return
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (const e of enemies) {
    if (e.dying) {
      const t = e.deathTimer / 0.5
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(time * 15); ctx.scale(t, t)
      ctx.globalAlpha = t * 0.8; ctx.font = `${e.size}px "Courier New",monospace`
      ctx.fillStyle = '#ffaa00'; ctx.fillText(e.char, 0, 0); ctx.restore()
    } else {
      const bob = Math.sin(time * 2.5 + e.phase) * 4
      ctx.globalAlpha = e.kind === 3 ? 0.4 + Math.sin(time * 3 + e.phase) * 0.2 : 0.75
      ctx.font = `${e.size}px "Courier New",monospace`; ctx.fillStyle = e.color
      ctx.fillText(e.char, e.x, e.y + bob)
    }
  }
  if (score > 0) {
    ctx.globalAlpha = 0.3 + scoreFlash * 0.4
    ctx.font = '600 14px Inter,system-ui,sans-serif'; ctx.fillStyle = scoreFlash > 0 ? '#ffaa33' : '#666'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`SCORE ${score}`, 20, 20)
  }
  ctx.globalAlpha = 1
}

// ─── Runes (reduced count) ──────────────────────────────────

const RUNE_N = 8
const runeChars = '龍火竜鱗焔ᚱᚦᛏ'.split('')
const runeX = new Float32Array(RUNE_N), runeY = new Float32Array(RUNE_N)
const runeSpd = new Float32Array(RUNE_N), runePhase = new Float32Array(RUNE_N)
const runeSz = new Float32Array(RUNE_N), runeOp = new Float32Array(RUNE_N)
const runeC: string[] = []
for (let i = 0; i < RUNE_N; i++) {
  runeX[i] = Math.random() * W; runeY[i] = Math.random() * H
  runeSpd[i] = 0.1 + Math.random() * 0.4; runePhase[i] = Math.random() * Math.PI * 2
  runeSz[i] = 14 + Math.random() * 14; runeOp[i] = 0.02 + Math.random() * 0.04
  runeC[i] = runeChars[Math.random() * runeChars.length | 0]
}

function drawRunes(time: number) {
  if (!cfg.showRunes) return
  ctx.fillStyle = '#ff6600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let i = 0; i < RUNE_N; i++) {
    runeY[i] -= runeSpd[i]
    if (runeY[i] < -30) { runeY[i] = H + 30; runeX[i] = Math.random() * W }
    ctx.globalAlpha = runeOp[i] * (0.5 + Math.sin(time * 0.4 + runePhase[i]) * 0.5)
    ctx.font = `${runeSz[i]}px "Courier New",monospace`
    ctx.fillText(runeC[i], runeX[i] + Math.sin(time * 0.7 + runePhase[i]) * 12, runeY[i])
  }
  ctx.globalAlpha = 1
}

// ─── Draw dragon ────────────────────────────────────────────

function drawDragon(time: number) {
  for (let i = chainN - 1; i >= 0; i--) {
    const sc = segScale(i), ci = Math.min(i, dragonChars.length - 1), size = 14 * sc
    const t = i / chainN, p = Math.sin(time * 3 + i * 0.3) * 0.12
    let color: string
    if (i < 3) color = `rgb(255,${180 + p * 60 | 0},${40 + p * 30 | 0})`
    else {
      const w = Math.sin(time * 2 - i * 0.15) * 0.15
      color = `rgba(${(255 * (1 - t * 0.5) + p * 20) | 0},${(140 * (1 - t * 0.8) + w * 60) | 0},${(30 * (1 - t) + w * 20) | 0},${1 - t * 0.45})`
    }
    let angle = i === 0
      ? Math.atan2(mouse.y - chY[0], mouse.x - chX[0])
      : Math.atan2(chY[i - 1] - chY[i], chX[i - 1] - chX[i])

    if (i < 4) {
      ctx.globalAlpha = 0.06 * (isBreathingFire ? 2 : 1)
      ctx.fillStyle = '#ff6600'; ctx.beginPath()
      ctx.arc(chX[i], chY[i], size * 1.1, 0, Math.PI * 2); ctx.fill()
    }

    if (cfg.showSpines && i >= 4 && i <= 30 && i % 3 === 0) {
      const sa = angle + Math.PI / 2
      ctx.globalAlpha = 0.35
      ctx.font = `${size * (0.6 + Math.sin(time * 3 + i) * 0.15)}px "Courier New",monospace`
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('▴', chX[i] + Math.cos(sa) * size * 0.35, chY[i] + Math.sin(sa) * size * 0.35)
    }

    if (cfg.showWings && i >= 7 && i <= 16 && i % 2 === 0) {
      const wp = Math.sin(time * 3.5 + i * 0.4) * 0.5
      const ws = size * (1.8 - Math.abs(i - 11.5) * 0.12), wd = size * 1.4
      const w1 = angle + Math.PI / 2 + wp, w2 = angle - Math.PI / 2 - wp
      ctx.globalAlpha = 0.4; ctx.font = `${ws}px "Courier New",monospace`
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('≺', chX[i] + Math.cos(w1) * wd, chY[i] + Math.sin(w1) * wd)
      ctx.fillText('≻', chX[i] + Math.cos(w2) * wd, chY[i] + Math.sin(w2) * wd)
    }

    ctx.save(); ctx.translate(chX[i], chY[i]); ctx.rotate(angle)
    ctx.globalAlpha = 1; ctx.font = `bold ${size}px "Courier New",monospace`; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(dragonChars[ci], 0, Math.sin(time * 5 + i * 0.35) * 1.5)
    if (isBreathingFire && i < 3) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffcc00'; ctx.fillText(dragonChars[ci], 0, Math.sin(time * 5 + i * 0.35) * 1.5) }
    ctx.restore()
  }

  // Eyes
  const ha = Math.atan2(mouse.y - chY[0], mouse.x - chX[0])
  const ex = chX[0] + Math.cos(ha + 0.5) * 10, ey = chY[0] + Math.sin(ha + 0.5) * 10
  ctx.globalAlpha = isBreathingFire ? 0.2 : 0.1; ctx.fillStyle = '#ff8800'
  ctx.beginPath(); ctx.arc(ex, ey, isBreathingFire ? 18 : 12, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1; ctx.fillStyle = isBreathingFire ? '#fff' : '#ffcc00'
  ctx.font = '16px "Courier New"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(time % 5 > 4.7 ? '—' : isBreathingFire ? '◉' : '⊙', ex, ey)
}

// ─── Cursor ─────────────────────────────────────────────────

function drawCursor(time: number) {
  if (!cfg.showCursor) return
  const mx = mouse.x, my = mouse.y
  ctx.save()
  ctx.translate(mx, my); ctx.rotate(time * 0.4)
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 0.5); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI, Math.PI * 1.5); ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = isBreathingFire ? 0.8 : 0.5; ctx.fillStyle = isBreathingFire ? '#ffaa33' : '#ff8844'
  ctx.beginPath(); ctx.arc(mx, my, isBreathingFire ? 3 : 2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.15; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my); ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my)
  ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24)
  ctx.stroke(); ctx.globalAlpha = 1
}

// ─── UI Panel binding ───────────────────────────────────────

const panel = document.getElementById('panel')!
const toggle = document.getElementById('panel-toggle')!
const closeBtn = document.getElementById('panel-close')!
const presetsEl = document.getElementById('presets')!
const statsEl = document.getElementById('stats')!

let panelOpen = false
function setPanelOpen(open: boolean) {
  panelOpen = open; panel.classList.toggle('open', open)
  toggle.style.display = open ? 'none' : 'flex'
}
toggle.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(true) })
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(false) })
addEventListener('keydown', (e) => {
  if ((e.key === 'p' || e.key === 'P') && !(e.target as HTMLElement).closest('input,textarea')) setPanelOpen(!panelOpen)
  if (e.key === 'Escape' && panelOpen) setPanelOpen(false)
})
panel.addEventListener('mousedown', (e) => e.stopPropagation())
panel.addEventListener('touchstart', (e) => e.stopPropagation())

for (const name of Object.keys(PRESETS)) {
  const btn = document.createElement('button')
  btn.className = 'preset-btn'; btn.textContent = name
  btn.addEventListener('click', () => {
    applyPreset(name)
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
  presetsEl.appendChild(btn)
}

function syncUI() {
  panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
    const key = input.dataset.key as keyof typeof cfg
    if (input.type === 'checkbox') input.checked = cfg[key] as boolean
    else input.value = String(cfg[key])
    const v = panel.querySelector(`[data-val="${key}"]`)
    if (v) v.textContent = String(cfg[key])
  })
}

panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
  const key = input.dataset.key as keyof typeof cfg
  const handler = () => {
    (cfg as any)[key] = input.type === 'checkbox' ? input.checked : parseFloat(input.value)
    const v = panel.querySelector(`[data-val="${key}"]`)
    if (v) v.textContent = input.type === 'checkbox' ? String(input.checked) : parseFloat(input.value).toFixed(input.step?.includes('.') ? 3 : 0)
    if (key === 'dragonSegments') rebuildDragon()
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
  }
  input.addEventListener('input', handler); input.addEventListener('change', handler)
})
syncUI()

// ─── Main loop ──────────────────────────────────────────────

let lastTime = performance.now(), time = 0, frameCount = 0, fpsTime = 0, fps = 0

initialized = true; layoutAllText()
document.fonts.ready.then(layoutAllText)

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now; time += dt
  frameCount++; fpsTime += dt
  if (fpsTime >= 0.5) { fps = Math.round(frameCount / fpsTime); frameCount = 0; fpsTime = 0 }
  statsEl.textContent = `${fps} fps · ${letterCount} letters · ${particleCount + emberCount} particles`

  updateShake()
  ctx.save(); ctx.translate(shakeX, shakeY)
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-10, -10, W + 20, H + 20)
  drawTunnel()
  drawRunes(time)
  updateChain(); interactLetters(dt); emitFire(dt); updateParticlesAndEmbers(dt)
  updateEnemies(dt, time)
  drawLetters(); drawEnemies(time); drawDragon(time); drawParticles(time); drawCursor(time)
  ctx.restore()

  const hint = document.getElementById('hint')
  if (hint && time > 6) hint.style.opacity = '0'

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
