import { frameRect, frameSplit, framing } from "#render/framing.js"
import { image } from "#lib/texture/assets.js"
import { linearGradient } from "#lib/texture/canvas.js"
import { gradientLine, gradientStops } from "#lib/texture/colourStops.js"

const CLEAR = "rgba(0, 0, 0, 0)"

let legacy = null

function legacyTitle() {
  if (!legacy) {
    legacy = { image: null }
    image("render/legacy-title.png").then(loaded => (legacy.image = loaded)).catch(err => {
      legacy = null
      console.error(err)
    })
  }
  return legacy.image
}

function backgroundOf(node) {
  for (let at = node; at; at = at.parentElement) {
    const { backgroundColor } = getComputedStyle(at)
    if (backgroundColor !== CLEAR) return backgroundColor
  }
  return "#000000"
}

function fillOf(ctx, { left, top, width, height }) {
  if (framing.tab === "minecraft" || !framing.backgroundEnabled) return null
  const [from, to] = gradientLine(left, top, width, height, framing.backgroundAngle)
  return linearGradient(ctx, ...from, ...to, gradientStops(framing.backgroundStops, framing.backgroundSmooth, framing.backgroundMix))
}

export function createFrame(preview) {
  const canvas = document.createElement("canvas")
  canvas.className = "mtg-frame"
  const ctx = canvas.getContext("2d")
  preview.canvas.after(canvas)

  function show(left, width, [x, y]) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(left + x, 0, width, preview.height)
    ctx.clip()
    ctx.drawImage(preview.canvas, x, y, preview.width, preview.height)
    ctx.restore()
  }

  function paint(title) {
    const { width, height } = preview
    const rect = frameRect(title)
    const split = frameSplit(title)
    const fill = fillOf(ctx, rect)
    const base = framing.tab === "minecraft" && framing.mode === "1.19" ? legacyTitle() : null
    if (split) {
      ctx.fillStyle = backgroundOf(preview.node)
      ctx.fillRect(0, 0, width, height)
    }
    if (fill) {
      ctx.fillStyle = fill
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height)
    }
    if (base) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(base, rect.left, rect.top, rect.width, rect.height)
      ctx.imageSmoothingEnabled = true
    }
    if (split) {
      show(0, split.x, [0, 0])
      show(split.x, width - split.x, split.shift)
    } else if (fill) show(0, width, [0, 0])
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.fillStyle = "#0000008c"
    ctx.fill("evenodd")
    ctx.strokeStyle = "#ffffff80"
    ctx.strokeRect(rect.left - 0.5, rect.top - 0.5, rect.width + 1, rect.height + 1)
  }

  function draw(title) {
    const { width, height } = preview
    const ratio = window.devicePixelRatio
    const [wide, tall] = [width, height].map(side => Math.round(side * ratio))
    if (canvas.width !== wide) canvas.width = wide
    if (canvas.height !== tall) canvas.height = tall
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (title) paint(title)
  }

  return { draw, remove: () => canvas.remove() }
}
