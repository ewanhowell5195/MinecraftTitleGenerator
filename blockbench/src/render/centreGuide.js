import * as THREE from "three"
import { host } from "#lib/panels/host.js"
import { centreAt, heldCentre } from "#render/centreGuide.js"
import { titleState } from "../titles.js"

const SIZE = 20

let dot = null

function dotTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE * 4
  const context = canvas.getContext("2d")
  const accent = getComputedStyle(document.body).getPropertyValue("--color-accent").trim() || "#3e90ff"
  for (const [radius, colour] of [[SIZE * 2, "#000000"], [SIZE * 2 - 4, "#ffffff"], [SIZE * 2 - 12, accent]]) {
    context.beginPath()
    context.arc(SIZE * 2, SIZE * 2, radius, 0, Math.PI * 2)
    context.fillStyle = colour
    context.fill()
  }
  return new THREE.CanvasTexture(canvas)
}

function centrePoint(held) {
  const object = (held.word ? host.currentWord : host.current).value
  const member = object && titleState().members.get(object.id)
  const { entry } = member ?? {}
  if (!entry?.built) return null
  const toScene = entry.group.matrixWorld.clone().multiply(member.site.clone().invert())
  return centreAt(held, object, entry.built, entry.group.matrixWorld, toScene.multiply(entry.base))
}

export function addCentreGuide() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3))
  const material = new THREE.PointsMaterial({ size: SIZE, sizeAttenuation: false, map: dotTexture(), transparent: true, depthTest: false, depthWrite: false })
  dot = new THREE.Points(geometry, material)
  Object.assign(dot, { renderOrder: 1000, frustumCulled: false, visible: false, no_export: true, raycast: () => {} })
  scene.add(dot)
}

export function placeCentreGuide() {
  const held = heldCentre.value
  const point = held && Project ? centrePoint(held) : null
  dot.visible = !!point
  if (!point) return
  dot.position.copy(point)
  dot.updateMatrixWorld()
}

export function removeCentreGuide() {
  scene.remove(dot)
  dot.geometry.dispose()
  dot.material.map.dispose()
  dot.material.dispose()
  dot = null
}
