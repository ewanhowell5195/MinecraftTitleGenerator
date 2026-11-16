export function rgbOf(hex) {
  return [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16))
}

export function hexOf(rgb) {
  return `#${rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`
}

export function hexOfPacked(colour) {
  return hexOf([colour & 255, colour >> 8 & 255, colour >> 16 & 255])
}

export function hexOfNumber(colour) {
  return `#${((colour >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`
}

export function packed(data, at) {
  return data[at] | data[at + 1] << 8 | data[at + 2] << 16
}
