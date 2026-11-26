function rank(char) {
  return /[a-z]/i.test(char) ? 0 : /\d/.test(char) ? 1 : 2
}

export function fontCharacters(font) {
  return Object.keys(font.glyphs).filter(char => !/[\u{1F629}\u{1F633}]/u.test(char)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(" ")
}

export function fontInfoTitle({ entry, customName }) {
  return entry.value?.name || customName.value || "Font"
}
