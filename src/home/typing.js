import { MAX_LETTERS, checkLetters, clamped, context, frames, image, multiply, overshoot, renderer, restBounds } from "./baked.js"

const VERTEX = `
attribute vec3 position;
attribute float letter;
attribute vec2 uv;
uniform mat4 matrix;
uniform vec4 poses[${MAX_LETTERS}];
uniform vec3 centres[${MAX_LETTERS}];
varying vec2 texel;
void main() {
  int index = int(letter);
  vec3 centre = centres[index];
  texel = uv;
  gl_Position = matrix * vec4(centre + (position / 64.0 - centre) * poses[index].w + poses[index].xyz, 1.0);
}`

const FRAGMENT = `
precision mediump float;
uniform sampler2D atlas;
uniform float cutoff;
varying vec2 texel;
void main() {
  vec4 colour = texture2D(atlas, texel);
  if (colour.a < cutoff) discard;
  gl_FragColor = vec4(colour.rgb / max(colour.a, 0.001), 1.0);
}`

const TYPE_GAP = 0.13
const SPACE_GAP = 0.1
const LINE_GAP = 0.2
const IN_TIME = 0.34
const IN_LIFT = 16
const IN_TOWARDS = 22
const HOLD_TIME = 2
const ERASE_GAP = 0.05
const OUT_TIME = 0.2
const OUT_DROP = 10
const NEXT_TIME = 0.25
const CENTRE_SPEED = 9
const FIT = 0.94

export async function startTyping(holder, signal) {
  const canvas = holder.querySelector("canvas")
  const gl = context(canvas, "the typing title", signal)
  const meta = await fetch("/home/typing.json", { signal }).then(response => {
    if (!response.ok) throw new Error(`failed to load the typing title: ${response.status}`)
    return response.json()
  })
  const loaded = await Promise.all(meta.phrases.map(phrase => Promise.all([fetch(`/home/typing/${phrase.name}.bin`, { signal }).then(response => response.arrayBuffer()), image(`/home/typing/${phrase.name}.png`)])))
  if (signal.aborted) return

  const scene = renderer(gl, canvas, VERTEX, FRAGMENT, ["matrix", "poses", "centres"])
  const base = multiply(meta.projection, meta.view)
  const phrases = meta.phrases.map((phrase, index) => {
    checkLetters(`the ${phrase.name} phrase`, phrase.glyphs)
    const [buffer, sheet] = loaded[index]
    const rest = restBounds(new Int16Array(buffer), base)
    const centres = new Float32Array(MAX_LETTERS * 3)
    const glyphs = phrase.glyphs.map((glyph, at) => {
      centres.set(glyph.centre, at * 3)
      return { ...glyph, in: 0, out: 0 }
    })
    let time = 0
    let next = 0
    for (const line of phrase.lines) {
      for (const character of line) {
        if (character === " ") {
          time += SPACE_GAP
          continue
        }
        glyphs[next++].in = time
        time += TYPE_GAP
      }
      time += LINE_GAP
    }
    const hold = time + HOLD_TIME
    for (let at = glyphs.length - 1; at >= 0; at--) glyphs[at].out = hold + (glyphs.length - 1 - at) * ERASE_GAP
    return { ...phrase, ...scene.model(buffer, sheet), rest, centres, glyphs, length: hold + glyphs.length * ERASE_GAP + OUT_TIME + NEXT_TIME }
  })
  const fit = phrases.find(phrase => phrase.name === meta.widest).rest.all
  const tallest = Math.max(...phrases.map(({ rest }) => rest.all.maxY - rest.all.minY))
  const poses = new Float32Array(MAX_LETTERS * 4)
  let index = 0
  let time = 0
  let centreShift = -(phrases[0].glyphs[0].min + phrases[0].glyphs[0].max) / 2

  function resize() {
    const box = canvas.getBoundingClientRect()
    if (!box.width) return
    scene.resize(box.width, box.height)
    const sx = Math.min(2 * FIT / (fit.maxX - fit.minX), 2 * FIT * box.height / box.width * meta.aspect / tallest)
    const sy = sx * box.width / box.height / meta.aspect
    for (const phrase of phrases) {
      const { minY, maxY } = phrase.rest.all
      phrase.clip = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -sx * (fit.minX + fit.maxX) / 2, -sy * (minY + maxY) / 2, 0, 1])
    }
  }

  function animate(delta) {
    time += delta
    if (time >= phrases[index].length) {
      time = 0
      index = (index + 1) % phrases.length
      const [first] = phrases[index].glyphs
      centreShift = -(first.min + first.max) / 2
    }
    const phrase = phrases[index]
    let right = phrase.glyphs[0].max
    for (const [at, glyph] of phrase.glyphs.entries()) {
      const typed = clamped((time - glyph.in) / IN_TIME)
      const erased = clamped((time - glyph.out) / OUT_TIME)
      if (!glyph.line && time >= glyph.in && time < glyph.out) right = glyph.max
      const away = (1 - typed) ** 2
      poses[at * 4] = 0
      poses[at * 4 + 1] = IN_LIFT * away - OUT_DROP * erased * erased
      poses[at * 4 + 2] = IN_TOWARDS * away
      poses[at * 4 + 3] = time < glyph.in ? 0 : (0.25 + 0.75 * overshoot(typed)) * (1 - erased * erased)
    }
    const target = -(phrase.glyphs[0].min + right) / 2
    centreShift += (target - centreShift) * (1 - Math.exp(-CENTRE_SPEED * delta))
  }

  function draw(now, delta) {
    animate(delta)
    const phrase = phrases[index]
    const shifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, centreShift, 0, 0, 1]
    scene.begin(phrase)
    gl.uniformMatrix4fv(scene.uniforms.matrix, false, multiply(phrase.clip, multiply(base, shifted)))
    gl.uniform4fv(scene.uniforms.poses, poses)
    gl.uniform3fv(scene.uniforms.centres, phrase.centres)
    for (const item of phrase.items) scene.drawItem(item)
    scene.finish()
    holder.classList.add("running")
  }

  frames(canvas, signal, { resize, draw, lost: () => holder.classList.remove("running") })
}
