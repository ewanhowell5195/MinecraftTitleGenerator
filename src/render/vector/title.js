import * as THREE from "three"
import { hexOfPacked } from "../../lib/core/colour.js"
import { SAMPLES, titleShot } from "../render.js"
import { colourTotals, within } from "./colours.js"
import { coverOf } from "./cover.js"
import { facesOf, firstMaterial, hideAll, occluderOf, split, withinConvex, worldMap } from "./faces.js"
import { Output, bandPlane, bandRuns, clippedToBand, fitGradient, halved, middleOf } from "./gradients.js"
import { joinsOf, outerPixels, trimmedBase } from "./joins.js"
import { addInOrder, addTo, area, boxOfPolygons, sameWinding, shapeOfPolygons, shapesOverlap } from "./polygons.js"
import { entriesOf, markupOf } from "./svg.js"

const SLIVER = 1e-3
const SHORT_GRADIENT = 1 / 512
const NEAR_FILLS = 2
const BLEED = 1 / 512
const BAND_OVERLAP = 0.5
const CROP_MARGIN = 1 / (SAMPLES * 2)
const FIT_ERROR = 1 / 4096
const SPACING_ERROR = 1 / 8192
const MAX_SPLITS = 5

function useMergedFills(layers, merged) {
  const renamed = entries => entries.map(([fill, polygons]) => [merged.get(fill) ?? fill, polygons])
  function renamedMap(map) {
    const next = new Map()
    for (const [fill, polygons] of map) addTo(next, merged.get(fill) ?? fill, polygons)
    return next
  }
  for (const layer of layers) {
    layer.base = renamedMap(layer.base)
    layer.covers = renamedMap(layer.covers)
    layer.layers = renamed(layer.layers)
    layer.joins = renamed(layer.joins)
  }
}

function nearFillsJoined(layers, totals, level, exact) {
  const used = new Set()
  for (const { base, layers: shapes, joins, covers } of layers) {
    for (const fill of Array.from(base.keys()).concat(shapes.map(entry => entry[0]), joins.map(entry => entry[0]), Array.from(covers.keys()))) {
      if (fill.startsWith("#")) used.add(fill)
    }
  }
  const kept = []
  const joined = new Map()
  for (const fill of Array.from(used).sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))) {
    const colour = parseInt(fill.slice(1), 16)
    const home = !exact.has(fill) && kept.find(other => within(parseInt(other.slice(1), 16), colour, level))
    if (home) joined.set(fill, home)
    else kept.push(fill)
  }
  return joined
}

function fillTotals(cache, bandFills) {
  const totals = new Map()
  for (const image of cache.values()) {
    for (const [colour, count] of colourTotals(image)) {
      const fill = hexOfPacked(colour)
      totals.set(fill, (totals.get(fill) ?? 0) + count)
    }
  }
  for (const fill of bandFills) totals.delete(fill)
  return totals
}

function polygonsOfLayer({ base, layers, joins, covers }) {
  return Array.from(base.values()).concat(layers.map(entry => entry[1]), joins.map(entry => entry[1]), Array.from(covers.values())).flat()
}

function joinToLayerBelow(below, layer) {
  if (below.layers.length || below.joins.length || below.covers.size || below.base.size !== 1) return
  const [[fill, polygons]] = below.base
  const shapes = Array.from(layer.base)
  const at = shapes.findIndex(entry => entry[0] === fill)
  if (at < 0) return
  const earlier = shapes.slice(0, at).map(entry => shapeOfPolygons(entry[1]))
  const kept = []
  const moved = polygons.map(sameWinding)
  for (const polygon of shapes[at][1]) {
    const shape = shapeOfPolygons([polygon])
    if (earlier.some(other => shapesOverlap(other, shape))) kept.push(polygon)
    else moved.push(sameWinding(polygon))
  }
  below.base.set(fill, moved)
  if (kept.length) layer.base.set(fill, kept)
  else layer.base.delete(fill)
}

function joinFacesToLayerBelow(layers) {
  const kept = []
  for (const layer of layers) {
    if (kept.length) joinToLayerBelow(kept.at(-1), layer)
    if (polygonsOfLayer(layer).length) kept.push(layer)
  }
  return kept
}

