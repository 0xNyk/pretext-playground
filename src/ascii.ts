import { prepareWithSegments, layoutWithLines, walkLineRanges } from '@chenglou/pretext'

// ─── Canvas ─────────────────────────────────────────────────

const NAV_H = 44
const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = Math.min(window.devicePixelRatio || 1, 2)
let W = innerWidth, H = innerHeight - NAV_H

function resize() {
  W = innerWidth; H = innerHeight - NAV_H
  canvas.width = W * dpr; canvas.height = H * dpr
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
resize()
addEventListener('resize', resize)

// ─── Input state ────────────────────────────────────────────

const mouse = { x: W / 2, y: H / 2, down: false, dragX: 0, dragY: 0 }
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY - NAV_H
  if (mouse.down) { mouse.dragX = e.movementX; mouse.dragY = e.movementY }
})
addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).closest('#scene-tabs,.scene-btn')) return
  mouse.down = true
})
addEventListener('mouseup', () => { mouse.down = false; mouse.dragX = 0; mouse.dragY = 0 })
addEventListener('touchmove', (e) => {
  e.preventDefault()
  mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY - NAV_H
}, { passive: false })
addEventListener('touchstart', (e) => {
  if ((e.target as HTMLElement).closest('#scene-tabs,.scene-btn')) return
  mouse.down = true
  mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY - NAV_H
})
addEventListener('touchend', () => { mouse.down = false })

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
// Click to create a "shockwave" that clears columns, mouse acts as a magnet

let matrixShockwaves: { x: number; y: number; t: number; radius: number }[] = []

scenes.push({
  name: 'Matrix Rain',
  hint: 'Move mouse to bend columns toward cursor — click to create shockwaves that scatter characters',
  init() { matrixShockwaves = [] },
  draw(time, dt) {
    ctx.fillStyle = 'rgba(10,10,10,0.12)'
    ctx.fillRect(0, 0, W, H)

    // Update shockwaves
    for (let i = matrixShockwaves.length - 1; i >= 0; i--) {
      matrixShockwaves[i].radius += dt * 400
      matrixShockwaves[i].t -= dt
      if (matrixShockwaves[i].t <= 0) matrixShockwaves.splice(i, 1)
    }

    if (mouse.down && Math.random() < dt * 8) {
      matrixShockwaves.push({ x: mouse.x, y: mouse.y, t: 0.8, radius: 0 })
    }

    const charSets = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789春夏秋冬龍鳳虎亀@#$%^&*()'
    const colW = 18
    const cols = Math.ceil(W / colW)

    ctx.font = '15px "Courier New",monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    for (let c = 0; c < cols; c++) {
      const seed = c * 7919
      const speed = 40 + (seed % 60)
      const offset = (time * speed + (seed % 500)) % (H + 300) - 100
      const len = 8 + (seed % 20)
      const colCx = c * colW + colW / 2

      // Mouse attraction — bend column toward cursor
      const colDx = mouse.x - colCx
      const colDistX = Math.abs(colDx)
      const attract = colDistX < 200 ? (1 - colDistX / 200) * colDx * 0.3 : 0

      for (let i = 0; i < len; i++) {
        let y = offset - i * 18
        if (y < -20 || y > H + 20) continue

        let x = colCx + attract * (1 - i / len * 0.5)

        // Shockwave displacement
        for (const sw of matrixShockwaves) {
          const sdx = x - sw.x, sdy = y - sw.y
          const sd = Math.sqrt(sdx * sdx + sdy * sdy)
          const ringDist = Math.abs(sd - sw.radius)
          if (ringDist < 40) {
            const push = (1 - ringDist / 40) * sw.t * 60
            if (sd > 0.1) { x += (sdx / sd) * push; y += (sdy / sd) * push }
          }
        }

        const charIdx = (seed + i * 31 + (time * 2 | 0)) % charSets.length
        const brightness = i === 0 ? 1 : Math.max(0, 1 - i / len)

        ctx.globalAlpha = brightness * 0.8
        if (i === 0) ctx.fillStyle = '#ffffff'
        else ctx.fillStyle = `rgb(${brightness * 80 | 0},${brightness * 255 | 0},${brightness * 80 | 0})`
        ctx.fillText(charSets[charIdx], x, y)
      }
    }

    // Center text
    ctx.globalAlpha = 0.15 + Math.sin(time * 2) * 0.05
    ctx.font = '36px "Courier New",monospace'
    ctx.fillStyle = '#00ff00'
    ctx.fillText('PURE TEXT MEASUREMENT', W / 2, H / 2)
    ctx.globalAlpha = 1
  },
})

