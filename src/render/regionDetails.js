import { MAX_DETAIL } from "../lib/texture/atlas/scales.js"
import { FADE_KINDS, PLACED_KINDS, SMOOTH_KINDS, WRAPPED_KINDS } from "../lib/texture/overlays/settings.js"
import { SMOOTH_KINDS as MESH_SMOOTH_KINDS } from "../lib/texture/overlays/outlines.js"
import { faceDepth } from "../lib/geometry/sizes.js"
import { stripDetail } from "../lib/texture/paint/strip.js"
import { faceOptions } from "./objectLook.js"

function smoothDetail(base, smooth) {
  return smooth ? base * Math.ceil(MAX_DETAIL / base) : base
}

export function regionDetails(painted, targets, options, mesh = false) {
  const depth = faceDepth(options.depth)
  return (painted.layers ?? [painted]).map(({ look, assets }, layer) => {
    const faces = painted.layers ? faceOptions(targets[layer]) : options
    const smooth = assets.overlays.filter(({ layer, source }) => (SMOOTH_KINDS.has(source.generated) || PLACED_KINDS.has(source.generated) || FADE_KINDS.has(source.generated) || mesh && MESH_SMOOTH_KINDS.has(source.generated)) && layer.opacity > 0)
    const edgeFaded = assets.edgeOverlays.some(({ layer, generated }) => FADE_KINDS.has(generated) && layer.opacity > 0)
    const base = look.source === "strip" ? stripDetail(assets.strip, depth) : 1
    const edgeGradient = look.customEdge && look.edgeFill === "gradient"
    const sideWrapped = smooth.some(({ layer }) => layer.sideWrap)
    const cracked = smooth.some(({ source }) => WRAPPED_KINDS.has(source.generated))
    const camera = look.source === "cover" && look.customCoverAlign === "camera"
    return {
      front: smoothDetail(1, look.source === "gradient" || look.source === "cover" || smooth.length > 0),
      edge: { along: smoothDetail(base, look.source === "gradient" || look.source === "cover" || edgeGradient || cracked || mesh && options.fadeCurves || smooth.some(({ layer }) => layer.edgeWrap)), deep: smoothDetail(base, camera || cracked || edgeFaded) },
      internal: { along: smoothDetail(1, faces.internalFaces && (camera || sideWrapped || (faces.customInternal ? faces.internalFill === "gradient" && faces.internalDirection !== "up" : edgeGradient))), deep: smoothDetail(1, faces.internalFaces && camera) },
      side: { along: smoothDetail(1, faces.sideFaces && (camera || sideWrapped || faces.customSide && faces.sideFill === "gradient" && faces.sideDirection !== "along")), deep: smoothDetail(1, faces.sideFaces && camera) }
    }
  })
}
