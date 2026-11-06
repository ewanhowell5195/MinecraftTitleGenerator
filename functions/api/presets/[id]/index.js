import { deletePreset, getPreset, renamePreset, replacePreset } from "../../../../src/server/presets.js"

export const onRequestGet = getPreset
export const onRequestPatch = renamePreset
export const onRequestPut = replacePreset
export const onRequestDelete = deletePreset
