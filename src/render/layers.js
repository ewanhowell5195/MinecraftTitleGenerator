const ROUNDING = 2
const BAND = 128
const MOST_REMOVED = 5

function paintOrder(entry) {
  return (entry.solid ?? entry.outline).renderOrder
}

export function paintedLines(entries) {
  const shown = Array.from(entries).filter(([, entry]) => entry.group.visible && (entry.solid || entry.outline)).sort((a, b) => paintOrder(a[1]) - paintOrder(b[1]))
  return Array.from(Map.groupBy(shown, ([, entry]) => entry.line).values(), words => words.map(([id]) => id))
}

function hide(object, undo) {
  if (!object) return
  const { visible } = object
  object.visible = false
  undo.push(() => object.visible = visible)
}

function onlyDepth(entry, undo) {
  for (const material of entry.materials) {
    const { colorWrite } = material
    material.colorWrite = false
    undo.push(() => material.colorWrite = colorWrite)
  }
}

export function showLayer(entries, { ids, below }) {
  const undo = []
  for (const [id, entry] of entries) {
    if (ids) hide(entry.halo, undo)
    if (!ids?.includes(id)) hide(entry.outline, undo)
    if (ids?.includes(id)) continue
    if (below?.includes(id)) {
      onlyDepth(entry, undo)
      continue
    }
    hide(entry.solid, undo)
    if (ids) hide(entry.holes, undo)
  }
  return () => undo.forEach(step => step())
}

function over(stack, pixels, at) {
  const opacity = pixels[at + 3]
  if (!opacity) return
  const alpha = opacity / 255
  const left = 1 - alpha
  stack[0] = stack[0] * left + pixels[at] * alpha
  stack[1] = stack[1] * left + pixels[at + 1] * alpha
  stack[2] = stack[2] * left + pixels[at + 2] * alpha
  stack[3] = stack[3] * left + opacity
}

function matches(stack, target, at) {
  const opacity = target[at + 3]
  const alpha = opacity / 255
  if (Math.abs(stack[3] - opacity) > ROUNDING) return false
  return Math.abs(stack[0] - target[at] * alpha) <= ROUNDING && Math.abs(stack[1] - target[at + 1] * alpha) <= ROUNDING && Math.abs(stack[2] - target[at + 2] * alpha) <= ROUNDING
}

function needed(target, layers, index, at) {
  const alpha = target[at + 3] / 255
  const wanted = [target[at] * alpha, target[at + 1] * alpha, target[at + 2] * alpha, target[at + 3]]
  for (let i = layers.length - 1; i > index; i--) {
    const cover = layers[i][at + 3] / 255
    if (cover === 1) return null
    for (let c = 0; c < 3; c++) wanted[c] = (wanted[c] - layers[i][at + c] * cover) / (1 - cover)
    wanted[3] = (wanted[3] - layers[i][at + 3]) / (1 - cover)
  }
  const [, , , opacity] = wanted
  const spare = ROUNDING * 2
  if (opacity <= 0 || opacity > 255 + spare || wanted.slice(0, 3).some(value => value < -spare || value > opacity + spare)) return null
  return [0, 1, 2].map(c => wanted[c] / opacity * 255).concat(opacity)
}

function removable(target, layers, used, at) {
  if (used.length < 2 || used.length > MOST_REMOVED) return null
  const sets = Array.from({ length: 2 ** used.length - 2 }, (_, bits) => used.filter((index, place) => bits + 1 >> place & 1)).sort((a, b) => a.length - b.length)
  return sets.find(removed => {
    const stack = [0, 0, 0, 0]
    layers.forEach((layer, index) => removed.includes(index) || over(stack, layer, at))
    return matches(stack, target, at)
  }) ?? null
}

function clearPixel(layer, at) {
  layer.fill(0, at, at + 4)
}

function nearest(layers, at, width) {
  for (let i = layers.length - 1; i >= 0; i--) {
    if ([at - 4, at + 4, at - width * 4, at + width * 4].some(near => layers[i][near + 3])) return i
  }
  return layers.length - 1
}

function correct(target, layers, at, width) {
  if (!target[at + 3]) return layers.forEach(layer => clearPixel(layer, at))
  const used = layers.map((layer, index) => index).filter(index => layers[index][at + 3]).sort((a, b) => layers[b][at + 3] - layers[a][at + 3] || b - a)
  const removed = removable(target, layers, used, at)
  if (removed) return removed.forEach(index => clearPixel(layers[index], at))
  const tried = used.map(index => ({ index, pixel: needed(target, layers, index, at) })).find(({ pixel }) => pixel)
  const { index, pixel } = tried ?? { index: used.length ? Math.max(...used) : nearest(layers, at, width), pixel: Array.from(target.subarray(at, at + 4)) }
  layers[index].set(pixel, at)
  if (layers[index][at + 3] < 255) layers.slice(0, index).forEach(layer => clearPixel(layer, at))
}

export function matchStack(target, layers, width) {
  const stack = new Float64Array(4)
  let changed = false
  for (let at = 0; at < target.length; at += 4) {
    stack.fill(0)
    for (let i = 0; i < layers.length; i++) over(stack, layers[i], at)
    if (matches(stack, target, at)) continue
    correct(target, layers, at, width)
    changed = true
  }
  return changed
}

export async function matchImages(image, layers, signal) {
  const { width, height } = image
  let last = performance.now()
  const contexts = layers.map(layer => layer.getContext("2d"))
  for (let y = 0; y < height; y += BAND) {
    if (performance.now() - last > 100) {
      await new Promise(resolve => setTimeout(resolve))
      signal.throwIfAborted()
      last = performance.now()
    }
    const rows = Math.min(BAND, height - y)
    const target = image.getContext("2d").getImageData(0, y, width, rows).data
    const bands = contexts.map(ctx => ctx.getImageData(0, y, width, rows))
    if (matchStack(target, bands.map(band => band.data), width)) bands.forEach((band, index) => contexts[index].putImageData(band, 0, y))
  }
}
