import { activeOverlays, textureEntry } from "../lib/settings/textureDefaults.js"

const CUSTOM_SOURCES = { standard: "texture", tileable: "tile", strip: "strip", cover: "cover" }

function sourceOf(object, list) {
  if (object.textureSource === "gradient") return "gradient"
  if (object.textureSource === "tileable") return "tile"
  if (object.textureSource === "custom") return object.customTexture ? CUSTOM_SOURCES[object.customTextureMode] : "texture"
  if (list && textureEntry(list, object)?.type === "strip") return "strip"
  return "texture"
}

function plainStops(stops) {
  return stops.map(stop => ({ colour: stop.colour, position: stop.position }))
}

export function lookOf(object, layer, font, list) {
  return {
    font: font?.id,
    source: sourceOf(object, list),
    textureSource: object.textureSource,
    texture: object.texture,
    textureVariant: object.textureVariant,
    tileable: object.tileable,
    tileableVariant: object.tileableVariant,
    tileableSource: object.tileableSource,
    minecraftTexture: object.minecraftTexture,
    minecraftVersion: object.minecraftVersion,
    customTexture: object.customTexture,
    stops: plainStops(object.stops),
    smooth: object.smooth,
    gradientAngle: object.gradientAngle,
    arcGradient: object.arcGradient,
    overlays: activeOverlays(list, object, "overlays", layer).map(entry => ({ ...entry })),
    edgeOverlays: activeOverlays(list, object, "edgeOverlays", layer).map(entry => ({ ...entry })),
    tileableScale: object.tileableScale,
    tileableXOffset: object.tileableXOffset,
    tileableYOffset: object.tileableYOffset,
    tileableRandomRotations: object.tileableRandomRotations,
    tileableRandomMirroring: object.tileableRandomMirroring,
    tileableTileEdges: object.tileableTileEdges,
    tileablePerCharacter: object.tileablePerCharacter,
    disableFontOverlay: object.disableFontOverlay,
    customCoverX: object.customCoverAlign === "camera" ? 50 : object.customCoverX,
    customCoverY: object.customCoverAlign === "camera" ? 50 : object.customCoverY,
    customCoverAlign: object.customCoverAlign,
    customStripPerCharacter: object.customStripPerCharacter,
    hue: object.hue,
    saturation: object.saturation,
    brightness: object.brightness,
    contrast: object.contrast,
    colour: object.colour,
    blend: object.blend,
    colourOpacity: object.colourOpacity,
    customBorder: object.customBorder,
    borderColour: object.borderColour,
    fade: object.fade,
    outerFade: object.outerFade,
    outerFadeOpacity: object.outerFadeOpacity,
    customEdge: object.customEdge,
    edgeColour: object.edgeColour,
    edgeBrightness: object.edgeBrightness,
    edgeFill: object.edgeFill,
    edgeStops: plainStops(object.edgeStops),
    edgeSmooth: object.edgeSmooth,
    wordedFaces: object.customEdge && object.edgeFill === "gradient" || object.customInternal && object.internalFill === "gradient" && object.internalDirection === "along" || object.customSide && object.sideFill === "gradient" && object.sideDirection === "along"
  }
}

export function faceOptions(target) {
  return {
    internalFaces: target.internalFaces,
    internalFade: target.fadeInternal ? target.internalFade / 100 : null,
    internalFadeOpacity: 1 - target.internalFadeOpacity / 100,
    customInternal: target.customInternal,
    internalColour: target.internalColour,
    internalBrightness: target.internalBrightness,
    internalFill: target.internalFill,
    internalStops: plainStops(target.internalStops),
    internalSmooth: target.internalSmooth,
    internalDirection: target.internalDirection,
    sideFaces: target.sideFaces,
    sideFade: target.fadeSides ? target.sideFade / 100 : null,
    sideFadeOpacity: 1 - target.sideFadeOpacity / 100,
    customSide: target.customSide,
    sideColour: target.sideColour,
    sideBrightness: target.sideBrightness,
    sideFill: target.sideFill,
    sideStops: plainStops(target.sideStops),
    sideSmooth: target.sideSmooth,
    sideDirection: target.sideDirection,
    customEdge: target.customEdge,
    edgeColour: target.edgeColour,
    edgeFill: target.edgeFill,
    edgeStops: plainStops(target.edgeStops),
    edgeSmooth: target.edgeSmooth
  }
}
