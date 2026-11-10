import { FXAA_FRAGMENT, FXAA_VERTEX } from "../lib/fxaa.js"
import { MAX_BUFFER_SCALE, MAX_BUFFER_WIDTH, MIN_FRAME_TIME, VERTEX_BYTES, clamped, image, multiply, overshoot, program, restBounds, smoothTexture, uniformsOf } from "./baked.js"

const VERTEX = `
attribute vec3 position;
attribute float letter;
attribute vec2 uv;
uniform mat4 matrix;
uniform vec4 poses[24];
uniform vec3 centres[24];
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
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: "low-power" })
  if (!gl) throw new Error("the typing title needs WebGL")
  const meta = await fetch("/home/typing.json", { signal }).then(response => {
    if (!response.ok) throw new Error(`failed to load the typing title: ${response.status}`)
    return response.json()
  })
  const loaded = await Promise.all(meta.phrases.map(phrase => Promise.all([fetch(`/home/typing/${phrase.name}.bin`, { signal }).then(response => response.arrayBuffer()), image(`/home/typing/${phrase.name}.png`)])))
  if (signal.aborted) return

  const sceneProgram = program(gl, VERTEX, FRAGMENT)
  const postProgram = program(gl, FXAA_VERTEX, FXAA_FRAGMENT)
  const sceneUniforms = uniformsOf(gl, sceneProgram, ["matrix", "poses", "centres", "atlas", "cutoff"])
  const postUniforms = uniformsOf(gl, postProgram, ["scene", "pixel"])
  const position = gl.getAttribLocation(sceneProgram, "position")
  const letter = gl.getAttribLocation(sceneProgram, "letter")
  const uv = gl.getAttribLocation(sceneProgram, "uv")
  const corner = gl.getAttribLocation(postProgram, "position")
  const screenBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, screenBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

  const base = multiply(meta.projection, meta.view)
  const phrases = meta.phrases.map((phrase, index) => {
    const [buffer, sheet] = loaded[index]
    const vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW)
    const texture = gl.createTexture()
    smoothTexture(gl, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet)
    const rest = restBounds(new Int16Array(buffer), base)
    const centres = new Float32Array(24 * 3)
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
    return { ...phrase, vertexBuffer, texture, rest, centres, glyphs, length: hold + glyphs.length * ERASE_GAP + OUT_TIME + NEXT_TIME }
  })
  const fit = phrases.find(phrase => phrase.name === meta.widest).rest.all
  const tallest = Math.max(...phrases.map(({ rest }) => rest.all.maxY - rest.all.minY))
  const poses = new Float32Array(24 * 4)

  const sceneTexture = gl.createTexture()
  smoothTexture(gl, sceneTexture)
  const sceneDepth = gl.createRenderbuffer()
  const sceneBuffer = gl.createFramebuffer()
  gl.clearColor(0, 0, 0, 0)

  let visible = false
  let frame = 0
  let last = 0
  let index = 0
  let time = 0
  let centreShift = -(phrases[0].glyphs[0].min + phrases[0].glyphs[0].max) / 2

  function resize() {
    const box = canvas.getBoundingClientRect()
    if (!box.width) return
    const scale = Math.min(devicePixelRatio, MAX_BUFFER_SCALE, MAX_BUFFER_WIDTH / box.width)
    canvas.width = Math.round(box.width * scale)
    canvas.height = Math.round(box.height * scale)
    const sx = Math.min(2 * FIT / (fit.maxX - fit.minX), 2 * FIT * box.height / box.width * meta.aspect / tallest)
    const sy = sx * box.width / box.height / meta.aspect
    for (const phrase of phrases) {
      const { minY, maxY } = phrase.rest.all
      phrase.clip = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -sx * (fit.minX + fit.maxX) / 2, -sy * (minY + maxY) / 2, 0, 1])
    }
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneBuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepth)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
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

  function draw() {
    const phrase = phrases[index]
    const shifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, centreShift, 0, 0, 1]
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneBuffer)
    gl.useProgram(sceneProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, phrase.vertexBuffer)
    gl.enableVertexAttribArray(position)
    gl.enableVertexAttribArray(letter)
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(position, 3, gl.SHORT, false, VERTEX_BYTES, 0)
    gl.vertexAttribPointer(letter, 1, gl.SHORT, false, VERTEX_BYTES, 6)
    gl.vertexAttribPointer(uv, 2, gl.UNSIGNED_SHORT, true, VERTEX_BYTES, 8)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.uniformMatrix4fv(sceneUniforms.matrix, false, multiply(phrase.clip, multiply(base, shifted)))
    gl.uniform4fv(sceneUniforms.poses, poses)
    gl.uniform3fv(sceneUniforms.centres, phrase.centres)
    gl.uniform1i(sceneUniforms.atlas, 0)
    gl.bindTexture(gl.TEXTURE_2D, phrase.texture)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    for (const item of phrase.items) {
      gl.colorMask(!item.clip, !item.clip, !item.clip, !item.clip)
      gl.cullFace(item.shell ? gl.FRONT : gl.BACK)
      gl.depthMask(!item.shell)
      gl.uniform1f(sceneUniforms.cutoff, item.alphaTest / 2)
      gl.drawArrays(gl.TRIANGLES, item.start, item.count)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(postProgram)
    gl.disableVertexAttribArray(letter)
    gl.disableVertexAttribArray(uv)
    gl.bindBuffer(gl.ARRAY_BUFFER, screenBuffer)
    gl.enableVertexAttribArray(corner)
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.colorMask(true, true, true, true)
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
    gl.uniform1i(postUniforms.scene, 0)
    gl.uniform2f(postUniforms.pixel, 1 / canvas.width, 1 / canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function tick(now) {
    frame = 0
    if (!visible) return
    frame = requestAnimationFrame(tick)
    if (!last) last = now - MIN_FRAME_TIME
    if (now - last < MIN_FRAME_TIME) return
    const delta = Math.min(0.05, (now - last) / 1000)
    last = now
    animate(delta)
    draw()
    holder.classList.add("running")
  }

  const resizing = new ResizeObserver(resize)
  resizing.observe(canvas)
  const showing = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) last = 0
    if (visible && !frame) frame = requestAnimationFrame(tick)
  })
  showing.observe(canvas)
  signal.addEventListener("abort", () => {
    resizing.disconnect()
    showing.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    visible = false
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  })
  resize()
}