// ─── Scene 2: Wave Text ─────────────────────────────────────
// Mouse proximity effect + click to "grab" and fling characters

let waveGrabForceX = 0, waveGrabForceY = 0

scenes.push({
  name: 'Text Wave',
  hint: 'Move mouse near text to interact — click & drag to create wind that pushes characters',
  init() { waveGrabForceX = 0; waveGrabForceY = 0 },
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    // Accumulate drag force
    if (mouse.down) {
      waveGrabForceX += mouse.dragX * 0.3
      waveGrabForceY += mouse.dragY * 0.3
    }
    waveGrabForceX *= 0.92; waveGrabForceY *= 0.92
    mouse.dragX = 0; mouse.dragY = 0

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

      const chars: { char: string; w: number }[] = []
      let totalW = 0
      for (const char of line.text) {
        const w = ctx.measureText(char).width
        chars.push({ char, w }); totalW += w
      }

      let x = (W - totalW) / 2
      for (let i = 0; i < chars.length; i++) {
        const { char, w } = chars[i]
        const cx = x + w / 2
        const waveOffset = Math.sin(time * 3 + x * 0.015 + i * 0.1) * 25
        let cy = baseY + waveOffset

        // Mouse proximity — repel/attract
        const dx = cx - mouse.x, dy = cy - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const proximity = Math.max(0, 1 - dist / 180)
        let pushX = 0, pushY = 0

        if (mouse.down && proximity > 0) {
          // Attract toward mouse when clicked
          pushX = -dx * proximity * 0.15
          pushY = -dy * proximity * 0.15
        } else if (proximity > 0) {
          // Repel on hover
          pushX = (dx / (dist || 1)) * proximity * 20
          pushY = (dy / (dist || 1)) * proximity * 20
        }

        // Wind force from drag
        if (proximity > 0.2) {
          pushX += waveGrabForceX * proximity
          pushY += waveGrabForceY * proximity
        }

        const scaleWave = 1 + Math.sin(time * 2 + i * 0.2) * 0.1 + proximity * 0.3

        ctx.save()
        ctx.translate(cx + pushX, cy + pushY)
        ctx.scale(scaleWave, scaleWave)
        ctx.rotate(Math.sin(time * 4 + i * 0.15) * 0.05 + pushX * 0.005)
        ctx.globalAlpha = 0.6 + proximity * 0.4
        ctx.font = line.font; ctx.fillStyle = line.color
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(char, 0, 0)
        ctx.restore()

        x += w
      }
    }
  },
})

// ─── Scene 3: Morphing Text ─────────────────────────────────
// Click to advance morph, hold to freeze, mouse position controls scatter amount

let morphPausedTime = 0
let morphClickAdvance = 0

