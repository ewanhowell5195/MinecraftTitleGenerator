import * as THREE from "three"
import { opaquePoints } from "./bufferPoints.js"
import { lineBounds, objectMatrix, placementMatrix } from "./placement.js"
import { coverMaterial } from "./coverMaterial.js"

const FAR_EYE = 1e6
const coverTextures = new Map()

function mesh(buffers, material) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3))
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs, 2))
  if (buffers.plainUvs) geometry.setAttribute("plainUv", new THREE.BufferAttribute(buffers.plainUvs, 2))
  for (const { start, count, page } of buffers.groups ?? []) geometry.addGroup(start, count, page)
  geometry.userData.sizes = buffers.sizes ?? null
  return new THREE.Mesh(geometry, material)
}

function discard(entry, part) {
  if (!entry[part]) return
  entry[part].geometry.dispose()
  entry.group.remove(entry[part])
  entry[part] = null
}

function clear(entry) {
  discard(entry, "halo")
  discard(entry, "outline")
  discard(entry, "solid")
  discard(entry, "holes")
  for (const texture of (entry.textures ?? []).concat(entry.lights ?? [])) texture.dispose()
  for (const material of entry.materials ?? []) material.dispose()
  entry.textures = []
  entry.lights = []
  entry.materials = []
}

function pageTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function holdCover(source) {
  if (!coverTextures.has(source)) {
    const texture = pageTexture(source)
    texture.flipY = false
    coverTextures.set(source, { texture, users: 0 })
  }
  const held = coverTextures.get(source)
  held.users++
  return held.texture
}

function releaseCover(entry) {
  const source = entry.coverSource
  const held = coverTextures.get(source)
  entry.coverSource = null
  entry.coverTexture = null
  if (!held || --held.users) return
  held.texture.dispose()
  coverTextures.delete(source)
}

function shade(entry, cover) {
  if (!cover || !entry.built?.shader) return
  if (entry.coverSource !== cover.source) {
    releaseCover(entry)
    entry.coverTexture = holdCover(cover.source)
    entry.coverSource = cover.source
  }
  const { view } = cover
  for (const { uniforms } of entry.materials) {
    uniforms.cover.value = entry.coverTexture
    uniforms.coverMatrix.value.fromArray(cover.matrix)
    uniforms.orthographic.value = view.orthographic
    uniforms.lens.value = view.lens
    uniforms.fit.value.set(view.fitX, view.fitY, view.scale)
    uniforms.imageSize.value.set(view.imageWidth, view.imageHeight)
    uniforms.detail.value = cover.detail
  }
}

function fill(entry, built) {
  const shader = built?.shader ?? null
  for (const material of entry.materials) entry.pool[material.isShaderMaterial ? "shaded" : "plain"].push(material)
  entry.materials = []
  clear(entry)
  entry.built = built
  if (!built) return
  entry.textures = built.pages.map(page => {
    const texture = pageTexture(page.texture)
    Object.assign(texture.userData, { labels: page.labels, crackShapes: page.crackShapes, gradient: page.gradient, fades: page.fades, panels: page.panels, plain: page.plain ? { image: page.plain.texture, labels: page.plain.labels, crackShapes: page.plain.crackShapes, gradient: page.plain.gradient, fades: page.plain.fades, panels: page.plain.panels } : null })
    return texture
  })
  entry.lights = shader ? shader.light.map(pageTexture) : []
  entry.materials = entry.textures.map((texture, index) => {
    if (!shader) {
      const material = entry.pool.plain.shift() ?? entry.body.clone()
      material.map = texture
      return material
    }
    const material = entry.pool.shaded.shift() ?? coverMaterial()
    material.uniforms.dark.value = texture
    material.uniforms.light.value = entry.lights[index]
    material.uniforms.pageSize.value.set(texture.image.width, texture.image.height)
    material.uniforms.hue.value.copy(shader.hues[index])
    return material
  })
  entry.border.map = entry.textures[0] ?? null
  entry.border.needsUpdate = true
  entry.solid = built.body.triangles ? mesh(built.body, entry.materials.length === 1 ? entry.materials[0] : entry.materials) : null
  if (entry.solid && built.runs) entry.solid.userData.extent = new THREE.BufferAttribute(new Float32Array(opaquePoints(built.runs).flatMap(point => point.toArray())), 3)
  if (entry.solid) entry.group.add(entry.solid)
}

function cullUnseen(target, { positions, uvs, facing }) {
  target.geometry.computeBoundingBox()
  target.geometry.computeBoundingSphere()
  const inverse = new THREE.Matrix4()
  const eye = new THREE.Vector3()
  const forward = new THREE.Vector3()
  let shown = null
  target.userData.cull = camera => {
    inverse.copy(target.matrixWorld).invert()
    camera.getWorldPosition(eye)
    if (camera.isOrthographicCamera) eye.addScaledVector(camera.getWorldDirection(forward), -FAR_EYE)
    eye.applyMatrix4(inverse)
    const seen = facing.map(({ normal, point }) => normal[0] * (eye.x - point[0]) + normal[1] * (eye.y - point[1]) + normal[2] * (eye.z - point[2]) > 0)
    const key = seen.join()
    if (key === shown) return
    shown = key
    const kept = facing.filter((face, index) => seen[index])
    const total = kept.reduce((sum, face) => sum + face.count, 0)
    const visible = new Float32Array(total * 3)
    const mapped = new Float32Array(total * 2)
    let at = 0
    for (const { start, count } of kept) {
      visible.set(positions.subarray(start * 3, (start + count) * 3), at * 3)
      mapped.set(uvs.subarray(start * 2, (start + count) * 2), at * 2)
      at += count
    }
    target.geometry.dispose()
    target.geometry.setAttribute("position", new THREE.BufferAttribute(visible, 3))
    target.geometry.setAttribute("uv", new THREE.BufferAttribute(mapped, 2))
  }
}

