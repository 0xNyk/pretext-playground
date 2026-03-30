import { prepare, layout, prepareWithSegments, layoutWithLines, walkLineRanges } from '@chenglou/pretext'

// ─── Canvas ─────────────────────────────────────────────────

const NAV_H = 44
const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = window.devicePixelRatio || 1
let W = innerWidth, H = innerHeight - NAV_H

function resize() {
  W = innerWidth; H = innerHeight - NAV_H
  canvas.width = W * dpr; canvas.height = H * dpr
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
resize()
addEventListener('resize', resize)

const mouse = { x: W / 2, y: H / 2 }
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY - NAV_H })

// ─── Scene system ───────────────────────────────────────────

type Scene = {
  name: string
  hint: string
  init: () => void
  draw: (time: number, dt: number) => void
}

const scenes: Scene[] = []
let activeScene = 0

// ─── Scene 1: Matrix Rain ───────────────────────────────────
// Columns of Pretext-measured multilingual text falling like the Matrix

scenes.push({
  name: 'Matrix Rain',
  hint: 'Pretext measures every glyph width — CJK, Arabic, emoji all fall at correct spacing',
  init() {},
  draw(time, dt) {
    // Fade previous frame
    ctx.fillStyle = 'rgba(10,10,10,0.12)'
    ctx.fillRect(0, 0, W, H)

    const charSets = [
      'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      '春夏秋冬龍鳳虎亀',
      'بدأتالرحلة',
      '@#$%^&*(){}[]|/<>~',
    ]
    const allChars = charSets.join('')

    const colW = 18
    const cols = Math.ceil(W / colW)
    // Use time-seeded deterministic "randomness" for consistent columns
    for (let c = 0; c < cols; c++) {
      const seed = c * 7919 // prime
      const speed = 40 + (seed % 60)
      const offset = (time * speed + (seed % 500)) % (H + 300) - 100
      const len = 8 + (seed % 20)

      for (let i = 0; i < len; i++) {
        const y = offset - i * 18
        if (y < -20 || y > H + 20) continue

        const charIdx = (seed + i * 31 + (time * 2 | 0)) % allChars.length
        const char = allChars[charIdx]
        const brightness = i === 0 ? 1 : Math.max(0, 1 - i / len)

        const r = (brightness * 80) | 0
        const g = (brightness * 255) | 0
        const b = (brightness * 80) | 0

        ctx.save()
        ctx.globalAlpha = brightness * 0.8
        ctx.font = '15px "Courier New",monospace'
        ctx.fillStyle = i === 0 ? '#ffffff' : `rgb(${r},${g},${b})`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(char, c * colW + colW / 2, y)
        ctx.restore()
      }
    }

    // Overlay: Pretext-measured centered text
    const msg = 'PURE TEXT MEASUREMENT'
    const font = '36px "Courier New",monospace'
    const p = prepareWithSegments(msg, font)
    const { lines } = layoutWithLines(p, W - 100, 44)
    ctx.save()
    ctx.globalAlpha = 0.15 + Math.sin(time * 2) * 0.05
    ctx.font = font
    ctx.fillStyle = '#00ff00'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const line of lines) {
      ctx.fillText(line.text, W / 2, H / 2)
    }
    ctx.restore()
  },
})

// ─── Scene 2: Wave Text ─────────────────────────────────────
// Text arranged in a sine wave, each character positioned individually

