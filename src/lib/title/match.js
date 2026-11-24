import { watch } from "vue"
import * as THREE from "three"
import { hasMarks } from "../font/stretchMarks.js"
import { clamp, round } from "../core/maths.js"
import { wordsOf } from "./title.js"
import { effectiveScale } from "../settings/settings.js"
import { lineBounds, placementMatrix } from "../../render/placement.js"
import { frameCamera, titleFraming } from "../../render/titleFraming.js"

const perspective = new THREE.PerspectiveCamera()
const orthographic = new THREE.OrthographicCamera()
const SCREEN_FULL = Math.PI / 4
const SCREEN_LIMIT = Math.PI / 3

function titleCamera(items, angle) {
  const camera = angle.fov ? perspective : orthographic
  frameCamera(camera, { ...titleFraming(items.map(({ object, state }) => ({ ...state, type: object.type })), angle.fixedDistance), angle, width: 1, height: 1 })
  return camera
}

function outlinePoint(state, object, box, scale, local, side, matchOffset = 0) {
  const value = { ...state.transform, scale, matchOffset }
  const baked = object.scaleOutline ? value.type : value.type.map((axis, index) => axis * scale[index])
  const reach = state.built.border
  const point = new THREE.Vector3(...local.map((coordinate, index) => coordinate + side[index] * reach / baked[index]))
  return point.applyMatrix4(placementMatrix(value, box))
}

function signedDistance(point, from, to) {
  return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
}

function settledOffset(difference, start) {
  let from = start
  let to = start + 1
  let atFrom = difference(from)
  let atTo = difference(to)
  for (let i = 0; i < 8 && atTo !== atFrom && Math.abs(atFrom) > 0.00001; i++) {
    const next = from - atFrom * (from - to) / (atFrom - atTo)
    to = from
    atTo = atFrom
    from = next
    atFrom = difference(from)
  }
  return from
}

function bottomOf(reference, title) {
  const edges = wordsOf(reference, title).map(object => title.runtime[object.id]?.built?.bottom).filter(Boolean)
  if (!edges.length) throw new Error("this row has no bottom to measure")
  return {
    left: edges.reduce((best, { left }) => left[0] < best[0] ? left : best, edges[0].left),
    right: edges.reduce((best, { right }) => right[0] > best[0] ? right : best, edges[0].right)
  }
}

function extent(built, direction) {
  const positions = built.body?.positions
  if (!positions?.length) return direction < 0 ? built.line.min[0] : built.line.max[0]
  let value = -Infinity
  for (let at = 0; at < positions.length; at += 3) value = Math.max(value, direction * positions[at])
  return direction * value
}

function screenWeight(near, far) {
  const angle = Math.atan2(Math.abs(far.x - near.x), Math.abs(far.y - near.y))
  return clamp((SCREEN_LIMIT - angle) / (SCREEN_LIMIT - SCREEN_FULL), 0, 1)
}

function scaled(offset) {
  return shift => {
    let low = 0.01
    let high = 8
    const lowSign = Math.sign(offset(low, shift))
    while (high < 4096 && Math.sign(offset(high, shift)) === lowSign) high *= 2
    if (Math.sign(offset(high, shift)) === lowSign) return null
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2
      if (Math.sign(offset(middle, shift)) === lowSign) low = middle
      else high = middle
    }
    return (low + high) / 2
  }
}

