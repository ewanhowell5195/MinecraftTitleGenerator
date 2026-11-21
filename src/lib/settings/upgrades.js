import { typeDefaults } from "./defaults.js"

export const FILE_VERSION = 8
const OLD_WAVE = { level: 45, randomness: 60 }

function restartTilesPerCharacter(entry) {
  return entry.textureSource === "tileable" ? { tileablePerCharacter: true, ...entry } : entry
}

function restartLineTiles(line) {
  const restarted = restartTilesPerCharacter(line)
  return Array.isArray(line.words) ? { ...restarted, words: line.words.map(restartTilesPerCharacter) } : restarted
}

function separateMatchScale(line) {
  if (line.matchWidth === undefined || line.matchWidth === null) return line
  const { scaleX, linkScale, ...upgraded } = line
  if (scaleX !== undefined) upgraded.matchScale = scaleX
  if (linkScale === undefined || linkScale === null) return upgraded
  return { ...upgraded, matchScaleY: true, scaleY: linkScale }
}

function widenBlockSerif(line) {
  if (line.font !== "block-serif") return line
  return { ...line, spacing: (line.spacing ?? typeDefaults(line.type ?? "top").spacing) + 2 }
}

function anchorDepthAtFront(line) {
  if ((line.type ?? "top") === "bottom" || "depthAnchor" in line) return line
  const deepened = "depth" in line || "wordDepth" in line || Array.isArray(line.words) && line.words.some(word => "wordDepth" in word)
  return deepened ? { ...line, depthAnchor: "front" } : line
}

function turnDoorsInPlace(line) {
  return line.twistDoor && !("twistDoorRoll" in line) ? { ...line, twistDoorRoll: false } : line
}

function oldWave(layer) {
  if (layer.overlay === "wave") return { randomness: OLD_WAVE.randomness, ...layer }
  if (layer.overlay === "wave_inverted") return { randomness: OLD_WAVE.randomness, ...layer, overlay: "wave", angle: 180, level: 100 - (layer.level ?? OLD_WAVE.level) }
  return layer
}

function turnInvertedWaves(value) {
  if (Array.isArray(value)) return value.map(turnInvertedWaves)
  if (!value || typeof value !== "object") return value
  return oldWave(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, turnInvertedWaves(item)])))
}

function matchFullRow(line) {
  return line.matchWidth !== undefined && line.matchWidth !== null && !("matchBottom" in line) ? { ...line, matchBottom: false } : line
}

const UPGRADES = [[2, restartLineTiles], [3, separateMatchScale], [4, widenBlockSerif], [5, anchorDepthAtFront], [6, turnDoorsInPlace], [7, turnInvertedWaves], [8, matchFullRow]]

export function upgradeLine(line, version) {
  return UPGRADES.reduce((upgraded, [to, upgrade]) => version < to ? upgrade(upgraded) : upgraded, line)
}

const TWIST_ANCHORS = [["twistRibbonAnchor", "twistRibbonCentre", "twistRibbonMirror"], ["twistDoorAnchor", "twistDoorCentre", "twistDoorSame"]]
const ANCHOR_CENTRES = { left: 0, centre: 50, right: 100 }

export function twistCentres(values) {
  const converted = { ...values }
  for (const [anchor, centre, same] of TWIST_ANCHORS) {
    if (!(anchor in converted)) continue
    converted[centre] ??= ANCHOR_CENTRES[converted[anchor]] ?? 50
    if (converted[anchor] === "right") converted[same] = true
    delete converted[anchor]
  }
  return converted
}
