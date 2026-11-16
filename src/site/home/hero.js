import { MAX_LETTERS, checkLetters, clamped, context, frames, image, multiply, overshoot, renderer, restBounds, turned } from "./baked.js"

const SCENE_VERTEX = `
attribute vec3 position;
attribute float letter;
attribute vec2 uv;
uniform mat4 matrix;
uniform vec3 offsets[${MAX_LETTERS}];
varying vec2 texel;
varying float height;
void main() {
  vec3 placed = position / 64.0 + offsets[int(letter)];
  texel = uv;
  height = placed.y;
  gl_Position = matrix * vec4(placed, 1.0);
}`

const SCENE_FRAGMENT = `
precision mediump float;
uniform sampler2D atlas;
uniform float cutoff;
uniform float ceiling;
varying vec2 texel;
varying float height;
void main() {
  vec4 colour = texture2D(atlas, texel);
  if (colour.a < cutoff || height > ceiling) discard;
  gl_FragColor = vec4(colour.rgb / max(colour.a, 0.001), 1.0);
}`

const TOP_LINE = 2
const FALL_HEIGHT = 170
const FALL_TIME = 0.5
const FALL_GAP = 0.075
const RISE_HEIGHT = 64
const RISE_TIME = 0.42
const RISE_GAP = 0.035
const LANDED = 0.7
const HOVER_LIFT = 2.2
const HOP_TIME = 0.38
const WAITING = 4000
const TURN_X = 0.06
const TURN_Y = 0.11
const FOLLOW_SPEED = 4.5
const ENGAGE_TIME = 1.6
const PICK_EVERY = 12
const INPUT_DELAY = 1
const PICK_SPACING = 10

function landing(progress) {
  if (progress >= 1) return 0
  if (progress < LANDED) return 1 - (progress / LANDED) ** 2
  return 0.05 * Math.sin(Math.PI * (progress - LANDED) / (1 - LANDED))
}