scenes.push({
  name: 'Text Morph',
  hint: 'Click to skip to next morph — hold mouse to freeze — mouse Y controls scatter intensity',
  init() { morphPausedTime = 0; morphClickAdvance = 0 },
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    // Click to advance
    if (mouse.down) morphPausedTime += dt
    const effectiveTime = time + morphClickAdvance - morphPausedTime

    const phrases = ['PRETEXT', '準備 + 配置', 'MEASURE', 'بدون DOM', 'LAYOUT', '0.0002ms', 'RENDER', '120 FPS']
    const duration = 2.5
    const totalPhrase = phrases.length
    const t = ((effectiveTime % (totalPhrase * duration)) + totalPhrase * duration) % (totalPhrase * duration)
    const fromIdx = (t / duration) | 0
    const toIdx = (fromIdx + 1) % totalPhrase
    const lerp = (t % duration) / duration
    const ease = lerp < 0.5 ? 2 * lerp * lerp : 1 - (-2 * lerp + 2) ** 2 / 2

    const fromText = phrases[fromIdx], toText = phrases[toIdx]
    const maxLen = Math.max(fromText.length, toText.length)
    const font = `bold ${Math.min(80, W * 0.08)}px "Courier New",monospace`
    ctx.font = font

    // Mouse Y controls extra scatter
    const mouseScatter = (mouse.y / H) * 80

    function measurePhrase(text: string) {
      const result: { char: string; x: number; w: number }[] = []
      let totalW = 0
      for (const c of text) totalW += ctx.measureText(c).width
      let x = (W - totalW) / 2
      for (const c of text) { const w = ctx.measureText(c).width; result.push({ char: c, x: x + w / 2, w }); x += w }
      return result
    }

    const from = measurePhrase(fromText), to = measurePhrase(toText)

    for (let i = 0; i < maxLen; i++) {
      const fc = from[Math.min(i, from.length - 1)], tc = to[Math.min(i, to.length - 1)]
      const inFrom = i < from.length, inTo = i < to.length
      const x = fc.x + (tc.x - fc.x) * ease
      const charToShow = ease < 0.5 ? (inFrom ? fc.char : '') : (inTo ? tc.char : '')
      const charAlpha = ease < 0.5 ? (inFrom ? 1 - ease : 0) : (inTo ? ease : 0)
      if (charToShow === '') continue

      const scatter = Math.sin(ease * Math.PI) * (40 + mouseScatter)
      const yOff = Math.sin(time * 5 + i * 0.8) * scatter
      const xOff = Math.cos(time * 3 + i * 1.2) * scatter * 0.5

      // Mouse proximity — pull characters toward cursor during transition
      let pullX = 0, pullY = 0
      if (mouse.down) {
        const dx = mouse.x - (x + xOff), dy = mouse.y - H / 2 - yOff
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 300) {
          const pull = (1 - dist / 300) * 0.4
          pullX = dx * pull; pullY = dy * pull
        }
      }

      const hue = (i / maxLen) * 40 + 15
      ctx.save()
      ctx.translate(x + xOff + pullX, H / 2 + yOff + pullY)
      ctx.rotate(Math.sin(ease * Math.PI) * Math.sin(i * 2.5) * 0.5)
      ctx.globalAlpha = charAlpha; ctx.font = font
      ctx.fillStyle = `hsl(${hue}, 80%, 65%)`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(charToShow, 0, 0)
      ctx.restore()
    }

    ctx.globalAlpha = 0.3; ctx.font = '13px "Courier New",monospace'; ctx.fillStyle = '#888'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${phrases[fromIdx]}  \u2192  ${phrases[toIdx]}`, W / 2, H / 2 + 80)
    ctx.globalAlpha = 1
  },
})

// ─── Scene 4: Particle Text ─────────────────────────────────
// Click to attract, release to explode, right-click to scramble homes

type TextParticle = {
  homeX: number; homeY: number
  x: number; y: number; vx: number; vy: number
  char: string; color: string; font: string
}

let textParticles: TextParticle[] = []
let particleMode: 'repel' | 'attract' = 'repel'

scenes.push({
  name: 'Particle Text',
  hint: 'Hover to repel — click & hold to attract characters to cursor — release to explode them outward',
  init() {
    textParticles = []
    particleMode = 'repel'
    const phrases = [
      { text: '@chenglou/pretext', font: '28px "Courier New",monospace', color: '#ff8844', y: H * 0.25 },
      { text: 'npm install', font: '22px "Courier New",monospace', color: '#66dd66', y: H * 0.4 },
      { text: 'テキスト測定エンジン', font: '26px "Courier New",monospace', color: '#44aaff', y: H * 0.55 },
      { text: 'No reflow. Pure math.', font: '24px "Courier New",monospace', color: '#ddaa44', y: H * 0.7 },
      { text: '0.0002ms per call', font: '20px "Courier New",monospace', color: '#ff66aa', y: H * 0.85 },
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
              x: Math.random() * W, y: Math.random() * H,
              vx: 0, vy: 0, char: c, color: phrase.color, font: phrase.font,
            })
            x += cw
          }
        }
      } catch { /* skip */ }
    }
  },
  draw(time, dt) {
    ctx.fillStyle = 'rgba(10,10,10,0.18)'
    ctx.fillRect(0, 0, W, H)

    const wasDown = particleMode === 'attract'
    particleMode = mouse.down ? 'attract' : 'repel'

    // On release: explode outward from cursor
    const justReleased = wasDown && !mouse.down

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

    for (const p of textParticles) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (justReleased && dist < 200) {
        // Explosion on release
        const force = (1 - dist / 200) * 30
        if (dist > 1) { p.vx += (dx / dist) * force; p.vy += (dy / dist) * force }
      } else if (mouse.down && dist < 250 && dist > 1) {
        // Attract to mouse
        const f = (1 - dist / 250) * 600 * dt
        p.vx -= (dx / dist) * f; p.vy -= (dy / dist) * f
      } else if (!mouse.down && dist < 150 && dist > 1) {
        // Repel from mouse
        const f = (1 - dist / 150) * 800 * dt
        p.vx += (dx / dist) * f; p.vy += (dy / dist) * f
      }

      // Spring home
      p.vx += (p.homeX - p.x) * 1.8 * dt
      p.vy += (p.homeY - p.y) * 1.8 * dt
      p.vx *= 0.91; p.vy *= 0.91
      p.x += p.vx; p.y += p.vy

      const homeDist = Math.sqrt((p.x - p.homeX) ** 2 + (p.y - p.homeY) ** 2)
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)

      ctx.globalAlpha = Math.min(0.95, 0.4 + homeDist * 0.004 + speed * 0.02)
      ctx.font = p.font
      ctx.fillStyle = speed > 5 ? '#ff6644' : homeDist > 20 ? '#ff9966' : p.color
      ctx.fillText(p.char, p.x, p.y)
    }
    ctx.globalAlpha = 1

    // Mode indicator
    ctx.globalAlpha = 0.25; ctx.font = '11px "Courier New",monospace'; ctx.fillStyle = '#888'
    ctx.textAlign = 'center'
    ctx.fillText(mouse.down ? 'ATTRACT \u2014 release to explode' : 'REPEL', W / 2, H - 30)
    ctx.globalAlpha = 1
  },
})

// ─── Scene 5: Typewriter ────────────────────────────────────
// Click to change typing speed, drag to resize the max-width container

let typeSpeed = 30
let typeMaxWidth = 600
let typeDragging = false

scenes.push({
  name: 'Typewriter',
  hint: 'Click to cycle speed (slow/medium/fast) — drag left/right to resize the text container width',
  init() {
    typeSpeed = 30; typeMaxWidth = Math.min(600, W - 100); typeDragging = false
  },
  draw(time, dt) {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    // Drag to resize
    if (mouse.down) {
      if (!typeDragging) typeDragging = true
      typeMaxWidth = Math.max(150, Math.min(W - 60, typeMaxWidth + mouse.dragX * 1.5))
      mouse.dragX = 0; mouse.dragY = 0
    } else {
      if (typeDragging) {
        typeDragging = false
        // Click (no significant drag) cycles speed
      }
    }

    const fullText = "In the age of AI, text layout was the last and biggest bottleneck for unlocking much more interesting UIs. Pretext solves this with pure TypeScript \u2014 canvas-based measurement, pure arithmetic layout. \u6625\u5929\u5230\u4e86. \u0628\u062f\u0623\u062a \u0627\u0644\u0631\u062d\u0644\u0629 \ud83d\ude80 No longer do we have to choose between flashy WebGL and practical blog articles. prepare() once, layout() on every resize. ~0.0002ms per call. CJK, Arabic, emoji, bidi \u2014 all handled. npm install @chenglou/pretext"

    const visibleChars = ((time * typeSpeed) % (fullText.length + 60)) | 0
    const text = fullText.slice(0, Math.min(visibleChars, fullText.length))
    const font = '16px "Courier New",monospace'
    const maxWidth = typeMaxWidth
    const lineHeight = 24
    const startX = (W - maxWidth) / 2
    const startY = H * 0.12

    try {
      const prepared = prepareWithSegments(text, font)
      const result = layoutWithLines(prepared, maxWidth, lineHeight)

      ctx.font = font; ctx.textBaseline = 'top'

      // Container outline
      ctx.globalAlpha = 0.08; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1
      ctx.strokeRect(startX, startY, maxWidth, Math.max(lineHeight, result.height))
      ctx.globalAlpha = 1

      // Draw resize handles
      ctx.globalAlpha = typeDragging ? 0.5 : 0.2; ctx.fillStyle = '#ff8844'
      ctx.fillRect(startX - 3, startY, 3, result.height || lineHeight)
      ctx.fillRect(startX + maxWidth, startY, 3, result.height || lineHeight)
      ctx.globalAlpha = 1

      for (let li = 0; li < result.lines.length; li++) {
        const line = result.lines[li]
        const y = startY + li * lineHeight

        let x = startX
        let prevCharCount = 0
        for (let pli = 0; pli < li; pli++) prevCharCount += result.lines[pli].text.length

        for (let ci = 0; ci < line.text.length; ci++) {
          const char = line.text[ci]
          const cw = ctx.measureText(char).width
          const charAge = visibleChars - prevCharCount - ci
          const isNew = charAge >= 0 && charAge < 3
          const bounce = isNew ? Math.sin(time * 20) * 2 : 0

          // Mouse highlight — characters near cursor glow
          const dx = (x + cw / 2) - mouse.x, dy = (y + lineHeight / 2) - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const near = dist < 80 ? (1 - dist / 80) : 0

          ctx.globalAlpha = 0.75 + near * 0.25
          ctx.fillStyle = isNew ? '#ffffff' : near > 0.3 ? '#ff8844' : '#cccccc'
          ctx.fillText(char, x, y + bounce)
          x += cw
        }

        // Line width indicator
        ctx.globalAlpha = 0.04; ctx.fillStyle = '#ff8844'
        ctx.fillRect(startX, y, line.width, lineHeight)
      }

      // Cursor blink
      if (text.length < fullText.length) {
        const lastLine = result.lines[result.lines.length - 1]
        const cursorX = startX + (lastLine?.width ?? 0)
        const cursorY = startY + (result.lines.length - 1) * lineHeight
        if (Math.sin(time * 6) > 0) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#ff8844'
          ctx.fillRect(cursorX + 2, cursorY, 2, lineHeight - 4)
        }
      }

      // Stats
      ctx.globalAlpha = 0.4; ctx.font = '11px "Courier New",monospace'; ctx.fillStyle = '#888'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(
        `${text.length} chars | ${result.lineCount} lines | height: ${result.height}px | width: ${Math.round(maxWidth)}px | speed: ${typeSpeed} ch/s`,
        startX, startY + result.height + 16,
      )

      // Shrinkwrap
      let widest = 0
      walkLineRanges(prepared, maxWidth, (line) => { if (line.width > widest) widest = line.width })
      ctx.globalAlpha = 0.12; ctx.strokeStyle = '#ff8844'
      ctx.setLineDash([4, 4]); ctx.strokeRect(startX - 1, startY - 1, widest + 2, result.height + 2)
      ctx.setLineDash([])

      ctx.globalAlpha = 0.2; ctx.font = '10px "Courier New",monospace'; ctx.fillStyle = '#ff8844'
      ctx.fillText(`shrinkwrap: ${Math.round(widest)}px`, startX, startY + result.height + 36)

      // Speed buttons
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const speeds = [{ label: 'SLOW', val: 10 }, { label: 'MED', val: 30 }, { label: 'FAST', val: 80 }, { label: 'LUDICROUS', val: 200 }]
      for (let si = 0; si < speeds.length; si++) {
        const bx = startX + si * 90, by = startY + result.height + 60
        const active = typeSpeed === speeds[si].val
        ctx.globalAlpha = active ? 0.7 : 0.25
        ctx.font = '11px "Courier New",monospace'
        ctx.fillStyle = active ? '#ff8844' : '#666'
        ctx.fillText(speeds[si].label, bx + 35, by)
      }
    } catch { /* skip */ }

    ctx.globalAlpha = 1
  },
})

// ─── Speed cycling via keyboard ─────────────────────────────

addEventListener('keydown', (e) => {
  if (activeScene === 4 && (e.key === ' ' || e.key === 's')) {
    const speeds = [10, 30, 80, 200]
    const idx = speeds.indexOf(typeSpeed)
    typeSpeed = speeds[(idx + 1) % speeds.length]
  }
})

// Click handler for speed buttons in typewriter scene
addEventListener('click', (e) => {
  if (activeScene !== 4) return
  const speeds = [{ val: 10 }, { val: 30 }, { val: 80 }, { val: 200 }]
  const maxWidth = typeMaxWidth
  const startX = (W - maxWidth) / 2

  // Quick heuristic: check if click is in the speed button area
  const cy = e.clientY - NAV_H
  // This is approximate — speed buttons are at result.height + 60
  if (cy > H * 0.6) {
    for (let si = 0; si < speeds.length; si++) {
      const bx = startX + si * 90 + 35
      if (Math.abs(e.clientX - bx) < 40 && Math.abs(cy - (H * 0.7)) < 20) {
        typeSpeed = speeds[si].val
        return
      }
    }
    // General click cycles speed
    const allSpeeds = [10, 30, 80, 200]
    const idx = allSpeeds.indexOf(typeSpeed)
    typeSpeed = allSpeeds[(idx + 1) % allSpeeds.length]
  }
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
  btn.className = 'scene-btn'; btn.textContent = scenes[i].name
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

document.fonts.ready.then(() => { scenes[activeScene].init(); requestAnimationFrame(frame) })
