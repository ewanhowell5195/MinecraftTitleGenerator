import { deflateSync, inflateSync } from "three/addons/libs/fflate.module.js"
import { cameraChanges } from "../settings/camera.js"
import { opens, readTitleBytes, unknownSetting, writeLines } from "./linkKeys.js"
import { LINE, sameValue } from "../settings/settings.js"
import { FILE_VERSION, upgradeLine } from "../settings/upgrades.js"
import { countUploads, withoutUploads } from "./uploads.js"

// older titles keep the twist anchors on the line
const LINE_ONLY = new Set(["words", "matchWidth", "twistRibbonAnchor", "twistDoorAnchor"])
const PREFIXES = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function toBase64Url(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function fromBase64Url(text) {
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0))
}

function lineKey(key) {
  return LINE.has(key) || LINE_ONLY.has(key)
}

export function hoisted(line) {
  if (!line.words?.length) return line
  const [first, ...rest] = line.words
  const shared = Object.keys(first).filter(key => !lineKey(key) && rest.every(word => key in word && sameValue(word[key], first[key])))
  if (!shared.length) return line
  return { ...line, ...Object.fromEntries(shared.map(key => [key, first[key]])), words: line.words.map(word => Object.fromEntries(Object.entries(word).filter(([key]) => !shared.includes(key)))) }
}

export function lowered(line) {
  if (!line.words) return line
  const shared = Object.entries(line).filter(([key]) => !lineKey(key))
  if (!shared.length) return line
  return { ...Object.fromEntries(Object.entries(line).filter(([key]) => lineKey(key))), words: line.words.map(word => ({ ...Object.fromEntries(shared), ...word })) }
}

export function encodeTitle({ version, lines, camera = null }) {
  if (version * 2 + 1 >= PREFIXES.length) throw new Error(`links can't hold version ${version}`)
  const changes = cameraChanges(camera)
  const bytes = writeLines(lines.map(line => hoisted(withoutUploads(line))), Object.keys(changes).length ? changes : null)
  const packed = deflateSync(bytes, { level: 9 })
  const compressed = packed.length < bytes.length
  return { code: `${PREFIXES[version * 2 + (compressed ? 1 : 0)]}${toBase64Url(compressed ? packed : bytes)}`, skipped: lines.reduce((total, line) => total + countUploads(line), 0) }
}

export function decodeTitle(code) {
  try {
    const prefix = PREFIXES.indexOf(code[0])
    if (prefix < 0) throw new Error("the link has no version")
    const bytes = fromBase64Url(code.slice(1))
    const { lines, camera } = readTitleBytes(prefix % 2 ? inflateSync(bytes) : bytes)
    return { version: prefix >> 1, lines: lines.map(lowered), ...(camera && { camera }) }
  } catch {
    throw new Error("it is incomplete or damaged")
  }
}

export function openableTitle(code) {
  const title = decodeTitle(code)
  const unknown = unknownSetting(title.lines, undefined, opens)
  if (unknown) throw new Error(`it has a setting that can't be read: ${unknown}`)
  return title
}

const bodies = new Map()

function upgradedBody(code) {
  const body = code.slice(1)
  if (PREFIXES.indexOf(code[0]) >> 1 >= FILE_VERSION) return body
  try {
    const { version, lines, camera } = decodeTitle(code)
    const upgraded = lines.map(line => upgradeLine(line, version))
    return sameValue(upgraded, lines) ? body : encodeTitle({ version: FILE_VERSION, lines: upgraded, camera }).code.slice(1)
  } catch {
    return body
  }
}

export function titleBody(code) {
  if (!bodies.has(code)) bodies.set(code, upgradedBody(code))
  return bodies.get(code)
}
