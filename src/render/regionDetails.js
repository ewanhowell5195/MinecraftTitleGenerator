import { MAX_DETAIL } from "../lib/texture/atlas/scales.js"
import { FADE_KINDS, SMOOTH_KINDS, WRAPPED_KINDS } from "../lib/texture/overlays/settings.js"
import { faceDepth } from "../lib/texture/material.js"
import { stripDetail } from "../lib/texture/paint/strip.js"
import { faceOptions } from "./objectLook.js"

function smoothDetail(base, smooth) {
  return smooth ? base * Math.ceil(MAX_DETAIL / base) : base
}

export function regionDetails(painted, targets, options) {
  const depth = faceDepth(options.depth)
  return (painted.layers ?? [painted]).map(({ look, assets }, layer) => {
    const faces = painted.layers ? faceOptions(targets[layer]) : options
    const smooth = assets.overlays.filter(({ layer, source }) => (SMOOTH_KINDS.has(source.generated) || FADE_KINDS.has(source.generated)) && layer.opacity > 0)
    const edgeFaded = assets.edgeOverlays.some(({ layer, generated }) => FADE_KINDS.has(generated) && layer.opacity > 0)
    const strip = look.source === "strip" ? stripDetail(assets.strip, depth) : 1
    const base = Number.isFinite(strip) ? strip : MAX_DETAIL
    const edgeGradient = look.customEdge && look.edgeFill === "gradient"
    const sideWrapped = smooth.some(({ layer }) => layer.sideWrap)
    const cracked = smooth.some(({ source }) => WRAPPED_KINDS.has(source.generated))
    return {
      front: smoothDetail(1, look.source === "gradient" || smooth.length > 0),
      edge: { along: smoothDetail(base, look.source === "gradient" || edgeGradient || cracked || smooth.some(({ layer }) => layer.edgeWrap)), deep: smoothDetail(base, cracked || edgeFaded) },
      internal: { along: smoothDetail(1, faces.internalFaces && (sideWrapped || (faces.customInternal ? faces.internalFill === "gradient" && faces.internalDirection !== "up" : edgeGradient))), deep: 1 },
      side: { along: smoothDetail(1, faces.sideFaces && (sideWrapped || faces.customSide && faces.sideFill === "gradient" && faces.sideDirection !== "along")), deep: 1 }
    }
  })
}
