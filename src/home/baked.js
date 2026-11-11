import { FXAA_FRAGMENT, FXAA_VERTEX } from "../lib/fxaa.js"

export const MAX_LETTERS = 24

const VERTEX_BYTES = 12
const MAX_BUFFER_WIDTH = 2800
const MAX_BUFFER_SCALE = 2
const MIN_FRAME_TIME = 1000 / 60 - 2
const CONTEXT = { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: "low-power" }

export function multiply(a, b) {
  const out = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
    }
  }
  return out
}

export function turned(x, y, centre) {
  const [sx, cx, sy, cy] = [Math.sin(x), Math.cos(x), Math.sin(y), Math.cos(y)]
  const spin = [cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1]
  const there = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, centre[0], centre[1], centre[2], 1]
  const back = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -centre[0], -centre[1], -centre[2], 1]
  return multiply(multiply(there, spin), back)
}

export function overshoot(progress) {
  const left = progress - 1
  return 1 + 2.7 * left ** 3 + 1.7 * left ** 2
}

export function clamped(value) {
  return Math.min(1, Math.max(0, value))
}

function program(gl, vertex, fragment) {
  const made = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader failed: ${gl.getShaderInfoLog(shader)}`)
    gl.attachShader(made, shader)
  }
  gl.linkProgram(made)
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) throw new Error(`shader failed: ${gl.getProgramInfoLog(made)}`)
  return made
}

export async function image(url) {
  const loaded = new Image()
  loaded.src = url
  await loaded.decode()
  return loaded
}

export function restBounds(vertices, base) {
  const all = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < vertices.length; index += 6) {
    const [x, y, z] = [vertices[index] / 64, vertices[index + 1] / 64, vertices[index + 2] / 64]
    for (const [axis, value] of [x, y, z].entries()) {
      min[axis] = Math.min(min[axis], value)
      max[axis] = Math.max(max[axis], value)
    }
    const w = base[3] * x + base[7] * y + base[11] * z + base[15]
    const screenX = (base[0] * x + base[4] * y + base[8] * z + base[12]) / w
    const screenY = (base[1] * x + base[5] * y + base[9] * z + base[13]) / w
    all.minX = Math.min(all.minX, screenX)
    all.maxX = Math.max(all.maxX, screenX)
    all.minY = Math.min(all.minY, screenY)
    all.maxY = Math.max(all.maxY, screenY)
  }
  return { all, centre: min.map((value, axis) => (value + max[axis]) / 2) }
}

function uniformsOf(gl, made, names) {
  return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(made, name)]))
}

function smoothTexture(gl, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

export function checkLetters(name, glyphs) {
  if (glyphs.length > MAX_LETTERS) throw new Error(`${name} has ${glyphs.length} letters, but the shaders only hold ${MAX_LETTERS}`)
}

export function context(canvas, name, signal) {
  const gl = canvas.getContext("webgl", CONTEXT)
  if (!gl) throw new Error(`${name} needs WebGL`)
  signal.addEventListener("abort", () => gl.getExtension("WEBGL_lose_context")?.loseContext())
  return gl
}

export function renderer(gl, canvas, vertex, fragment, names) {
  const sceneProgram = program(gl, vertex, fragment)
  const postProgram = program(gl, FXAA_VERTEX, FXAA_FRAGMENT)
  const uniforms = uniformsOf(gl, sceneProgram, names.concat("atlas", "cutoff"))
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
  const sceneTexture = gl.createTexture()
  smoothTexture(gl, sceneTexture)
  const sceneDepth = gl.createRenderbuffer()
  const sceneBuffer = gl.createFramebuffer()
  gl.clearColor(0, 0, 0, 0)

  function model(buffer, sheet) {
    const vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW)
    const texture = gl.createTexture()
    smoothTexture(gl, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet)
    return { vertexBuffer, texture }
  }

  function resize(width, height) {
    const scale = Math.min(devicePixelRatio, MAX_BUFFER_SCALE, MAX_BUFFER_WIDTH / width)
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
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

  function begin({ vertexBuffer, texture }) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneBuffer)
    gl.useProgram(sceneProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(position)
    gl.enableVertexAttribArray(letter)
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(position, 3, gl.SHORT, false, VERTEX_BYTES, 0)
    gl.vertexAttribPointer(letter, 1, gl.SHORT, false, VERTEX_BYTES, 6)
    gl.vertexAttribPointer(uv, 2, gl.UNSIGNED_SHORT, true, VERTEX_BYTES, 8)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.uniform1i(uniforms.atlas, 0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.depthMask(true)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  }

  function drawItem(item) {
    gl.colorMask(!item.clip, !item.clip, !item.clip, !item.clip)
    gl.cullFace(item.shell ? gl.FRONT : gl.BACK)
    gl.depthMask(!item.shell)
    gl.uniform1f(uniforms.cutoff, item.alphaTest / 2)
    gl.drawArrays(gl.TRIANGLES, item.start, item.count)
  }

  function finish() {
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

  return { uniforms, model, resize, begin, drawItem, finish }
}

export function frames(canvas, signal, { resize, draw, lost }) {
  let visible = false
  let request = 0
  let last = 0

  function tick(now) {
    request = 0
    if (!visible) return
    request = requestAnimationFrame(tick)
    if (!last) last = now - MIN_FRAME_TIME
    if (now - last < MIN_FRAME_TIME) return
    const delta = Math.min(0.05, (now - last) / 1000)
    last = now
    draw(now, delta)
  }

  function stop() {
    resizing.disconnect()
    showing.disconnect()
    cancelAnimationFrame(request)
    request = 0
    visible = false
  }

  const resizing = new ResizeObserver(resize)
  resizing.observe(canvas)
  const showing = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) last = 0
    if (visible && !request) request = requestAnimationFrame(tick)
  })
  showing.observe(canvas)
  signal.addEventListener("abort", stop)
  canvas.addEventListener("webglcontextlost", () => {
    stop()
    lost()
  }, { signal })
  resize()
}
