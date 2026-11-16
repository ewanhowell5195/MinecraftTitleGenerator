export function escaped(text) {
  return text.replace(/[&<>"]/g, character => `&#${character.charCodeAt(0)};`)
}