export async function startHero(canvas, stage, signal, lost) {
  const gl = context(canvas, "hero", signal)
  const [meta, buffer, sheet] = await Promise.all([
    fetch("/home/logo.json", { signal }).then(response => response.json()),
    fetch("/home/logo.bin", { signal }).then(response => response.arrayBuffer()),
    image("/home/logo.png")
  ])
  if (signal.aborted) return

  checkLetters("the logo", meta.glyphs)
  const scene = renderer(gl, canvas, SCENE_VERTEX, SCENE_FRAGMENT, ["matrix", "offsets", "ceiling"])
  const logo = scene.model(buffer, sheet)
  const base = multiply(meta.projection, meta.view)
  const vertices = new Int16Array(buffer)
  const screen = new Float32Array(vertices.length / 2)
  const rest = restBounds(vertices, base)
  const glyphs = meta.glyphs.map((glyph, index) => ({ ...glyph, index, hop: 0, touched: false }))
  const topLetters = glyphs.filter(glyph => glyph.word === TOP_LINE)
  const lowLetters = glyphs.filter(glyph => glyph.word !== TOP_LINE)
  const fallEnd = (topLetters.length - 1) * FALL_GAP + FALL_TIME * LANDED
  for (const [index, glyph] of topLetters.entries()) glyph.start = index * FALL_GAP
  for (const [index, glyph] of lowLetters.entries()) glyph.start = fallEnd + index * RISE_GAP
  const ceilings = meta.items.map(item => {
    if (item.word === TOP_LINE || item.clip) return 1e6
    let top = -1e6
    for (let index = 0; index < item.count; index++) top = Math.max(top, vertices[(item.start + index) * 6 + 1] / 64)
    return top
  })
  const offsets = new Float32Array(MAX_LETTERS * 3)
  const introEnd = Math.max(...lowLetters.map(glyph => glyph.start)) + RISE_TIME
  let clip = new Float32Array(16)
  let current = new Float32Array(16)
  let picks = 0
  let started = 0
  let sway = 0
  let underPointer = -1
  const pointer = { x: 0, y: 0, clientX: 0, clientY: 0, moved: false, active: false }
  const aim = { x: 0, y: 0, speedX: 0, speedY: 0 }
  let engaged = 0

  function resize() {
    const hero = canvas.getBoundingClientRect()
    const box = stage.getBoundingClientRect()
    scene.resize(hero.width, hero.height)
    const { all } = rest
    const sx = box.width / hero.width * 2 / (all.maxX - all.minX)
    const sy = sx * hero.width / hero.height / meta.aspect
    const targetX = (box.left + box.width / 2 - hero.left) / hero.width * 2 - 1
    const targetY = 1 - (box.top + box.height / 2 - hero.top) / hero.height * 2
    clip = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, targetX - sx * (all.minX + all.maxX) / 2, targetY - sy * (all.minY + all.maxY) / 2, 0, 1])
  }

  function animate(elapsed, delta) {
    for (const glyph of glyphs) {
      const top = glyph.word === TOP_LINE
      const progress = clamped((elapsed - glyph.start) / (top ? FALL_TIME : RISE_TIME))
      const entrance = top ? FALL_HEIGHT * landing(progress) : RISE_HEIGHT * (1 - overshoot(progress))
      const hovered = glyph.index === underPointer
      if ((hovered || glyph.touched) && glyph.hop > 0.5) glyph.hop = 1 - glyph.hop
      if (hovered || glyph.touched || glyph.hop > 0) {
        const next = glyph.hop + delta / HOP_TIME
        glyph.hop = hovered ? Math.min(next, 0.5) : next < 1 ? next : 0
      }
      glyph.touched = false
      const lift = HOVER_LIFT * Math.sin(Math.PI * glyph.hop)
      offsets[glyph.index * 3 + 1] = elapsed < glyph.start ? WAITING : entrance + lift
      offsets[glyph.index * 3 + 2] = top ? 0 : -6 * (1 - progress)
    }
  }

  function followPointer(delta) {
    engaged = clamped(engaged + (pointer.active ? delta : -delta) / ENGAGE_TIME)
    const weight = engaged * engaged * (3 - 2 * engaged)
    const decay = Math.exp(-FOLLOW_SPEED * delta)
    for (const [axis, speed] of [["x", "speedX"], ["y", "speedY"]]) {
      const offset = aim[axis] - pointer[axis] * weight
      const push = aim[speed] + FOLLOW_SPEED * offset
      aim[axis] = pointer[axis] * weight + (offset + push * delta) * decay
      aim[speed] = (aim[speed] - FOLLOW_SPEED * push * delta) * decay
    }
  }

  function drawScene() {
    const model = turned(aim.y * TURN_X + Math.sin(sway * 0.37) * 0.012, aim.x * TURN_Y + Math.sin(sway * 0.5) * 0.024, rest.centre)
    current = multiply(clip, multiply(base, model))
    scene.begin(logo)
    gl.uniformMatrix4fv(scene.uniforms.matrix, false, current)
    gl.uniform3fv(scene.uniforms.offsets, offsets)
    for (const [index, item] of meta.items.entries()) {
      gl.uniform1f(scene.uniforms.ceiling, ceilings[index])
      scene.drawItem(item)
    }
    scene.finish()
  }

  function projectAll() {
    for (let vertex = 0; vertex < screen.length / 3; vertex++) {
      const at = vertex * 6
      const [x, y, z] = [vertices[at] / 64, vertices[at + 1] / 64, vertices[at + 2] / 64]
      const w = current[3] * x + current[7] * y + current[11] * z + current[15]
      screen[vertex * 3] = (current[0] * x + current[4] * y + current[8] * z + current[12]) / w
      screen[vertex * 3 + 1] = (current[1] * x + current[5] * y + current[9] * z + current[13]) / w
      screen[vertex * 3 + 2] = (current[2] * x + current[6] * y + current[10] * z + current[14]) / w
    }
  }

  function letterAt(px, py) {
    let found = -1
    let nearest = Infinity
    for (const item of meta.items) {
      if (item.clip) continue
      for (let vertex = item.start; vertex < item.start + item.count; vertex += 3) {
        const at = vertex * 3
        const [ax, ay] = [screen[at], screen[at + 1]]
        const [bx, by] = [screen[at + 3], screen[at + 4]]
        const [cx, cy] = [screen[at + 6], screen[at + 7]]
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if (!area || area > 0 === item.shell) continue
        const b = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) / area
        const c = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / area
        if (b < 0 || c < 0 || b + c > 1) continue
        const depth = screen[at + 2] + (screen[at + 5] - screen[at + 2]) * b + (screen[at + 8] - screen[at + 2]) * c
        if (depth >= nearest) continue
        found = vertices[vertex * 6 + 3]
        if (!item.shell) nearest = depth
      }
    }
    return found
  }

  function pick() {
    const hero = canvas.getBoundingClientRect()
    const { clientX, clientY, lastX = clientX, lastY = clientY } = pointer
    const steps = Math.max(1, Math.ceil(Math.hypot(clientX - lastX, clientY - lastY) / PICK_SPACING))
    projectAll()
    for (let step = 1; step <= steps; step++) {
      const x = lastX + (clientX - lastX) * step / steps
      const y = lastY + (clientY - lastY) * step / steps
      const letter = letterAt((x - hero.left) / hero.width * 2 - 1, 1 - (y - hero.top) / hero.height * 2)
      if (letter >= 0) glyphs[letter].touched = true
      if (step === steps) underPointer = letter
    }
    pointer.lastX = clientX
    pointer.lastY = clientY
  }

  function draw(now, delta) {
    if (!started) started = now - delta * 1000
    const elapsed = (now - started) / 1000
    sway += delta
    animate(elapsed, delta)
    followPointer(delta)
    drawScene()
    if (pointer.active && (pointer.moved || picks++ % PICK_EVERY === 0)) {
      pointer.moved = false
      pick()
    }
  }

  addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || !started || performance.now() - started < (introEnd + INPUT_DELAY) * 1000) return
    const box = stage.getBoundingClientRect()
    pointer.x = clamped((event.clientX - box.left) / box.width) * 2 - 1
    pointer.y = clamped((event.clientY - box.top) / box.height) * 2 - 1
    pointer.clientX = event.clientX
    pointer.clientY = event.clientY
    pointer.moved = true
    pointer.active = true
  }, { passive: true, signal })
  document.documentElement.addEventListener("mouseleave", () => {
    pointer.active = false
    pointer.lastX = undefined
    pointer.lastY = undefined
    underPointer = -1
  }, { signal })
  frames(canvas, signal, { resize, draw, lost })
}
