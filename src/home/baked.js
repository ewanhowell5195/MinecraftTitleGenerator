export const VERTEX_BYTES = 12
export const MAX_BUFFER_WIDTH = 2800
export const MAX_BUFFER_SCALE = 2
export const MIN_FRAME_TIME = 1000 / 60 - 2

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

export function program(gl, vertex, fragment) {
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

export function uniformsOf(gl, made, names) {
  return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(made, name)]))
}

export function smoothTexture(gl, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}
