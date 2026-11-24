export function shortcutFor(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === "s") return "save"
  if (key === "o") return "open"
  if (event.target.matches("input[type=text], textarea")) return null
  if (key === "z") return event.shiftKey ? "redo" : "undo"
  if (key === "y") return "redo"
  return null
}