export function cullOutlines(scene, camera) {
  scene.traverseVisible(object => object.userData.cull?.(camera))
}

function attachShell(entry, part, buffers, material) {
  discard(entry, part)
  entry[part] = buffers?.triangles ? mesh(buffers, material) : null
  if (!entry[part]) return
  if (buffers.facing) cullUnseen(entry[part], buffers)
  entry.group.add(entry[part])
}

function place(entry, value) {
  if (entry.outline) entry.outline.scale.set(...entry.lines.scale.map(axis => 1 / axis))
  if (entry.halo) entry.halo.scale.set(...entry.rings.scale.map(axis => 1 / axis))
  if (entry.holes) entry.holes.scale.set(...entry.gaps.scale.map(axis => 1 / axis))
  entry.group.matrixAutoUpdate = false
  entry.base = placementMatrix(value, entry.built && lineBounds(entry.built))
  entry.group.matrix.copy(objectMatrix(value, entry.built))
  entry.group.updateMatrixWorld(true)
}

function createEntry() {
  return {
    group: new THREE.Group(),
    outline: null,
    halo: null,
    solid: null,
    holes: null,
    body: new THREE.MeshBasicMaterial({ alphaTest: 0.5 }),
    border: new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }),
    rim: new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }),
    clip: new THREE.MeshBasicMaterial({ colorWrite: false }),
    coverSource: null,
    coverTexture: null,
    materials: [],
    pool: { plain: [], shaded: [] },
    built: null,
    base: new THREE.Matrix4(),
    lines: null,
    rings: null,
    gaps: null
  }
}

function updateEntry(entry, item) {
  entry.line = item.paintLine
  if (entry.built !== item.built) {
    fill(entry, item.built)
    entry.lines = null
    entry.rings = null
    entry.gaps = null
  }
  shade(entry, item.cover)
  if (entry.gaps !== (item.holes ?? null)) {
    entry.gaps = item.holes ?? null
    attachShell(entry, "holes", entry.gaps, entry.clip)
  }
  if (entry.lines !== item.outline) {
    entry.lines = item.outline
    attachShell(entry, "outline", item.outline, entry.border)
  }
  if (entry.rings !== item.halo) {
    entry.rings = item.halo
    attachShell(entry, "halo", item.halo, entry.rim)
  }
  if (item.halo) entry.rim.color.set(item.haloColour)
  if (item.transform) place(entry, item.transform)
  entry.group.visible = !item.hidden
}

function destroyEntry(entry) {
  clear(entry)
  releaseCover(entry)
  for (const material of entry.pool.plain.concat(entry.pool.shaded)) material.dispose()
  entry.body.dispose()
  entry.border.dispose()
  entry.rim.dispose()
  entry.clip.dispose()
}

export function createStage() {
  const scene = new THREE.Scene()
  const entries = new Map()
  scene.onBeforeRender = (renderer, target, camera) => cullOutlines(target, camera)
  function update(id, item) {
    if (!entries.has(id)) {
      const entry = createEntry()
      scene.add(entry.group)
      entries.set(id, entry)
    }
    const entry = entries.get(id)
    updateEntry(entry, item)
    return entry
  }
  function drop(id) {
    const entry = entries.get(id)
    if (!entry) return
    destroyEntry(entry)
    scene.remove(entry.group)
    entries.delete(id)
  }
  function sync(items) {
    const seen = new Set(items.map(item => item.id))
    for (const item of items) update(item.id, item)
    for (const id of Array.from(entries.keys())) {
      if (!seen.has(id)) drop(id)
    }
  }
  function sort(camera) {
    sortEntries(Array.from(entries.values()), camera)
  }
  function dispose() {
    for (const id of Array.from(entries.keys())) drop(id)
  }
  return { scene, entries, update, drop, sync, sort, dispose }
}

export function pickEntry(entries, raycaster) {
  const hits = Array.from(entries).filter(([, entry]) => entry.group.visible).flatMap(([id, entry]) => [entry.outline, entry.solid].filter(Boolean).flatMap(mesh => raycaster.intersectObject(mesh, false).slice(0, 1).map(hit => ({ id, solid: mesh === entry.solid, order: mesh.renderOrder, distance: hit.distance }))))
  let top = null
  let nearest = Infinity
  for (const hit of hits.sort((a, b) => a.order - b.order)) {
    if (hit.distance > nearest) continue
    top = hit.id
    if (hit.solid) nearest = hit.distance
  }
  return top
}

export function sortEntries(entries, camera) {
  const centre = new THREE.Vector3()
  const sorted = entries.map(entry => {
    new THREE.Box3().setFromObject(entry.group).getCenter(centre)
    return { entry, distance: centre.distanceToSquared(camera.position) }
  }).sort((a, b) => b.distance - a.distance)
  const lines = Array.from(Map.groupBy(sorted, item => item.entry.line).values()).map(words => ({ words, distance: words.reduce((sum, word) => sum + word.distance, 0) / words.length })).sort((a, b) => b.distance - a.distance)
  let under = -2 * entries.length
  // nearest line first, halos before holes, so holes only clip the halos of lines behind them
  for (const { words } of lines.toReversed()) {
    for (const { entry } of words) {
      if (entry.halo) entry.halo.renderOrder = under++
    }
    for (const { entry } of words) {
      if (entry.holes) entry.holes.renderOrder = under++
    }
  }
  let order = 0
  for (const { words } of lines) {
    for (const { entry } of words) {
      if (entry.outline) entry.outline.renderOrder = order++
    }
    for (const { entry } of words) {
      if (entry.solid) entry.solid.renderOrder = order++
    }
  }
}
