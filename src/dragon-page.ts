// Dragon page shell — injects the canvas + panel HTML, then loads the dragon engine

const app = document.getElementById('app')!
app.style.cursor = 'crosshair'

// Canvas
const canvas = document.createElement('canvas')
canvas.id = 'c'
app.appendChild(canvas)

// Hint
const hint = document.createElement('div')
hint.id = 'hint'
hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.2);font-size:12px;pointer-events:none;transition:opacity 0.8s;letter-spacing:0.04em'
hint.textContent = 'click & hold for fire \u2014 drag through text \u2014 press P for panel'
app.appendChild(hint)

// Panel toggle
const toggle = document.createElement('button')
toggle.id = 'panel-toggle'
toggle.title = 'Settings (P)'
toggle.textContent = '\u2699'
document.body.appendChild(toggle)

// Stats
const stats = document.createElement('div')
stats.id = 'stats'
document.body.appendChild(stats)

// Panel — built with DOM methods (no innerHTML)
function makeSection(title: string, children: HTMLElement[]): HTMLDivElement {
  const sec = document.createElement('div')
  sec.className = 'section'
  const t = document.createElement('div')
  t.className = 'section-title'
  t.textContent = title
  sec.appendChild(t)
  for (const c of children) sec.appendChild(c)
  return sec
}

function makeSlider(label: string, key: string, min: string, max: string, step: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'control-row'
  const lbl = document.createElement('span')
  lbl.className = 'control-label'
  lbl.textContent = label
  const input = document.createElement('input')
  input.type = 'range'
  input.dataset.key = key
  input.min = min; input.max = max; input.step = step
  const val = document.createElement('span')
  val.className = 'control-value'
  val.dataset.val = key
  row.append(lbl, input, val)
  return row
}

function makeToggle(label: string, key: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'toggle-row'
  const lbl = document.createElement('span')
  lbl.className = 'control-label'
  lbl.textContent = label
  const toggle = document.createElement('label')
  toggle.className = 'toggle'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.dataset.key = key
  const track = document.createElement('span')
  track.className = 'toggle-track'
  const thumb = document.createElement('span')
  thumb.className = 'toggle-thumb'
  toggle.append(cb, track, thumb)
  row.append(lbl, toggle)
  return row
}

const panel = document.createElement('div')
panel.id = 'panel'

// Header
const header = document.createElement('div')
header.className = 'panel-header'
const h2 = document.createElement('h2')
h2.textContent = 'Playground Controls'
const closeBtn = document.createElement('button')
closeBtn.id = 'panel-close'
closeBtn.title = 'Close'
closeBtn.textContent = '\u00d7'
header.append(h2, closeBtn)
panel.appendChild(header)

// Presets
const presetsDiv = document.createElement('div')
presetsDiv.className = 'presets'
presetsDiv.id = 'presets'
panel.appendChild(makeSection('Presets', [presetsDiv]))

// Dragon
panel.appendChild(makeSection('Dragon', [
  makeSlider('Segments', 'dragonSegments', '10', '80', '1'),
  makeSlider('Speed', 'dragonSpeed', '0.02', '0.4', '0.01'),
  makeSlider('Size', 'dragonScale', '0.3', '3', '0.1'),
  makeToggle('Wings', 'showWings'),
  makeToggle('Spines', 'showSpines'),
]))

// Physics
panel.appendChild(makeSection('Physics', [
  makeSlider('Push force', 'pushForce', '1', '30', '0.5'),
  makeSlider('Spring', 'springStrength', '0.002', '0.08', '0.001'),
  makeSlider('Damping', 'damping', '0.8', '0.99', '0.005'),
  makeSlider('Gravity', 'burnGravity', '0', '3', '0.1'),
]))

// Fire
panel.appendChild(makeSection('Fire', [
  makeSlider('Blast radius', 'fireRadius', '30', '250', '5'),
  makeSlider('Blast force', 'fireForce', '5', '50', '1'),
  makeToggle('Screen shake', 'screenShake'),
  makeToggle('Embers', 'showEmbers'),
  makeToggle('Particles', 'showParticles'),
]))

// Enemies
panel.appendChild(makeSection('Enemies', [
  makeToggle('Enabled', 'showEnemies'),
  makeSlider('Count', 'enemyCount', '1', '20', '1'),
  makeSlider('Speed', 'enemySpeed', '0.1', '2', '0.1'),
]))

// Atmosphere
panel.appendChild(makeSection('Atmosphere', [
  makeToggle('Runes', 'showRunes'),
  makeToggle('Custom cursor', 'showCursor'),
  makeSlider('Text opacity', 'textOpacity', '0', '1.5', '0.05'),
]))

document.body.appendChild(panel)

// Load the dragon engine
import('./dragon.ts')
