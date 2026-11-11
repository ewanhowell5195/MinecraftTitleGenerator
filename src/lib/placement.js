import { lineArc, rowStart } from "./rows.js"

export function placementOf(object, title, { height, capHeight, depth, reference, scale, wordScale, outlineGrow }) {
  const start = rowStart(object, title)
  const arc = lineArc(object, title)
  const word = { scale: wordScale, userScale: [object.wordScaleX, object.wordScaleY, object.wordScaleZ], rotate: [object.wordRotationX, object.wordRotationY, object.wordRotationZ], translate: [object.wordTranslateX, object.wordTranslateY, object.wordTranslateZ] }
  const user = { rotate: [object.rotationX, object.rotationY, object.rotationZ], translate: [object.translateX, object.translateY, object.translateZ], matchOffset: object.matchOffset, outlineGrow, userScale: [object.scaleX, object.scaleY, object.scaleZ], word }

  function depthCentre(front, size) {
    if (object.depthAnchor === "back") return front - size * (reference - depth / 2)
    if (object.depthAnchor === "middle") return front - size * reference / 2
    return front - size * depth / 2
  }

  if (object.type === "bottom") return { ...user, scale, type: [0.78042, 1.67665, 0.77035], offset: [0, -(0.77035 * (height * 2 + 18.9862) + start + 1.67665 * arc.top), depthCentre(7.6764, 0.77035)], rotation: 90, anchor: { y: "top", z: "front" } }
  if (object.type === "small") return { ...user, scale, type: [0.39732, 0.43021, 0.33472], offset: [0, -(start + 3.6943 + capHeight * 0.43021 + 0.43021 * arc.top), depthCentre(3.0762, 0.33472)], rotation: -0.4, anchor: { y: "top", z: "middle" } }
  return { ...user, scale, type: [1, 1, 1], offset: [0, start + arc.bottom, depthCentre(11, 1)], rotation: 0, anchor: { y: "bottom", z: "back" } }
}
