<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import * as THREE from "three"
  import { framing } from "../render/framing.js"
  import { Gizmo } from "./gizmo.js"
  import { useGizmoDrag } from "./gizmoDrag.js"
  import { trackSelection, wireBox } from "./selectionBox.js"
  import { useViewCamera } from "./viewCamera.js"
  import { useViewCapture } from "./viewCapture.js"
  import { useViewPointer } from "./viewPointer.js"
  import { platform } from "../lib/core/platform.js"
  import { scene as title, shapingWord } from "../lib/state/scene.js"
  import { createSmoothing } from "../components/composables/smoothing.js"
  import { createStage } from "../render/stage.js"
  import { centrePoint, heldCentre } from "./centreDot.js"
  import { titleLoads, view, viewport, viewportChanges } from "../lib/state/view.js"

  const TOOLS = [[null, "pointer", "No gizmo"], ["translate", "move", "Move"], ["rotate", "rotate", "Rotate"], ["scale", "scale", "Scale"]]
  const SELECTION_LAYER = 1

  const props = defineProps({
    items: { type: Array, required: true },
    selected: { type: Array, required: true }
  })

  const host = ref(null)
  const dot = ref(null)
  const stage = createStage()
  const { scene, entries } = stage
  const rig = { renderer: null, camera: null, controls: null, frameSize: { width: 1, height: 1 } }
  let overlay, perspective, orthographic, frame, observer, selection, smoothing
  let dirty = true
  const viewCamera = useViewCamera(rig, { props, entries, invalidate })
  const { pan, orbit, orbiting, navigable, moved, hasFitted, refit, fitCamera, holdPan, applyView, resetView, toggleOrbit, homeView } = viewCamera
  const { panning, listen } = useViewPointer(rig, viewCamera, entries)
  const { proxy, pose, grab, release, drag, cancelDrag } = useGizmoDrag(rig, { props, invalidate })
  const { capture, vector, titleRect } = useViewCapture(rig, { stage, host, props, refit })

  function invalidate() {
    dirty = true
    if (!frame) frame = requestAnimationFrame(render)
  }

  function render() {
    frame = 0
    refit()
    if (!hasFitted() || !dirty) return
    holdPan()
    pose()
    dirty = false
    stage.sort(rig.camera)
    trackSelection(selection, entries, props.selected, props.items.length, rig.camera)
    smoothing.draw(scene, rig.camera)
    if (rig.controls.object) {
      rig.controls.update()
      rig.renderer.autoClear = false
      rig.renderer.clearDepth()
      rig.renderer.render(overlay, rig.camera)
      rig.renderer.autoClear = true
    }
    viewport.mirror?.(rig.renderer.domElement)
    placeDot()
  }

  function placeDot() {
    const point = centrePoint(entries)
    dot.value.hidden = !point
    if (!point) return
    point.project(rig.camera)
    dot.value.style.translate = `${(point.x + 1) / 2 * rig.frameSize.width}px ${(1 - point.y) / 2 * rig.frameSize.height}px`
  }

  function sync() {
    invalidate()
    viewportChanges.value++
    stage.sync(props.items)
  }

  onMounted(() => {
    const width = host.value.clientWidth || 1
    const height = host.value.clientHeight || 1
    rig.renderer = platform.createWebGLRenderer()
    rig.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rig.renderer.setSize(width, height)
    smoothing = createSmoothing(rig.renderer)
    host.value.append(rig.renderer.domElement)
    rig.frameSize = { width, height }
    perspective = new THREE.PerspectiveCamera(title.camera.fov || 40, width / height, 1, 5000)
    orthographic = new THREE.OrthographicCamera()
    rig.camera = title.camera.fov ? perspective : orthographic
    selection = wireBox(new THREE.LineBasicMaterial({ color: getComputedStyle(host.value).getPropertyValue("--accent").trim(), depthTest: false }))
    selection.matrixAutoUpdate = false
    selection.visible = false
    for (const edge of selection.children) edge.layers.set(SELECTION_LAYER)
    perspective.layers.enable(SELECTION_LAYER)
    orthographic.layers.enable(SELECTION_LAYER)
    scene.add(selection)
    overlay = new THREE.Scene()
    overlay.add(proxy)
    rig.controls = new Gizmo(rig.camera, rig.renderer.domElement)
    rig.controls.addEventListener("change", invalidate)
    rig.controls.addEventListener("start", grab)
    rig.controls.addEventListener("end", release)
    rig.controls.addEventListener("drag", drag)
    overlay.add(rig.controls.getHelper())
    listen(rig.renderer.domElement)
    observer = new ResizeObserver(() => {
      const w = host.value.clientWidth
      const h = host.value.clientHeight
      if (!w || !h) return
      rig.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      rig.renderer.setSize(w, h)
      smoothing.resize()
      rig.frameSize = { width: w, height: h }
      fitCamera()
    })
    observer.observe(host.value)
    viewport.capture = capture
    viewport.vector = vector
    viewport.titleRect = titleRect
    viewport.canvas = rig.renderer.domElement
    viewport.redraw = invalidate
    sync()
  })

  onBeforeUnmount(() => {
    viewport.capture = null
    viewport.vector = null
    viewport.titleRect = null
    viewport.canvas = null
    viewport.redraw = null
    viewport.mirror = null
    cancelAnimationFrame(frame)
    observer.disconnect()
    cancelDrag()
    rig.controls.dispose()
    stage.dispose()
    for (const edge of selection.children) edge.geometry.dispose()
    selection.children[0].material.dispose()
    smoothing.dispose()
    rig.renderer.dispose()
    rig.renderer.forceContextLoss()
    rig.renderer.domElement.remove()
  })

  watch(() => title.camera.fov, value => {
    rig.camera = value ? perspective : orthographic
    rig.controls.camera = rig.camera
    fitCamera()
  })

  watch(() => [title.camera.fixedDistance, title.camera.pitch, title.camera.yaw, title.camera.tilt], fitCamera)
  watch(() => view.gizmo, invalidate)
  watch([() => view.section, () => view.render, () => view.camera], () => view.gizmo = null)
  watch(shapingWord, invalidate)
  watch(heldCentre, invalidate)
  watch([pan, orbit], applyView)
  watch(navigable, homeView, { flush: "sync" })
  watch(titleLoads, homeView)

  watch(() => view.render && [framing, view.resolution], fitCamera, { deep: true })

  watch(() => props.items, sync)
  watch(() => props.selected.join(), invalidate)
