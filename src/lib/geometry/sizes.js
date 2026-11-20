const EDGE_PERCENT = 10

export function faceDepth(depth) {
  return Math.max(1, Math.round(depth))
}

export function edgeReach(capHeight, percent = EDGE_PERCENT) {
  return capHeight * percent / 100
}
