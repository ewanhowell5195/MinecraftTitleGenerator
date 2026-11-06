import { deletePreset, getPreset, renamePreset } from "../../../../src/server/presets.js"

export const onRequestGet = getPreset
export const onRequestPatch = renamePreset
export const onRequestDelete = deletePreset