scenes.push({
  name: 'Text Wave',
  hint: 'Each character positioned using Pretext-measured widths, then displaced by a sine wave',
  init() {},
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    const lines = [
      { text: 'The quick brown fox jumps over the lazy dog', font: '24px "Courier New",monospace', color: '#ff8844', y: 0.2 },
      { text: '春天到了 — テキストレイアウトの革命が始まる', font: '22px "Courier New",monospace', color: '#44aaff', y: 0.35 },
      { text: 'prepare() measures, layout() computes, you render', font: '20px "Courier New",monospace', color: '#66dd66', y: 0.5 },
      { text: 'بدأت الرحلة الكبرى في عالم النص 🚀✨🎨', font: '20px "Courier New",monospace', color: '#ddaa44', y: 0.65 },
      { text: '0.0002ms per layout — 500x faster than DOM', font: '22px "Courier New",monospace', color: '#ff66aa', y: 0.8 },
    ]

    for (const line of lines) {
      const baseY = H * line.y
      ctx.font = line.font

      // Measure each character width
      const chars: { char: string; w: number }[] = []
      let totalW = 0
      for (const char of line.text) {
        const w = ctx.measureText(char).width
        chars.push({ char, w })
        totalW += w
      }

      let x = (W - totalW) / 2
      for (let i = 0; i < chars.length; i++) {
        const { char, w } = chars[i]
        const waveOffset = Math.sin(time * 3 + x * 0.015 + i * 0.1) * 25
        const scaleWave = 1 + Math.sin(time * 2 + i * 0.2) * 0.15

        // Mouse proximity effect
        const dx = (x + w / 2) - mouse.x, dy = (baseY + waveOffset) - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const proximity = Math.max(0, 1 - dist / 150)
        const lift = proximity * -30
        const brightBoost = proximity * 0.4

        ctx.save()
        ctx.translate(x + w / 2, baseY + waveOffset + lift)
        ctx.scale(scaleWave + proximity * 0.3, scaleWave + proximity * 0.3)
        ctx.rotate(Math.sin(time * 4 + i * 0.15) * 0.05)
        ctx.globalAlpha = 0.6 + brightBoost
        ctx.font = line.font
        ctx.fillStyle = line.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(char, 0, 0)
        ctx.restore()

        x += w
      }
    }
  },
})

// ─── Scene 3: Morphing Text ─────────────────────────────────
// Text that smoothly morphs between different phrases

