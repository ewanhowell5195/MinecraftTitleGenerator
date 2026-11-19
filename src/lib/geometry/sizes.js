const EDGE_SHARE = 0.1

export function faceDepth(depth) {
  return Math.max(1, Math.round(depth))
}

export function edgeReach(capHeight) {
  return capHeight * EDGE_SHARE
}
