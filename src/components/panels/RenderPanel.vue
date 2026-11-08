<script setup>
  import { computed, ref, shallowRef } from "vue"
  import { canvasLimit } from "../../lib/canvas.js"
  import { FRAMINGS, MINECRAFT_MODES, framing, framingModified, outlineModified, paddingScale, renderFramed, renderVector, resetFraming, resetOutline, resolutionLimit, setAspect, setResolution, textureSize, textureSizes } from "../../lib/framing.js"
  import { scene, titleFileName } from "../../lib/scene.js"
  import { submitStats } from "../../lib/stats.js"
  import { download } from "../../lib/ui.js"
  import { DEFAULT_FOV, view } from "../../lib/view.js"
  import ColourPicker from "../ColourPicker.vue"
  import Dropdown from "../Dropdown.vue"
  import GradientEditor from "../GradientEditor.vue"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import RenderProgress from "../RenderProgress.vue"
  import RenderResult from "../RenderResult.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const PRESETS = [{ value: 1024, label: "1K" }, { value: 2048, label: "2K" }, { value: 4096, label: "4K" }, { value: 8192, label: "8K" }]

  const custom = ref(!PRESETS.some(({ value }) => value === view.resolution && value <= resolutionLimit()))
  const progress = ref(null)
  const failed = ref("")
  const result = shallowRef(null)

  const max = canvasLimit()
  const presets = computed(() => PRESETS.filter(({ value }) => value <= resolutionLimit()).map(preset => ({ ...preset, title: `Around ${preset.value} pixels` })).concat([{ value: "custom", label: "Custom", title: "Custom size" }]))
  const sizes = computed(() => textureSizes().map(size => ({ value: size, label: String(size), title: `${size} pixel texture` })))
  const padding = computed({
    get: () => Math.round(framing.padding * paddingScale()),
    set: value => framing.padding = value / paddingScale()
  })

  function toggleOutline(on) {
    const widths = scene.objects.filter(object => !object.hidden).map(object => object.wordBorder ?? object.border)
    if (on && widths.length) framing.outlineWidth = Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length * 10) / 10
    framing.outline = on
  }

  function pick(size) {
    custom.value = size === "custom"
    if (!custom.value) view.resolution = size
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  let rendering = null

  async function render() {
    submitStats()
    rendering = new AbortController()
    progress.value = 0
    failed.value = ""
    try {
      await nextFrame()
      result.value = await renderFramed({ signal: rendering.signal, progress: value => progress.value = value })
      if (!result.value) failed.value = "Nothing in frame."
    } catch (err) {
      if (rendering.signal.aborted) return
      failed.value = `Render failed: ${err.message}`
      throw err
    } finally {
      progress.value = null
      rendering = null
    }
  }

  function cancel() {
    rendering?.abort()
  }

  function saveVector() {
    submitStats()
    failed.value = ""
    try {
      const svg = renderVector()
      if (!svg) {
        failed.value = "Nothing in frame."
        return
      }
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
      download(`${titleFileName()}.svg`, url)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (err) {
      failed.value = `Render failed: ${err.message}`
      throw err
    }
  }

  function resetCamera() {
    view.fov = DEFAULT_FOV
    view.fixedDistance = false
  }
</script>

<template>
  <Panel title="Framing" :modified="framingModified()" @reset="resetFraming">
    <Segments :options="FRAMINGS" v-model="framing.tab" />
    <template v-if="framing.tab === 'custom'">
      <div class="field">
        <span class="label">Size</span>
        <div class="input-row">
          <input type="number" :value="framing.width" min="1" :max="max" title="Width" @input="setResolution('width', $event.target.value)" @change="$event.target.value = framing.width">
          <span class="times">&times;</span>
          <input type="number" :value="framing.height" min="1" :max="max" title="Height" @input="setResolution('height', $event.target.value)" @change="$event.target.value = framing.height">
          <button class="icon-button" :class="{ active: framing.linked }" @click="framing.linked = !framing.linked" title="Link width and height"><Icon name="link" :size="16" /></button>
        </div>
      </div>
      <div class="field">
        <span class="label">Aspect ratio</span>
        <div class="input-row">
          <input type="number" :value="framing.aspectWidth" min="1" :max="max" title="Aspect width" @input="setAspect('aspectWidth', $event.target.value)" @change="$event.target.value = framing.aspectWidth">
          <span class="times">:</span>
          <input type="number" :value="framing.aspectHeight" min="1" :max="max" title="Aspect height" @input="setAspect('aspectHeight', $event.target.value)" @change="$event.target.value = framing.aspectHeight">
        </div>
      </div>
    </template>
    <Dropdown v-if="framing.tab === 'minecraft'" label="Texture mode" :options="MINECRAFT_MODES" v-model="framing.mode" />
    <template v-else>
      <Toggle label="Background" v-model="framing.backgroundEnabled" />
      <template v-if="framing.backgroundEnabled">
        <GradientEditor v-model="framing.backgroundStops" :smooth="framing.backgroundSmooth" :angle="framing.backgroundAngle" :min="1" />
        <template v-if="framing.backgroundStops.length > 1">
          <Toggle label="Smooth gradient" v-model="framing.backgroundSmooth" />
          <Slider label="Angle" v-model="framing.backgroundAngle" :min="0" :max="360" />
        </template>
      </template>
      <Slider label="Padding" v-model="padding" :min="0" :max="Math.round(256 * paddingScale())" />
    </template>
  </Panel>

  <Panel title="Outline" :modified="outlineModified()" @reset="resetOutline">
    <Toggle label="Second outline" hint="Goes around the whole title" :model-value="framing.outline" @update:model-value="toggleOutline" />
    <template v-if="framing.outline">
      <ColourPicker v-model="framing.outlineColour" />
      <Slider label="Outline width" v-model="framing.outlineWidth" :min="0" :max="8" :step="0.1" />
    </template>
  </Panel>

  <Panel title="Image">
    <template v-if="framing.tab === 'minecraft'">
      <div class="field">
        <span class="label">Texture size</span>
        <Segments :options="sizes" :model-value="textureSize()" @update:model-value="framing.textureSize = $event" />
      </div>
      <p class="hint">The title is rendered at the size it takes up in the texture.</p>
    </template>
    <template v-else>
      <div class="field">
        <span class="label">Resolution</span>
        <Segments :options="presets" :model-value="custom ? 'custom' : view.resolution" @update:model-value="pick" />
      </div>
      <Slider v-if="custom" label="Size" v-model="view.resolution" :min="128" :max="resolutionLimit()" log />
      <p class="hint">The longer side of the title, in pixels. The final size may differ slightly.</p>
    </template>
    <Toggle label="Antialiasing" hint="Smoother edges, renders take longer" v-model="view.antialias" />
    <button class="primary wide big" :disabled="progress !== null" @click="render">
      <Icon name="camera" :size="17" />
      <span>Render image</span>
    </button>
    <button v-if="framing.tab !== 'minecraft'" class="wide" :disabled="progress !== null" @click="saveVector">
      <Icon name="download" :size="16" />
      <span>Save SVG</span>
    </button>
    <p v-if="failed" class="failed">{{ failed }}</p>
  </Panel>

  <RenderProgress v-if="progress !== null" :progress="progress" @close="cancel" />
  <RenderResult v-if="result" :image="result" :name="`${titleFileName()}.png`" @close="result = null" />

  <Panel title="Camera" :modified="view.fov !== DEFAULT_FOV || view.fixedDistance" @reset="resetCamera">
    <Slider label="Field of view" v-model="view.fov" :min="0" :max="90" />
    <p class="hint">0 is orthographic.</p>
    <Toggle v-if="view.fov" label="Fixed camera distance" hint="The camera normally moves with the top text's width so its ends always lean the same. This keeps it still instead, so longer text leans more at the ends" v-model="view.fixedDistance" />
  </Panel>
</template>

<style scoped>
  .big {
    padding: 12px 16px;
    font-size: var(--font-lg);
  }

  .input-row input[type="number"] {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .times {
    color: var(--faint);
  }

  .failed {
    margin: 0;
    font-size: var(--font-md);
    color: var(--danger);
  }
</style>
