const TEXT_FIELDS = "input[type=text], textarea"

export function shortcutFor(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === "s") return "save"
  if (key === "o") return "open"
  if (event.target.matches(TEXT_FIELDS)) return null
  if (key === "z") return event.shiftKey ? "redo" : "undo"
  if (key === "y") return "redo"
  return null
}
