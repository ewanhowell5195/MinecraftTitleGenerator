import { addSaved, changeSaved, listSaved, removeSaved } from "#server/saved.js"

export const onRequestGet = listSaved
export const onRequestPost = addSaved
export const onRequestPatch = changeSaved
export const onRequestDelete = removeSaved