</script>

<template>
  <div ref="host" class="viewport" :class="{ navigable, panning }">
    <div ref="dot" class="centre-dot" hidden></div>
    <div v-if="navigable" class="toolbar">
      <div v-if="view.section === 'transform'" class="tools">
        <Button ghost :active="view.gizmo === mode" v-for="[mode, icon, title] of TOOLS" :key="icon" v-tooltip="{ text: title, tooltipClass: 'slow' }" :aria-label="title" :aria-pressed="view.gizmo === mode" :icon="icon" @click="view.gizmo = mode" />
      </div>
      <div class="tools">
        <Button ghost :active="orbiting" v-tooltip="{ text: 'Orbit the camera', tooltipClass: 'slow' }" aria-label="Orbit the camera" :aria-pressed="orbiting" icon="orbit" @click="toggleOrbit" />
        <Button ghost v-if="moved" v-tooltip="{ text: 'Reset the view', tooltipClass: 'slow' }" aria-label="Reset the view" icon="reset" @click="resetView" />
      </div>
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

  .toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 2;
    display: flex;
    gap: 8px;
  }

  .centre-dot {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    background: var(--accent);
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #000000;
    pointer-events: none;
  }

  .centre-dot[hidden] {
    display: none;
  }

  .tools {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .viewport :deep(canvas) {
    position: relative;
    z-index: 1;
    display: block;
    user-select: none;
  }

  .viewport.navigable :deep(canvas) {
    cursor: grab;
  }

  .viewport.panning :deep(canvas) {
    cursor: grabbing;
  }
</style>
