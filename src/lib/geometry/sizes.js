export function faceDepth(depth) {
  return Math.max(1, Math.round(depth))
}

export function edgeReach(capHeight, percent = 10) {
  return capHeight * percent / 100
}