export function vectorTitle(scene, camera, size, resolution) {
  const shot = titleShot(scene, camera, size, resolution * SAMPLES)
  if (!shot) return null
  const { bounds } = shot
  const scaleX = shot.outWidth / SAMPLES / (bounds.maxX - bounds.minX)
  const scaleY = shot.outHeight / SAMPLES / (bounds.maxY - bounds.minY)
  const view = { perspective: camera.isPerspectiveCamera, eye: camera.getWorldPosition(new THREE.Vector3()), direction: camera.getWorldDirection(new THREE.Vector3()), near: camera.near }
  const limits = { fit: resolution * FIT_ERROR, spacing: resolution * SPACING_ERROR }
  const output = new Output()
  const bandFills = new Set()
  const exactFills = new Set()

  function project(point) {
    const { x, y } = point.clone().project(camera)
    return [((x + 1) / 2 - bounds.minX) * scaleX, ((1 - y) / 2 - bounds.minY) * scaleY]
  }

  function bandFill(colour) {
    const fill = hexOfPacked(colour)
    bandFills.add(fill)
    return fill
  }

  function onScreen(pieces) {
    return pieces.map(piece => sameWinding(piece.map(project))).filter(polygon => area(polygon) >= SLIVER)
  }

  function gradientOf(face, rect, model) {
    return model.stops ? fitGradient(face, rect, model, project, limits) : null
  }

  function splits(gradient, depth) {
    return gradient && gradient.error > limits.fit && depth < MAX_SPLITS
  }

  function fillFor(model, gradient, face) {
    if (gradient) return output.fill(gradient, model.group, face, !!model.banded)
    const fill = hexOfPacked(model.stops ? middleOf(model.stops).colour : model.colour)
    if (model.banded) exactFills.add(fill)
    return fill
  }

  function fillBase(face, model, rect, pieces, groups, depth) {
    if (model.bands) {
      const plane = bandPlane(face, model.axis)
      for (const { colour, from, to } of bandRuns(model.stops)) addTo(groups, bandFill(colour), onScreen(clippedToBand(pieces, plane, from, to)))
      return
    }
    const gradient = gradientOf(face, rect, model)
    const half = splits(gradient, depth) && halved(model, rect)
    if (half?.size >= 2) {
      const toWorld = worldMap(face)
      const { acrossX, middle } = half
      const to = acrossX ? toWorld(rect.right, rect.top) : toWorld(rect.left, rect.bottom)
      const normal = to.clone().sub(toWorld(rect.left, rect.top)).normalize()
      const constant = normal.dot(acrossX ? toWorld(middle, rect.top) : toWorld(rect.left, middle))
      const low = []
      const high = []
      for (const piece of pieces) {
        const [above, below] = split(piece, normal, constant)
        if (above) high.push(above)
        if (below) low.push(below)
      }
      if (low.length) fillBase(face, model, half.low, low, groups, depth + 1)
      if (high.length) fillBase(face, model, half.high, high, groups, depth + 1)
      return
    }
    addTo(groups, fillFor(model, gradient, face), onScreen(pieces))
  }

  function cutOnParts(cut, parts) {
    return parts.filter(part => area(part.exact) > SLIVER).flatMap(part => {
      const toPart = worldMap({ corners: part.corners, texels: part.exact })
      return cut.map(loop => withinConvex(loop, part.exact)).filter(Boolean).map(loop => loop.map(([x, y]) => project(toPart(x, y))))
    })
  }

  function boundsOf(face, list, rect) {
    const faceWidth = face.rect.right - face.rect.left
    const xs = list.map(index => face.rect.left + index % faceWidth)
    const ys = list.map(index => face.rect.top + Math.floor(index / faceWidth))
    return { left: Math.max(rect.left, Math.min(...xs)), top: Math.max(rect.top, Math.min(...ys)), right: Math.min(rect.right, Math.max(...xs) + 1), bottom: Math.min(rect.bottom, Math.max(...ys) + 1) }
  }

  function paintPixels(face, layer, list, whole, groups, depth, stacked = true) {
    const toWorld = worldMap(face)
    const rect = list.length && (!layer.cut || layer.banded) ? boundsOf(face, list, whole) : whole
    if (layer.cut) {
      addInOrder(groups, fillFor(layer, gradientOf(face, rect, layer), face), face.parts ? cutOnParts(layer.cut, face.parts) : layer.cut.map(loop => loop.map(([x, y]) => project(toWorld(x, y)))))
      return
    }
    if (layer.bands) {
      const plane = bandPlane(face, layer.axis)
      const loops = face.analysis.shapeOf(list, layer.smooth).map(loop => loop.map(([x, y]) => toWorld(x, y)))
      for (const { colour, from, to } of bandRuns(layer.stops)) addInOrder(groups, bandFill(colour), clippedToBand(loops, plane, from, stacked ? to + BAND_OVERLAP : to).map(piece => piece.map(project)))
      return
    }
    const gradient = gradientOf(face, rect, layer)
    const half = splits(gradient, depth) && halved(layer, rect)
    if (half?.size >= 2) {
      const { acrossX, middle } = half
      const faceWidth = face.rect.right - face.rect.left
      const coordinate = index => acrossX ? face.rect.left + index % faceWidth : face.rect.top + Math.floor(index / faceWidth)
      const low = list.filter(index => coordinate(index) <= middle)
      const high = list.filter(index => coordinate(index) >= middle)
      if (low.length && high.length && low.length < list.length && high.length < list.length) {
        paintPixels(face, layer, low, half.low, groups, depth + 1)
        paintPixels(face, layer, high, half.high, groups, depth + 1)
        return
      }
    }
    addInOrder(groups, fillFor(layer, gradient, face), face.analysis.shapeOf(list, layer.smooth).map(loop => loop.map(([x, y]) => project(toWorld(x, y)))))
  }

  function wholeFill(face, model) {
    return fillFor(model, gradientOf(face, face.rect, model), face)
  }

  function fillLayer(face, faces, layer, { groups, joins, covers }) {
    const toWorld = worldMap(face)
    const found = layer.exact.map(loop => joinsOf(face, loop, faces, toWorld))
    const projected = list => list.map(join => join.map(([x, y]) => project(toWorld(x, y))))
    const under = projected(found.flatMap(item => item.under))
    const over = projected(found.flatMap(item => item.over)).map(sameWinding)
    if (under.length || over.length) {
      const fill = wholeFill(face, layer)
      addInOrder(groups, fill, under)
      addInOrder(joins, fill, over)
    }
    for (const { neighbour, quad } of found.flatMap(item => item.covers)) addTo(covers, wholeFill(neighbour, neighbour.analysis.base), projected([quad]).map(sameWinding))
    paintPixels(face, layer, layer.edges?.length ? layer.pixels.concat(outerPixels(face, faces, layer.edges)) : layer.pixels, face.rect, groups, 0)
  }

  const meshes = []
  scene.traverseVisible(object => {
    if (object.isMesh && object.geometry.attributes.position.count) meshes.push(object)
  })
  meshes.sort((a, b) => a.renderOrder - b.renderOrder)

  const cache = new Map()
  const occluders = []
  const layers = []
  for (const mesh of meshes) {
    const { faces, solids } = facesOf(mesh, view, project, cache)
    const material = firstMaterial(mesh)
    const own = material.depthWrite ? solids.map(face => occluderOf(face, view)) : []
    if (!material.colorWrite) {
      occluders.push(...own)
      continue
    }
    const layer = { base: new Map(), layers: [], joins: [], covers: new Map() }
    for (const face of faces) {
      const visible = hideAll(hideAll([face.points], face, occluders), face, own)
      if (!visible.length) continue
      const { base, layers: shapes } = face.analysis
      const whole = visible.length === 1 && visible[0] === face.corners
      const target = whole ? { groups: layer.layers, joins: layer.joins, covers: layer.covers } : { groups: [], joins: [], covers: new Map() }
      if (base.masked && face.parts && !base.transparent) fillBase(face, base, face.rect, face.parts.flatMap(part => hideAll(hideAll([part.corners], face, occluders), face, own)), layer.base, 0)
      else if (base.masked) fillLayer(face, faces, base, target)
      else {
        const trimmed = whole && shapes.length ? trimmedBase(face, faces) : null
        if (trimmed) {
          const painted = []
          paintPixels(face, base, trimmed, face.rect, painted, 0, false)
          for (const [fill, polygons] of painted) addTo(layer.base, fill, polygons)
        } else fillBase(face, base, face.rect, visible, layer.base, 0)
      }
      for (const shape of shapes) fillLayer(face, faces, shape, target)
      if (!whole) {
        const pieces = visible.map(piece => piece.map(project))
        const shown = polygons => polygons.flatMap(polygon => pieces.map(piece => withinConvex(polygon, piece)).filter(Boolean))
        for (const [fill, polygons] of target.groups) addInOrder(layer.layers, fill, shown(polygons))
        for (const [fill, polygons] of target.joins) addInOrder(layer.joins, fill, shown(polygons))
        for (const [fill, polygons] of target.covers) addTo(layer.covers, fill, shown(polygons))
      }
    }
    occluders.push(...own)
    if (layer.base.size || layer.layers.length) layers.push(layer)
  }
  if (!layers.length) return null

  const { minX, minY, maxX, maxY } = boxOfPolygons(layers.flatMap(layer => Array.from(layer.base.values()).concat(layer.layers.map(entry => entry[1])).flat()))
  const left = Math.floor(minX + CROP_MARGIN)
  const top = Math.floor(minY + CROP_MARGIN)
  const right = Math.ceil(maxX - CROP_MARGIN)
  const bottom = Math.ceil(maxY - CROP_MARGIN)
  const joined = joinFacesToLayerBelow(layers)
  useMergedFills(joined, output.mergeAlongAxis(resolution * SHORT_GRADIENT))
  const totals = fillTotals(cache, bandFills)
  useMergedFills(joined, nearFillsJoined(joined, totals, NEAR_FILLS, exactFills))
  const context = { left, top, bleed: resolution * BLEED, output, totals, cover: coverOf(right - left, bottom - top), exact: new Set(Array.from(exactFills).concat(Array.from(output.exactFills()))) }
  const markup = markupOf(joined.flatMap(layer => entriesOf(layer, context)), context)
  const defs = output.defs(left, top)
  return { width: right - left, height: bottom - top, markup: (defs ? `<defs>${defs}</defs>` : "") + markup }
}
