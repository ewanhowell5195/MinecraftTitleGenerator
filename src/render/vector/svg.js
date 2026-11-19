import { FillRule, difference, intersectD, union, unionD } from "@countertype/clipper2-ts"
import { placement } from "../compose.js"
import { addToCover, visibleLoops } from "./cover.js"
import { loopsInHundredths, number, writePath } from "./pathData.js"
import { signedArea } from "../../lib/core/maths.js"
import { boxOfPolygons, boxesOverlap, mergedByFill, sameWinding, shapeOfPolygons, shapesOverlap, sharedEdges } from "./polygons.js"
import { stitched, unionOf } from "./union.js"

const SEAM_PRECISION = 4
const GROW = 0.05

function grownOutward(polygon) {
  const middleX = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length
  const middleY = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length
  return polygon.map(([x, y]) => {
    const length = Math.hypot(x - middleX, y - middleY) || 1
    return [x + (x - middleX) / length * GROW, y + (y - middleY) / length * GROW]
  })
}

function basesJoinedToLayers(list, placed) {
  function movedUp(fill, polygon) {
    const at = placed.findIndex(entry => entry[0] === fill)
    if (at < 0) return false
    const shape = shapeOfPolygons([polygon])
    if (list.concat(placed.slice(0, at)).some(([other, polygons]) => other !== fill && shapesOverlap(shapeOfPolygons(polygons), shape))) return false
    placed[at][1].push(polygon)
    return true
  }
  return list.map(([fill, polygons]) => [fill, polygons.filter(polygon => !movedUp(fill, polygon))]).filter(([, polygons]) => polygons.length)
}

function aroundStrokes(polygons, strokes, bleed) {
  const boxes = strokes.flatMap(([, segments]) => segments.map(segment => {
    const { minX, minY, maxX, maxY } = boxOfPolygons([segment])
    return { minX: minX - bleed, minY: minY - bleed, maxX: maxX + bleed, maxY: maxY + bleed }
  }))
  return polygons.filter(polygon => {
    const box = boxOfPolygons([polygon])
    return boxes.some(other => boxesOverlap(box, other))
  }).map(grownOutward)
}

function stripsAlong(segments, width) {
  return segments.map(([[ax, ay], [bx, by]]) => {
    const length = Math.hypot(bx - ax, by - ay) || 1
    const nx = (ay - by) / length * width / 2
    const ny = (bx - ax) / length * width / 2
    return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]
  })
}

function toPaths(polygons) {
  return polygons.map(polygon => polygon.map(([x, y]) => ({ x, y })))
}

function fromPaths(paths) {
  return paths.map(path => path.map(({ x, y }) => [x, y]))
}

function seamsOf(list, bleed, output) {
  const strokes = list.length > 1 ? Array.from(sharedEdges(list)).sort((a, b) => output.brightness(a[0]) - output.brightness(b[0])) : []
  if (!strokes.length) return []
  const areas = list.map(([, polygons]) => toPaths(aroundStrokes(polygons, strokes, bleed))).filter(paths => paths.length)
  return strokes.map(([fill, segments]) => {
    const strips = toPaths(stripsAlong(segments, bleed))
    return [fill, fromPaths(areas.flatMap(area => intersectD(strips, area, FillRule.NonZero, SEAM_PRECISION))).map(sameWinding)]
  }).filter(([, polygons]) => polygons.length)
}

export function entriesOf({ base, layers, joins, covers }, { bleed, output, totals }) {
  const list = Array.from(base)
  const placed = mergedByFill(layers, totals)
  return seamsOf(list, bleed, output).concat(basesJoinedToLayers(list, placed), placed, mergedByFill(joins, totals), Array.from(covers))
}

function filledArea(polygons) {
  if (polygons.every(polygon => signedArea(polygon) > 0)) return polygons
  return fromPaths(unionD(toPaths(polygons), FillRule.NonZero, SEAM_PRECISION))
}

function pathMarkup(fill, loops) {
  return loops.length ? `<path fill="${fill}" d="${writePath(loops)}"/>` : ""
}

function sinkToSameFill(shapes) {
  for (const [later, shape] of shapes.entries()) {
    if (!shape.shown.length) continue
    const target = shapes.findIndex(other => other.fill === shape.fill && other.shown.length)
    if (target >= later) continue
    const area = toPaths(shape.loops)
    const box = boxOfPolygons(shape.loops)
    const cut = []
    for (const other of shapes.slice(target + 1, later)) {
      if (!other.shown.length || other.fill === shape.fill || !boxesOverlap(boxOfPolygons(other.shown), box)) continue
      cut.push({ other, shown: fromPaths(difference(toPaths(other.shown), area, FillRule.NonZero)), loops: fromPaths(difference(toPaths(other.loops), area, FillRule.NonZero)) })
    }
    const joined = fromPaths(union(toPaths(shapes[target].shown), toPaths(shape.shown), FillRule.NonZero))
    const before = pathMarkup(shape.fill, shapes[target].shown).length + pathMarkup(shape.fill, shape.shown).length + cut.reduce((sum, { other }) => sum + pathMarkup(other.fill, other.shown).length, 0)
    const after = pathMarkup(shape.fill, joined).length + cut.reduce((sum, { other, shown }) => sum + pathMarkup(other.fill, shown).length, 0)
    if (after >= before) continue
    shapes[target].shown = joined
    shapes[target].loops = fromPaths(union(toPaths(shapes[target].loops), area, FillRule.NonZero))
    shape.shown = []
    for (const { other, shown, loops } of cut) {
      other.shown = shown
      other.loops = loops
    }
  }
  return shapes
}

export function markupOf(entries, { left, top, totals, cover }) {
  const source = new Map(entries.flatMap(([, polygons], index) => polygons.map(polygon => [polygon, index])))
  const shapes = []
  for (const [fill, polygons] of mergedByFill(entries, totals).toReversed()) {
    const filled = Array.from(Map.groupBy(polygons, polygon => source.get(polygon)).values()).flatMap(filledArea)
    const loops = unionOf(stitched(loopsInHundredths(filled, left, top)))
    shapes.unshift({ fill, loops, shown: visibleLoops(loops, cover) })
    addToCover(cover, loops)
  }
  return sinkToSameFill(shapes).map(({ fill, shown }) => pathMarkup(fill, shown)).join("")
}

function svgOf(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg"${content.includes("xlink:href") ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`
}

function titleGroup(title, x, y, scale) {
  const ratio = Math.round(scale * 1e6) / 1e6
  return x || y || ratio !== 1 ? `<g transform="translate(${number(x)} ${number(y)}) scale(${ratio})">${title.markup}</g>` : title.markup
}

function backgroundOf({ line: [from, to], stops }, width, height) {
  const offsets = stops.map(stop => `<stop offset="${stop.position}" stop-color="${stop.colour}"/>`).join("")
  return `<defs><linearGradient id="background" gradientUnits="userSpaceOnUse" x1="${number(from[0])}" y1="${number(from[1])}" x2="${number(to[0])}" y2="${number(to[1])}">${offsets}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#background)"/>`
}

export function composeVector(title, settings) {
  const { width, height, ratio, x, y, background } = placement(title, settings)
  return svgOf(width, height, (background ? backgroundOf(background, width, height) : "") + titleGroup(title, x, y, ratio))
}
