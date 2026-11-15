<script>
  let custom = null
</script>

<script setup>
  import { computed, watch } from "vue"
  import { CAMERA_PRESETS, DEFAULT_CAMERA, cameraChanges, cameraPreset, setCamera } from "../../lib/camera.js"
  import { scene } from "../../lib/scene.js"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Slider from "../Slider.vue"
  import Toggle from "../Toggle.vue"

  const PRESETS = CAMERA_PRESETS.map(({ value, label }) => ({ value, label })).concat({ value: "custom", label: "Custom" })
  const ANGLE_KEYS = Object.keys(CAMERA_PRESETS[0].camera)

  const camera = scene.camera
  const preset = computed(() => cameraPreset(camera) ?? "custom")
  const modified = computed(() => Object.keys(cameraChanges(camera)).length > 0)

  watch(() => ANGLE_KEYS.map(key => camera[key]), values => {
    if (!cameraPreset(camera)) custom = Object.fromEntries(ANGLE_KEYS.map((key, index) => [key, values[index]]))
  }, { immediate: true })

  function pick(value) {
    const chosen = value === "custom" ? custom : CAMERA_PRESETS.find(item => item.value === value)?.camera
    if (chosen) Object.assign(camera, chosen)
  }
</script>

<template>
  <Panel title="Camera" :modified="modified" @reset="setCamera(camera, DEFAULT_CAMERA)">
    <Segments radio label="Preset" :options="PRESETS" :model-value="preset" @update:model-value="pick" />
    <Slider label="Pitch" v-model="camera.pitch" :min="-89" :max="89" :step="0.01" hint="How far below the text the camera sits, in degrees. Negative looks down from above." />
    <Slider label="Yaw" v-model="camera.yaw" :min="-89" :max="89" :step="0.01" hint="How far round to the side the camera sits, in degrees." />
    <Slider label="Tilt" v-model="camera.tilt" :min="-45" :max="45" :step="0.005" hint="Turns the camera up or down on the spot after aiming it at the text, in degrees." />
    <Slider label="Field of view" v-model="camera.fov" :min="0" :max="90" :step="0.1" hint="0 is orthographic." />
    <Toggle v-if="camera.fov" label="Fixed camera distance" hint="The camera normally moves with the top text's width so its ends always lean the same. This keeps it still instead, so longer text leans more at the ends" v-model="camera.fixedDistance" />
  </Panel>
</template>
