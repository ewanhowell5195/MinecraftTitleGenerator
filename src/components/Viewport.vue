<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import * as THREE from "three"
  import { TransformControls } from "three/addons/controls/TransformControls.js"
  import { frameBounds, framePixels, frameRect, framing } from "../lib/framing.js"
  import { holdHistory } from "../lib/history.js"
  import { clamp, round } from "../lib/maths.js"
  import { renderTitle, screenBounds } from "../lib/render.js"
  import { current, currentWord, setScale, shapingWord } from "../lib/scene.js"
  import { TRANSFORM_LIMITS } from "../lib/settings.js"
  import { createEntry, destroyEntry, frameCamera, gizmoPose, lineBounds, movedBy, rotatedTo, sortEntries, titleFraming, updateEntry, wordMovedBy, wordPose, wordRotatedTo } from "../lib/stage.js"
  import { vectorTitle } from "../lib/vector.js"
  import { view, viewport, viewportChanges } from "../lib/view.js"
  import Icon from "./Icon.vue"

  const TOOLS = [[null, "pointer", "No gizmo"], ["translate", "move", "Move"], ["rotate", "rotate", "Rotate"], ["scale", "scale", "Scale"]]
  const SELECTION_LAYER = 1
  const MAX_SCALE = 5

  const props = defineProps({
    items: { type: Array, required: true },
    selected: { type: Array, required: true }
  })

  const host = ref(null)
  const entries = new Map()
  let renderer, scene, overlay, camera, perspective, orthographic, frame, observer, selection, controls, proxy
  let frameSize = { width: 1, height: 1 }
  let fitted = null
  let dirty = true
  let grabbed = null

  function invalidate() {
    dirty = true
    if (!frame) frame = requestAnimationFrame(render)
  }

  function render() {
    frame = 0
    refit()
    if (fitted === null || !dirty) return
    pose()
    dirty = false
    sortEntries(Array.from(entries.values()), camera)
    track()
    renderer.render(scene, camera)
    if (controls.object) {
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(overlay, camera)
      renderer.autoClear = true
    }
    viewport.mirror?.(renderer.domElement)
  }

  function target() {
    if (!view.gizmo || view.section !== "shape") return null
    const usable = item => item.built?.body.triangles && item.transform
    if (shapingWord.value) return props.items.find(item => item.id === currentWord.value.id && usable(item)) ?? null
    return props.items.find(item => props.selected.includes(item.id) && usable(item)) ?? null
  }

  function pose() {
    if (controls.dragging) return
    const item = target()
    if (!item) {
      controls.detach()
      return
    }
    const word = shapingWord.value
    const { position, quaternion } = word ? wordPose(item.transform, item.built, view.gizmo !== "translate") : gizmoPose(item.transform, lineBounds(item.built))
    proxy.position.copy(position)
    proxy.quaternion.copy(quaternion)
    proxy.scale.set(...(word ? item.transform.word.userScale : item.transform.userScale))
    const object = current.value
    controls.showX = word || view.gizmo !== "scale" || object.matchWidth === null
    controls.showY = word || view.gizmo !== "scale" || object.matchWidth === null || object.linkScale === null
    controls.setMode(view.gizmo)
    if (controls.object !== proxy) controls.attach(proxy)
  }

  function grab() {
    const item = target()
    grabbed = { transform: item.transform, built: item.built, word: shapingWord.value, position: proxy.position.clone() }
    holdHistory(true)
  }

  function release() {
    grabbed = null
    holdHistory(false)
    invalidate()
  }

  function dragWord() {
    const object = currentWord.value
    const { transform, built } = grabbed
    if (controls.mode === "translate") {
      const { translate, position } = wordMovedBy(transform, built, proxy.position.clone().sub(grabbed.position))
      proxy.position.copy(position)
      Object.assign(object, { wordTranslateX: translate[0], wordTranslateY: translate[1], wordTranslateZ: translate[2] })
    } else if (controls.mode === "rotate") {
      const rotate = wordRotatedTo(transform, proxy.quaternion)
      Object.assign(object, { wordRotationX: rotate[0], wordRotationY: rotate[1], wordRotationZ: rotate[2] })
    } else {
      applyScale(object, ["wordScaleX", "wordScaleY", "wordScaleZ"])
    }
  }

  function applyScale(object, keys) {
    const scale = proxy.scale.toArray().map(axis => clamp(round(axis, 4), ...TRANSFORM_LIMITS.scale))
    proxy.scale.fromArray(scale)
    for (const [index, key] of keys.entries()) {
      if (controls.axis.includes("XYZ"[index])) setScale(object, key, scale[index])
    }
  }

  function drag() {
    if (!grabbed) return
    if (grabbed.word) return dragWord()
    const object = current.value
    const { transform } = grabbed
    if (controls.mode === "translate") {
      const { translate, offset } = movedBy(transform, proxy.position.clone().sub(grabbed.position))
      proxy.position.copy(grabbed.position).add(offset)
      Object.assign(object, { translateX: translate[0], translateY: translate[1], translateZ: translate[2] })
    } else if (controls.mode === "rotate") {
      const { rotate, translate } = rotatedTo(transform, proxy.quaternion)
      Object.assign(object, { rotationX: rotate[0], rotationY: rotate[1], rotationZ: rotate[2], translateX: translate[0], translateY: translate[1], translateZ: translate[2] })
    } else {
      applyScale(object, ["scaleX", "scaleY", "scaleZ"])
    }
  }

  function sync() {
    invalidate()
    viewportChanges.value++
    const seen = new Set()
    for (const item of props.items) {
      seen.add(item.id)
      let entry = entries.get(item.id)
      if (!entry) {
        entry = createEntry()
        scene.add(entry.group)
        entries.set(item.id, entry)
      }
      updateEntry(entry, item)
    }
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue
      destroyEntry(entry)
      scene.remove(entry.group)
      entries.delete(id)
    }
  }

  function track() {
    const shown = props.selected.filter(id => entries.has(id))
    const meshes = shown.length < props.items.length ? shown.flatMap(id => entries.get(id).outline ?? entries.get(id).solid ?? []) : []
    selection.visible = meshes.length > 0
    if (!meshes.length) return
    const frame = shown.length === 1 ? meshes[0].parent.matrixWorld : entries.get(shown[0]).base
    const into = frame.clone().invert()
    const box = new THREE.Box3()
    for (const mesh of meshes) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(into.clone().multiply(mesh.parent.matrixWorld).multiply(mesh.matrix)))
    }
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    selection.matrix.copy(frame).multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)).multiply(new THREE.Matrix4().makeScale(size.x, size.y, size.z))
    selection.matrixWorldNeedsUpdate = true
    const normals = new THREE.Matrix3().getNormalMatrix(selection.matrix)
    const forward = camera.getWorldDirection(new THREE.Vector3())
    function facing(normal) {
      const middle = normal.clone().multiplyScalar(0.5).applyMatrix4(selection.matrix)
      const toward = camera.isOrthographicCamera ? forward.clone().negate() : camera.position.clone().sub(middle)
      return normal.clone().applyMatrix3(normals).dot(toward) > 0
    }
    for (const edge of selection.children) edge.visible = facing(edge.userData.faces[0]) !== facing(edge.userData.faces[1])
  }

  function wireBox(material) {
    const group = new THREE.Group()
    for (let along = 0; along < 3; along++) {
      const a = (along + 1) % 3
      const b = (along + 2) % 3
      for (const signA of [-1, 1]) {
        for (const signB of [-1, 1]) {
          const ends = [-0.5, 0.5].map(value => new THREE.Vector3().setComponent(a, signA * 0.5).setComponent(b, signB * 0.5).setComponent(along, value))
          const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), material)
          edge.userData.faces = [new THREE.Vector3().setComponent(a, signA), new THREE.Vector3().setComponent(b, signB)]
          edge.renderOrder = Number.MAX_SAFE_INTEGER
          group.add(edge)
        }
      }
    }
    return group
  }

  function refit() {
    if (controls.dragging || fitted === props.items || !entries.size || !props.items.every(item => item.settled)) return
    fitted = props.items
    fitCamera()
  }

  function fitCamera() {
    invalidate()
    viewportChanges.value++
    const title = titleFraming(props.items)
    if (title) frameCamera(camera, { ...title, fov: view.fov, ...frameSize, maxScale: view.render ? Infinity : MAX_SCALE, frame: view.render ? { rect: frameRect, bounds: frameBounds, pixels: framePixels } : null })
  }

  onMounted(() => {
    const width = host.value.clientWidth || 1
    const height = host.value.clientHeight || 1
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    host.value.append(renderer.domElement)
    scene = new THREE.Scene()
    frameSize = { width, height }
    perspective = new THREE.PerspectiveCamera(view.fov || 40, width / height, 1, 5000)
    orthographic = new THREE.OrthographicCamera()
    camera = view.fov ? perspective : orthographic
    selection = wireBox(new THREE.LineBasicMaterial({ color: getComputedStyle(host.value).getPropertyValue("--accent").trim(), depthTest: false }))
    selection.matrixAutoUpdate = false
    selection.visible = false
    for (const edge of selection.children) edge.layers.set(SELECTION_LAYER)
    perspective.layers.enable(SELECTION_LAYER)
    orthographic.layers.enable(SELECTION_LAYER)
    scene.add(selection)
    overlay = new THREE.Scene()
    proxy = new THREE.Object3D()
    overlay.add(proxy)
    controls = new TransformControls(camera, renderer.domElement)
    controls.setSpace("local")
    controls.addEventListener("change", invalidate)
    controls.addEventListener("mouseDown", grab)
    controls.addEventListener("mouseUp", release)
    controls.addEventListener("objectChange", drag)
    overlay.add(controls.getHelper())
    observer = new ResizeObserver(() => {
      const w = host.value.clientWidth
      const h = host.value.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      frameSize = { width: w, height: h }
      fitCamera()
    })
    observer.observe(host.value)
    viewport.capture = capture
    viewport.vector = vector
    viewport.titleRect = titleRect
    viewport.canvas = renderer.domElement
    viewport.redraw = invalidate
    sync()
  })

  function titleRect() {
    refit()
    camera.updateMatrixWorld()
    const bounds = screenBounds(scene, camera)
    if (!bounds) return null
    const { clientWidth: width, clientHeight: height } = host.value
    return { left: bounds.minX * width, top: bounds.minY * height, width: (bounds.maxX - bounds.minX) * width, height: (bounds.maxY - bounds.minY) * height }
  }

  async function capture(resolution, antialias, task) {
    refit()
    sortEntries(Array.from(entries.values()), camera)
    return await renderTitle(renderer.getSize(new THREE.Vector2()), scene, camera, resolution, antialias, task)
  }

  function vector(resolution) {
    refit()
    sortEntries(Array.from(entries.values()), camera)
    return vectorTitle(scene, camera, renderer.getSize(new THREE.Vector2()), resolution)
  }

  onBeforeUnmount(() => {
    viewport.capture = null
    viewport.vector = null
    viewport.titleRect = null
    viewport.canvas = null
    viewport.redraw = null
    cancelAnimationFrame(frame)
    observer.disconnect()
    if (grabbed) holdHistory(false)
    controls.dispose()
    for (const entry of entries.values()) destroyEntry(entry)
    entries.clear()
    for (const edge of selection.children) edge.geometry.dispose()
    selection.children[0].material.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  })

  watch(() => view.fov, value => {
    camera = value ? perspective : orthographic
    controls.camera = camera
    fitCamera()
  })

  watch(() => view.fixedDistance, fitCamera)
  watch(() => view.gizmo, invalidate)
  watch([() => view.section, () => view.render], () => view.gizmo = null)
  watch(shapingWord, invalidate)

  watch(() => view.render && [framing, view.resolution, view.antialias], fitCamera, { deep: true })

  watch(() => props.items, sync)
  watch(() => props.selected.join(), invalidate)
</script>

<template>
  <div ref="host" class="viewport">
    <div v-if="!view.render && view.section === 'shape'" class="tools">
      <button v-for="[mode, icon, title] of TOOLS" :key="icon" class="icon-button small" :class="{ active: view.gizmo === mode }" :title="title" :aria-pressed="view.gizmo === mode" @click="view.gizmo = mode"><Icon :name="icon" :size="16" /></button>
    </div>
  </div>
</template>

<style scoped>
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--checker);
    overflow: hidden;
  }

  .tools {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface);
    border: 1px solid var(--line);
    user-select: none;
  }

  .tools .active {
    background: var(--accent-soft);
  }

  .viewport :deep(canvas) {
    position: relative;
    z-index: 1;
    display: block;
  }
</style>
