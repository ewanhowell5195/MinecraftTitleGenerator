export function rgbOf(hex) {
  return [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16))
}

export function hexOf(rgb) {
  return `#${rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`
}
