import { watch } from "vue"
import { CAMERA_PRESETS, DEFAULT_CAMERA, cameraChanges, cameraPreset, setCamera } from "../settings/camera.js"

const PRESETS = CAMERA_PRESETS.map(({ value, label }) => ({ value, label })).concat({ value: "custom", label: "Custom" })
const ANGLE_KEYS = Object.keys(CAMERA_PRESETS[0].camera)

let custom = null

function pick(value, { object }) {
  const chosen = value === "custom" ? custom : CAMERA_PRESETS.find(item => item.value === value)?.camera
  if (chosen) Object.assign(object, chosen)
}

export const CAMERA_PANEL = {
  id: "camera",
  on: "camera",
  title: "Camera",
  modified: (get, { object }) => Object.keys(cameraChanges(object)).length > 0,
  reset: ({ object }) => setCamera(object, DEFAULT_CAMERA),
  setup({ get, object }) {
    watch(() => ANGLE_KEYS.map(get), values => {
      if (!cameraPreset(object)) custom = Object.fromEntries(ANGLE_KEYS.map((key, index) => [key, values[index]]))
    }, { immediate: true })
  },
  controls: [
    { type: "segments", radio: true, label: "Preset", options: PRESETS, read: (get, { object }) => cameraPreset(object) ?? "custom", write: pick },
    { type: "slider", key: "pitch", label: "Pitch", min: -89, max: 89, step: 0.01, hint: "How far below the text the camera sits, in degrees. Negative looks down from above." },
    { type: "slider", key: "yaw", label: "Yaw", min: -89, max: 89, step: 0.01, hint: "How far round to the side the camera sits, in degrees." },
    { type: "slider", key: "tilt", label: "Tilt", min: -45, max: 45, step: 0.005, hint: "Turns the camera up or down on the spot after aiming it at the text, in degrees." },
    { type: "slider", key: "fov", label: "Field of view", min: 0, max: 90, step: 0.1, hint: "0 is orthographic." },
    { type: "toggle", key: "fixedDistance", label: "Fixed camera distance", hint: "The camera normally moves with the top text's width so its ends always lean the same. This keeps it still instead, so longer text leans more at the ends", shown: get => get("fov") }
  ]
}
