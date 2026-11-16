export function titleCase(id) {
  return id.replace(/_|-/g, " ").replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

export function capitalWords(text) {
  return text.toLowerCase().replace(/(?<=^|\s)([^\p{L}\p{N}\s]*)(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())
}
