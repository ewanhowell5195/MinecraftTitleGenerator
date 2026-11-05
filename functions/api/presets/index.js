import { listPresets, submitPreset } from "../../../src/server/presets.js"

export const onRequestGet = listPresets
export const onRequestPost = submitPreset
