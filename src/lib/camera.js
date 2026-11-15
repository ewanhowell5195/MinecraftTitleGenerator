export const CAMERA_PRESETS = [
  { value: "minecraft", label: "Minecraft", camera: { pitch: 30.67, yaw: 0, tilt: 7.285, fov: 43 } },
  { value: "shallow", label: "Shallow", camera: { pitch: 20.8, yaw: 0, tilt: -2.8, fov: 51.5 } },
  { value: "front", label: "Front orthographic", camera: { pitch: 0, yaw: 0, tilt: 0, fov: 0 } }
]

export const DEFAULT_CAMERA = { ...CAMERA_PRESETS[0].camera, fixedDistance: false }

export const CAMERA_KEYS = Object.keys(DEFAULT_CAMERA)

export function fullCamera(values) {
  return { ...DEFAULT_CAMERA, ...Object.fromEntries(CAMERA_KEYS.filter(key => values?.[key] !== undefined).map(key => [key, values[key]])) }
}

export function cameraChanges(camera) {
  return Object.fromEntries(CAMERA_KEYS.filter(key => camera?.[key] !== undefined && camera[key] !== DEFAULT_CAMERA[key]).map(key => [key, camera[key]]))
}

export function cameraPreset(camera) {
  return CAMERA_PRESETS.find(preset => Object.entries(preset.camera).every(([key, value]) => Math.abs(camera[key] - value) < 1e-9))?.value ?? null
}

export function setCamera(target, values) {
  Object.assign(target, fullCamera(values))
}