function solve(camera, target, reference, title) {
  const bottom = target.object.matchBottom ? bottomOf(reference.object, title) : null
  const targetBox = lineBounds(target.state.built)
  const referenceBox = lineBounds(reference.state.built)
  const targetCentre = targetBox.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(target.state.transform, targetBox)).project(camera)
  const referenceCentre = referenceBox.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(reference.state.transform, referenceBox)).project(camera)
  const below = targetCentre.y < referenceCentre.y
  const edgeY = below ? referenceBox.min.y : referenceBox.max.y
  const referenceScale = [effectiveScale(reference.object)[0]].concat(reference.state.transform.scale.slice(1))
  const [, targetY, targetZ] = target.state.transform.scale
  const grows = target.object.matchScaleY && !(target.object.scaleMarked && hasMarks(target.state.font))
  function targetScale(matchScale) {
    return [matchScale, grows ? target.object.scaleY * matchScale : targetY, targetZ]
  }
  const [left, right] = [-1, 1].map(direction => {
    const measured = bottom && (direction < 0 ? bottom.left : bottom.right)
    const edgeX = measured ? measured[0] : direction < 0 ? referenceBox.min.x : referenceBox.max.x
    const rowY = measured ? measured[1] : edgeY
    const sideY = measured || below ? -1 : 1
    const ends = reference.object.type === "bottom"
      ? [[measured ? measured[1] : referenceBox.min.y, referenceBox.max.z, -1, 1], [referenceBox.max.y, referenceBox.max.z, 1, 1]]
      : [[rowY, referenceBox.max.z, sideY, 1], [rowY, referenceBox.min.z, sideY, -1]]
    const [near, far] = ends.map(([y, z, sideY, sideZ]) => outlinePoint(reference.state, reference.object, referenceBox, referenceScale, [edgeX, y, z], [direction, sideY, sideZ]).project(camera))
    const weight = screenWeight(near, far)
    const onScreen = scaled((matchScale, shift) => {
      const x = direction < 0 ? targetBox.min.x : targetBox.max.x
      const ends = [targetBox.min.y, targetBox.max.y].map((y, index) => outlinePoint(target.state, target.object, targetBox, targetScale(matchScale), [x, y, targetBox.max.z], [direction, index ? 1 : -1, 1], shift).project(camera))
      return ends.reduce((sum, point) => sum + signedDistance(point, near, far), 0) * direction
    })
    const edge = direction * outlinePoint(reference.state, reference.object, referenceBox, referenceScale, [measured ? measured[0] : extent(reference.state.built, direction), 0, 0], [direction, 0, 0]).x
    const x = extent(target.state.built, direction)
    const inModel = scaled((matchScale, shift) => direction * outlinePoint(target.state, target.object, targetBox, targetScale(matchScale), [x, 0, 0], [direction, 0, 0], shift).x - edge)
    return shift => {
      const screen = weight > 0 ? onScreen(shift) : null
      if (screen !== null && weight === 1) return screen
      const model = inModel(shift)
      if (model === null) throw new Error("these texts' edges can't be lined up by scaling")
      return screen === null ? model : screen * weight + model * (1 - weight)
    }
  })
  const measuredCentre = bottom ? (bottom.left[0] + bottom.right[0]) / 2 * reference.state.transform.type[0] * effectiveScale(reference.object)[0] : 0
  const matchOffset = bottom ? settledOffset(shift => left(shift) - right(shift), measuredCentre) : 0
  return { matchScale: (left(matchOffset) + right(matchOffset)) / 2, matchOffset }
}

function find(id, title) {
  return title.objects.find(object => object.id === id)
}

export function leadsTo(start, target, title) {
  const seen = new Set()
  for (let current = start; current && !seen.has(current.id); current = find(current.matchWidth, title)) {
    if (current.id === target.id) return true
    seen.add(current.id)
  }
  return false
}

function matchReference(object, title) {
  let reference = find(object.matchWidth, title)
  while (reference && find(reference.matchWidth, title)) reference = find(reference.matchWidth, title)
  return reference
}

export function matchSolved(object, title) {
  return matchReference(object, title)?.hidden === false
}

function depth(object, title) {
  let count = 0
  for (let current = find(object.matchWidth, title); current; current = find(current.matchWidth, title)) count++
  return count
}

function rested(object, title) {
  const state = title.runtime[object.id]
  return { ...state, transform: { ...state.transform, rotate: [0, 0, 0], translate: [0, 0, 0], matchOffset: 0 } }
}

function settled(object, title) {
  const state = title.runtime[object.id]
  return !!state?.built && !!state.transform && state.settled
}

function ready(object, title) {
  return !object.hidden && settled(object, title)
}

function framed(object, title) {
  return settled(object, title) && !wordsOf(object, title).every(word => word.hidden)
}

function update(title) {
  const items = title.objects.filter(object => framed(object, title)).map(object => ({ object, state: rested(object, title) }))
  const linked = title.objects.filter(object => object.matchWidth !== null).sort((a, b) => depth(a, title) - depth(b, title))
  for (const object of title.objects) {
    if (object.matchWidth === null) delete title.problems[object.id]
    if (object.matchWidth === null && (object.matchOffset || object.matchScale !== 1)) {
      title.quietly(() => {
        object.matchOffset = 0
        object.matchScale = 1
      })
    }
  }
  let camera = null
  for (const object of linked) {
    const reference = matchReference(object, title)
    if (!reference || !ready(object, title) || !ready(reference, title)) continue
    try {
      camera ??= titleCamera(items, title.camera)
      const solved = solve(camera, { object, state: rested(object, title) }, { object: reference, state: rested(reference, title) }, title)
      const matchScale = round(solved.matchScale, 4)
      const matchOffset = round(solved.matchOffset, 2)
      delete title.problems[object.id]
      if (Math.abs(matchScale - object.matchScale) > 0.0001 || matchOffset !== object.matchOffset) {
        title.quietly(() => {
          object.matchScale = matchScale
          object.matchOffset = matchOffset
        })
      }
    } catch (err) {
      title.problems[object.id] = err.message
    }
  }
}

export function keepMatched(title) {
  watch(() => [{ ...title.camera }, title.objects.map(object => [object.matchWidth, object.matchBottom, object.matchScaleY, object.hidden, title.runtime[object.id]])], () => update(title))
}
