import { reactive, watch } from "vue"
import * as THREE from "three"
import { AUTO_BORDER } from "./build.js"
import { quietly } from "./history.js"
import { round } from "./maths.js"
import { runtime, scene } from "./scene.js"
import { frameCamera, lineBounds, placementMatrix, titleFraming } from "./stage.js"
import { view } from "./view.js"

export const problems = reactive({})

const perspective = new THREE.PerspectiveCamera()
const orthographic = new THREE.OrthographicCamera()

function titleCamera(items) {
  const camera = view.fov ? perspective : orthographic
  frameCamera(camera, { ...titleFraming(items.map(({ object, state }) => ({ ...state, type: object.type }))), fov: view.fov, width: 1, height: 1 })
  return camera
}

function outlinePoint(state, object, box, scale, local, side) {
  const value = { ...state.transform, scale }
  const baked = object.scaleOutline ? value.type : value.type.map((axis, index) => axis * scale[index])
  const reach = state.built.frame ? AUTO_BORDER : state.built.border
  const point = new THREE.Vector3(...local.map((coordinate, index) => coordinate + side[index] * reach / baked[index]))
  return point.applyMatrix4(placementMatrix(value, box))
}

function signedDistance(point, from, to) {
  return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
}

function linkedY(object, scaleX) {
  return object.linkScale === null ? object.scaleY : round(scaleX * object.linkScale, 4)
}

function solve(camera, target, reference) {
  const scaleOf = object => [object.scaleX, object.scaleY, object.scaleZ]
  const targetBox = lineBounds(target.state.built)
  const referenceBox = lineBounds(reference.state.built)
  const targetCentre = targetBox.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(target.state.transform, targetBox)).project(camera)
  const referenceCentre = referenceBox.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(reference.state.transform, referenceBox)).project(camera)
  const below = targetCentre.y < referenceCentre.y
  const edgeY = below ? referenceBox.min.y : referenceBox.max.y
  const solutions = []
  for (const direction of [-1, 1]) {
    const edgeX = direction < 0 ? referenceBox.min.x : referenceBox.max.x
    const ends = reference.object.type === "bottom"
      ? [[referenceBox.min.y, referenceBox.max.z, -1, 1], [referenceBox.max.y, referenceBox.max.z, 1, 1]]
      : [[edgeY, referenceBox.max.z, below ? -1 : 1, 1], [edgeY, referenceBox.min.z, below ? -1 : 1, -1]]
    const [near, far] = ends.map(([y, z, sideY, sideZ]) => outlinePoint(reference.state, reference.object, referenceBox, scaleOf(reference.object), [edgeX, y, z], [direction, sideY, sideZ]).project(camera))
    function offset(scaleX) {
      const scale = [scaleX, linkedY(target.object, scaleX), target.object.scaleZ]
      const x = direction < 0 ? targetBox.min.x : targetBox.max.x
      const ends = [targetBox.min.y, targetBox.max.y].map((y, index) => outlinePoint(target.state, target.object, targetBox, scale, [x, y, targetBox.max.z], [direction, index ? 1 : -1, 1]).project(camera))
      return ends.reduce((sum, point) => sum + signedDistance(point, near, far), 0) * direction
    }
    let low = 0.01
    let high = 8
    const lowSign = Math.sign(offset(low))
    while (high < 4096 && Math.sign(offset(high)) === lowSign) high *= 2
    if (Math.sign(offset(high)) === lowSign) throw new Error("these texts' edges can't be lined up by scaling")
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2
      if (Math.sign(offset(middle)) === lowSign) low = middle
      else high = middle
    }
    solutions.push((low + high) / 2)
  }
  return (solutions[0] + solutions[1]) / 2
}

function find(id) {
  return scene.objects.find(object => object.id === id)
}

export function leadsTo(start, target) {
  const seen = new Set()
  for (let current = start; current && !seen.has(current.id); current = find(current.matchWidth)) {
    if (current.id === target.id) return true
    seen.add(current.id)
  }
  return false
}

function matchReference(object) {
  let reference = find(object.matchWidth)
  while (reference && find(reference.matchWidth)) reference = find(reference.matchWidth)
  return reference
}

export function matchSolved(object) {
  return matchReference(object)?.hidden === false
}

function depth(object) {
  let count = 0
  for (let current = find(object.matchWidth); current; current = find(current.matchWidth)) count++
  return count
}

function rested(object) {
  const state = runtime[object.id]
  return { ...state, transform: { ...state.transform, rotate: [0, 0, 0], translate: [0, 0, 0] } }
}

function ready(object) {
  const state = runtime[object.id]
  return !object.hidden && !!state?.built && !!state.transform && state.settled
}

function update() {
  const items = scene.objects.filter(ready).map(object => ({ object, state: rested(object) }))
  const linked = scene.objects.filter(object => object.matchWidth !== null).sort((a, b) => depth(a) - depth(b))
  let camera = null
  for (const object of linked) {
    const reference = matchReference(object)
    if (!reference || !ready(object) || !ready(reference)) continue
    try {
      camera ??= titleCamera(items)
      const scaleX = round(solve(camera, { object, state: rested(object) }, { object: reference, state: rested(reference) }), 4)
      delete problems[object.id]
      const scaleY = linkedY(object, scaleX)
      if (Math.abs(scaleX - object.scaleX) > 0.0001 || scaleY !== object.scaleY) {
        quietly(() => {
          object.scaleX = scaleX
          object.scaleY = scaleY
        })
      }
    } catch (err) {
      problems[object.id] = err.message
    }
  }
}

export function keepMatched() {
  watch(() => [view.fov, view.fixedDistance, scene.objects.map(object => [object.matchWidth, object.hidden, runtime[object.id]])], update)
}