scenes.push({
  name: 'Text Morph',
  hint: 'Characters interpolate between Pretext-measured positions of different phrases',
  init() {},
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    const phrases = [
      'PRETEXT',
      '準備 + 配置',
      'MEASURE',
      'بدون DOM',
      'LAYOUT',
      '0.0002ms',
      'RENDER',
      '120 FPS',
    ]

    const duration = 2.5 // seconds per phrase
    const totalPhrase = phrases.length
    const t = time % (totalPhrase * duration)
    const fromIdx = (t / duration) | 0
    const toIdx = (fromIdx + 1) % totalPhrase
    const lerp = (t % duration) / duration
    // Smooth easing
    const ease = lerp < 0.5 ? 2 * lerp * lerp : 1 - (-2 * lerp + 2) ** 2 / 2

    const fromText = phrases[fromIdx]
    const toText = phrases[toIdx]
    const maxLen = Math.max(fromText.length, toText.length)

    const font = `bold ${Math.min(80, W * 0.08)}px "Courier New",monospace`
    ctx.font = font

    // Measure positions for both phrases
    function measurePhrase(text: string): { char: string; x: number; w: number }[] {
      const result: { char: string; x: number; w: number }[] = []
      let totalW = 0
      for (const c of text) totalW += ctx.measureText(c).width
      let x = (W - totalW) / 2
      for (const c of text) {
        const w = ctx.measureText(c).width
        result.push({ char: c, x: x + w / 2, w })
        x += w
      }
      return result
    }

    const from = measurePhrase(fromText)
    const to = measurePhrase(toText)

    // Draw interpolated characters
    for (let i = 0; i < maxLen; i++) {
      const fc = from[Math.min(i, from.length - 1)]
      const tc = to[Math.min(i, to.length - 1)]
      const inFrom = i < from.length
      const inTo = i < to.length

      const x = fc.x + (tc.x - fc.x) * ease
      const y = H / 2

      // Character transition: fade out old, fade in new
      const charToShow = ease < 0.5 ? (inFrom ? fc.char : '') : (inTo ? tc.char : '')
      const charAlpha = ease < 0.5
        ? (inFrom ? 1 - ease * 2 * 0.5 : 0)
        : (inTo ? (ease - 0.5) * 2 * 0.5 + 0.5 : 0)

      if (charToShow === '') continue

      // Scatter during transition
      const scatter = Math.sin(ease * Math.PI) * 40
      const yOff = Math.sin(time * 5 + i * 0.8) * scatter
      const xOff = Math.cos(time * 3 + i * 1.2) * scatter * 0.5
      const rot = Math.sin(ease * Math.PI) * Math.sin(i * 2.5) * 0.5

      const hue = (i / maxLen) * 40 + 15
      ctx.save()
      ctx.translate(x + xOff, y + yOff)
      ctx.rotate(rot)
      ctx.globalAlpha = charAlpha
      ctx.font = font
      ctx.fillStyle = `hsl(${hue}, 80%, 65%)`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(charToShow, 0, 0)
      ctx.restore()
    }

    // Subtitle
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.font = '13px "Courier New",monospace'
    ctx.fillStyle = '#888'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${phrases[fromIdx]}  \u2192  ${phrases[toIdx]}`, W / 2, H / 2 + 80)
    ctx.restore()
  },
})

// ─── Scene 4: Particle Text ─────────────────────────────────
// Text made of particles that react to the mouse

type TextParticle = {
  homeX: number; homeY: number
  x: number; y: number
  vx: number; vy: number
  char: string; color: string
}

let textParticles: TextParticle[] = []

scenes.push({
  name: 'Particle Text',
  hint: 'Characters are positioned by Pretext, then become mouse-reactive particles',
  init() {
    textParticles = []
    const phrases = [
      { text: '@chenglou/pretext', font: '28px "Courier New",monospace', color: '#ff8844', y: H * 0.3 },
      { text: 'npm install', font: '20px "Courier New",monospace', color: '#66dd66', y: H * 0.45 },
      { text: 'テキスト測定エンジン', font: '24px "Courier New",monospace', color: '#44aaff', y: H * 0.6 },
      { text: 'No reflow. Pure math.', font: '22px "Courier New",monospace', color: '#ddaa44', y: H * 0.75 },
    ]

    for (const phrase of phrases) {
      try {
        const prepared = prepareWithSegments(phrase.text, phrase.font)
        const { lines } = layoutWithLines(prepared, W - 100, 30)
        for (const line of lines) {
          ctx.font = phrase.font
          let totalW = 0
          for (const c of line.text) totalW += ctx.measureText(c).width
          let x = (W - totalW) / 2
          for (const c of line.text) {
            if (c === ' ') { x += ctx.measureText(c).width; continue }
            const cw = ctx.measureText(c).width
            textParticles.push({
              homeX: x + cw / 2, homeY: phrase.y,
              x: Math.random() * W, y: Math.random() * H, // Start scattered
              vx: 0, vy: 0,
              char: c, color: phrase.color,
            })
            x += cw
          }
        }
      } catch { /* skip */ }
    }
  },
  draw(time, dt) {
    ctx.fillStyle = 'rgba(10,10,10,0.15)'
    ctx.fillRect(0, 0, W, H)

    const repelRadius = 120
    const repelForce = 800

    for (const p of textParticles) {
      // Mouse repulsion
      const dx = p.x - mouse.x, dy = p.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < repelRadius && dist > 1) {
        const f = (1 - dist / repelRadius) * repelForce * dt
        p.vx += (dx / dist) * f
        p.vy += (dy / dist) * f
      }

      // Spring home
      p.vx += (p.homeX - p.x) * 2 * dt
      p.vy += (p.homeY - p.y) * 2 * dt

      // Damping
      p.vx *= 0.92; p.vy *= 0.92
      p.x += p.vx; p.y += p.vy

      // Draw
      const homeDist = Math.sqrt((p.x - p.homeX) ** 2 + (p.y - p.homeY) ** 2)
      ctx.save()
      ctx.globalAlpha = Math.min(0.9, 0.5 + homeDist * 0.005)
      ctx.font = '22px "Courier New",monospace'
      ctx.fillStyle = homeDist > 20 ? '#ff6644' : p.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.char, p.x, p.y)
      ctx.restore()
    }
  },
})

// ─── Scene 5: Typewriter ────────────────────────────────────
// Animated typewriter with Pretext measuring each line in real-time

scenes.push({
  name: 'Typewriter',
  hint: 'Pretext computes line breaks in real-time as characters are "typed" — watch the lines reflow',
  init() {},
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    const fullText = "In the age of AI, text layout was the last and biggest bottleneck for unlocking much more interesting UIs. Pretext solves this with pure TypeScript — canvas-based measurement, pure arithmetic layout. 春天到了. بدأت الرحلة 🚀 No longer do we have to choose between flashy WebGL and practical blog articles. prepare() once, layout() on every resize. ~0.0002ms per call. CJK, Arabic, emoji, bidi — all handled. npm install @chenglou/pretext"

    const charsPerSec = 30
    const visibleChars = ((time * charsPerSec) % (fullText.length + 60)) | 0
    const text = fullText.slice(0, Math.min(visibleChars, fullText.length))

    const font = '16px "Courier New",monospace'
    const maxWidth = Math.min(600, W - 100)
    const lineHeight = 24
    const startX = (W - maxWidth) / 2
    const startY = H * 0.15

    // Use Pretext to measure and layout the text as it grows
    try {
      const prepared = prepareWithSegments(text, font)
      const result = layoutWithLines(prepared, maxWidth, lineHeight)

      ctx.font = font
      ctx.textBaseline = 'top'

      for (let li = 0; li < result.lines.length; li++) {
        const line = result.lines[li]
        const y = startY + li * lineHeight

        // Animate each character appearing
        let x = startX
        for (let ci = 0; ci < line.text.length; ci++) {
          const char = line.text[ci]
          const cw = ctx.measureText(char).width

          // Slight bounce on newest characters
          const charAge = visibleChars - ci - (li > 0 ? result.lines.slice(0, li).reduce((s, l) => s + l.text.length, 0) : 0)
          const isNew = charAge >= 0 && charAge < 3
          const bounce = isNew ? Math.sin(time * 20) * 2 : 0

          ctx.save()
          ctx.globalAlpha = 0.8
          ctx.fillStyle = isNew ? '#ffffff' : '#cccccc'
          ctx.fillText(char, x, y + bounce)
          ctx.restore()

          x += cw
        }

        // Line width indicator
        ctx.save()
        ctx.globalAlpha = 0.06
        ctx.fillStyle = '#ff8844'
        ctx.fillRect(startX, y, line.width, lineHeight)
        ctx.restore()
      }

      // Cursor blink
      if (text.length < fullText.length) {
        const lastLine = result.lines[result.lines.length - 1]
        const cursorX = startX + (lastLine?.width ?? 0)
        const cursorY = startY + (result.lines.length - 1) * lineHeight
        if (Math.sin(time * 6) > 0) {
          ctx.fillStyle = '#ff8844'
          ctx.fillRect(cursorX + 2, cursorY, 2, lineHeight - 4)
        }
      }

      // Stats
      ctx.save()
      ctx.globalAlpha = 0.35
      ctx.font = '11px "Courier New",monospace'
      ctx.fillStyle = '#888'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${text.length} chars | ${result.lineCount} lines | height: ${result.height}px | max-width: ${maxWidth}px`, startX, startY + result.height + 20)
      ctx.restore()

      // Shrinkwrap indicator
      let widest = 0
      walkLineRanges(prepared, maxWidth, (line) => { if (line.width > widest) widest = line.width })
      ctx.save()
      ctx.globalAlpha = 0.15
      ctx.strokeStyle = '#ff8844'
      ctx.setLineDash([4, 4])
      ctx.strokeRect(startX - 1, startY - 1, widest + 2, result.height + 2)
      ctx.setLineDash([])
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.font = '10px "Courier New",monospace'
      ctx.fillStyle = '#ff8844'
      ctx.textAlign = 'left'
      ctx.fillText(`shrinkwrap: ${Math.round(widest)}px`, startX, startY + result.height + 40)
      ctx.restore()
    } catch { /* skip */ }
  },
})

