import { listPresets, submitPreset } from "#server/presets.js"

export const onRequestGet = listPresets
export const onRequestPost = submitPreset
