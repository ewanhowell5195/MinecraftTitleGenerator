import { R } from "../paint/draw.js"

export const MAX_DETAIL = 4
export const REGION_KINDS = ["front", "edge", "internal", "side"]

export function detailOf(detail) {
  return typeof detail === "object" && detail ? detail : { along: detail ?? 1, deep: detail ?? 1 }
}

export function regionScales(details) {
  return Object.fromEntries(REGION_KINDS.map(kind => {
    const { along, deep } = detailOf(details?.[kind])
    return [kind, { along: R * along, deep: R * deep }]
  }))
}
