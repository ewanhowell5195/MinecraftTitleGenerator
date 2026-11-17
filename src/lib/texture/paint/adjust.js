import { surface } from "../canvas.js"
import { packed } from "../../core/colour.js"
import { gradientStops } from "../material.js"
import { remember } from "../../core/maths.js"
import { CACHED_OVERLAYS } from "./draw.js"

const adjustedColours = new Map()

export function adjustmentsOf(look) {
  return [look.hue, look.saturation, look.brightness, look.contrast, look.blend, look.colour, look.colourOpacity]
}

export function paintedStops(look) {
  const stops = gradientStops(look.stops, look.smooth)
  const data = remember(adjustedColours, JSON.stringify([stops, adjustmentsOf(look)]), () => {
    const row = surface(stops.length, 1)
    for (const [index, stop] of stops.entries()) {
      row.ctx.fillStyle = stop.colour
      row.ctx.fillRect(index, 0, 1, 1)
    }
    return adjusted(row.canvas, look, { willReadFrequently: true }).ctx.getImageData(0, 0, stops.length, 1).data
  }, CACHED_OVERLAYS)
  return stops.map((stop, index) => ({ position: stop.position, colour: packed(data, index * 4) }))
}

function filtered(look) {
  return look.hue % 360 !== 0 || look.saturation !== 100 || look.brightness !== 100 || look.contrast !== 100
}

function tinted(look) {
  return look.colourOpacity > 0 && !(look.blend === "multiply" && /^#f{3}(f{3})?$/i.test(look.colour))
}

export function adjusted(source, look, options) {
  const out = surface(source.width, source.height, options)
  if (filtered(look)) out.ctx.filter = `hue-rotate(${look.hue}deg) saturate(${look.saturation}%) brightness(${look.brightness}%) contrast(${look.contrast}%)`
  out.ctx.drawImage(source, 0, 0)
  out.ctx.filter = "none"
  if (!tinted(look)) return out
  out.ctx.globalCompositeOperation = look.blend
  out.ctx.globalAlpha = look.colourOpacity / 100
  out.ctx.fillStyle = look.colour
  out.ctx.fillRect(0, 0, source.width, source.height)
  out.ctx.globalAlpha = 1
  out.ctx.globalCompositeOperation = "destination-in"
  out.ctx.drawImage(source, 0, 0)
  out.ctx.globalCompositeOperation = "source-over"
  return out
}

export function borderOf(look, assets) {
  return remember(adjustedColours, JSON.stringify(look.customBorder ? look.borderColour : [assets.border, adjustmentsOf(look)]), () => {
    const pixel = surface(1, 1, { willReadFrequently: true })
    pixel.ctx.fillStyle = look.customBorder ? look.borderColour : assets.border
    pixel.ctx.fillRect(0, 0, 1, 1)
    return (look.customBorder ? pixel : adjusted(pixel.canvas, look, { willReadFrequently: true })).ctx.getImageData(0, 0, 1, 1).data
  }, CACHED_OVERLAYS)
}
