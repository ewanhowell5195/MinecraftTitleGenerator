export const CONTROLS = new Set(["block", "button", "colour", "colours", "download", "dropdown", "field", "gradient", "group", "heading", "hint", "layerRows", "notice", "number", "pair", "picker", "reuse", "row", "search", "segments", "slider", "stack", "tiles", "toggle", "upload", "version"])

export function checkControls(id, controls, blocks) {
  const unknown = controls.find(control => !CONTROLS.has(control.type) || control.type === "block" && !blocks[control.name])
  if (unknown) throw new Error(`the ${id} panel has a ${unknown.name ?? unknown.type} control, which can't be drawn`)
}