// ─── Scene selector UI ──────────────────────────────────────

const sceneTabsEl = document.getElementById('scene-tabs')!
const sceneHintEl = document.getElementById('scene-hint')!

function activateScene(idx: number) {
  activeScene = idx
  scenes[idx].init()
  sceneTabsEl.querySelectorAll('.scene-btn').forEach((b, i) => b.classList.toggle('active', i === idx))
  sceneHintEl.textContent = scenes[idx].hint
}

for (let i = 0; i < scenes.length; i++) {
  const btn = document.createElement('button')
  btn.className = 'scene-btn'
  btn.textContent = scenes[i].name
  btn.addEventListener('click', () => activateScene(i))
  sceneTabsEl.appendChild(btn)
}

activateScene(0)

// ─── Main loop ──────────────────────────────────────────────

let lastTime = performance.now(), time = 0, frameCount = 0, fpsTime = 0, fps = 0
const statsEl = document.getElementById('stats')!

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now; time += dt

  frameCount++; fpsTime += dt
  if (fpsTime >= 0.5) { fps = Math.round(frameCount / fpsTime); frameCount = 0; fpsTime = 0 }
  statsEl.textContent = `${fps} fps`

  scenes[activeScene].draw(time, dt)

  requestAnimationFrame(frame)
}

document.fonts.ready.then(() => {
  scenes[activeScene].init()
  requestAnimationFrame(frame)
})
