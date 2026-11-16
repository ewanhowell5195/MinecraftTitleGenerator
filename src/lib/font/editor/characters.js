import { CREEPER, DEFAULT_ORDER, OPENING_QUOTE, TERMINATOR_CLOSE, TERMINATOR_OPEN } from "../order.js"

export const SPACE_CHAR = " "
export const REQUIRED_CHARACTERS = Array.from(DEFAULT_ORDER).filter(char => char !== CREEPER)
export const ALWAYS_REQUIRED = [TERMINATOR_OPEN, TERMINATOR_CLOSE]

const NAMES = { [CREEPER]: "Creeper A", [OPENING_QUOTE]: "Opening quote", "'": "Closing quote", [TERMINATOR_OPEN]: "Left line terminator", [TERMINATOR_CLOSE]: "Right line terminator", [SPACE_CHAR]: "Space" }
const LABELS = { [CREEPER]: "Creeper", [OPENING_QUOTE]: String.fromCodePoint(0x2018), "'": String.fromCodePoint(0x2019), [SPACE_CHAR]: "Space" }
const NOTHING_TO_DRAW = /^[\p{M}\p{Cf}]$/u

export function hasCase(char) {
  const upper = char.toUpperCase()
  const lower = char.toLowerCase()
  return upper !== lower && Array.from(upper).length === 1 && Array.from(lower).length === 1 && upper.toLowerCase() === lower && lower.toUpperCase() === upper
}

function canonical(char) {
  return hasCase(char) ? char.toLowerCase() : char
}

function isUpper(char) {
  return hasCase(char) && char === char.toUpperCase()
}

export function shownAs(char, letterCase) {
  return letterCase === "upper" && hasCase(char) ? char.toUpperCase() : char
}

export function characterName(char, letterCase) {
  return NAMES[char] ?? shownAs(char, letterCase)
}

export function characterLabel(char, letterCase) {
  return LABELS[char] ?? shownAs(char, letterCase)
}

function withCases(font, list) {
  return font.letterCase === "both" ? list.flatMap(char => hasCase(char) ? [char.toUpperCase(), char] : [char]) : list
}

function requiredOf(font) {
  return font.requireCharacters === false ? REQUIRED_CHARACTERS.filter(char => !font.omitted?.includes(char)) : REQUIRED_CHARACTERS
}

export function charactersOf(font) {
  return (font.creeper ? [CREEPER] : []).concat(withCases(font, requiredOf(font)), withCases(font, font.extras), font.defineSpace ? [SPACE_CHAR] : [])
}

export const MULTICASE_CHARACTERS = withCases({ letterCase: "both" }, REQUIRED_CHARACTERS)

export function isOptional(char) {
  return !REQUIRED_CHARACTERS.includes(canonical(char))
}

export function canDelete(font, char) {
  return isOptional(char) || font.requireCharacters === false && !ALWAYS_REQUIRED.includes(char)
}

export function setRequireCharacters(font, on) {
  return { ...font, requireCharacters: on, omitted: on ? [] : font.omitted ?? [] }
}

export function extrasOf(chars) {
  return Array.from(new Set(chars.map(canonical).filter(char => isOptional(char) && char !== CREEPER && char !== SPACE_CHAR)))
}

export function addCharacters(font, text) {
  let next = font
  const added = []
  const refused = []
  for (const typed of Array.from(text.normalize("NFC"))) {
    const char = canonical(typed)
    if (charactersOf(next).map(canonical).includes(char) || refused.includes(char)) continue
    if (NOTHING_TO_DRAW.test(char)) {
      refused.push(char)
      continue
    }
    if (char === CREEPER) next = { ...next, creeper: true }
    else if (!isOptional(char)) next = { ...next, omitted: (next.omitted ?? []).filter(item => item !== char) }
    else if (char === SPACE_CHAR) next = { ...next, defineSpace: true }
    else if (char.trim()) next = { ...next, extras: next.extras.concat(char) }
    else continue
    added.push(...withCases(next, [char]))
  }
  return { font: next, added, refused }
}

export function removeCharacter(font, char) {
  const base = canonical(char)
  const forms = hasCase(base) ? [base, base.toUpperCase()] : [base]
  const kept = map => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => !Array.from(key).some(item => forms.includes(item))))
  const next = { ...font, glyphs: kept(font.glyphs), kerning: kept(font.kerning), extras: font.extras.filter(item => item !== base) }
  if (font.hidden) next.hidden = { ...font.hidden, glyphs: kept(font.hidden.glyphs), kerning: kept(font.hidden.kerning) }
  if (char === CREEPER) next.creeper = false
  if (char === SPACE_CHAR) next.defineSpace = false
  if (!isOptional(base)) next.omitted = (font.omitted ?? []).concat(base)
  return next
}

export function chooseCharacters(font, typed) {
  const text = (typed.includes("'") ? typed + OPENING_QUOTE : typed) + ALWAYS_REQUIRED.join("")
  const chosen = new Set(Array.from(text.normalize("NFC")).map(canonical))
  const omitted = REQUIRED_CHARACTERS.filter(char => !chosen.has(char))
  const trimmed = omitted.reduce((result, char) => removeCharacter(result, char), { ...font, requireCharacters: false })
  const { font: next, added } = addCharacters(trimmed, text.replace(/\s/g, ""))
  return { font: { ...next, requireCharacters: !omitted.length }, added }
}

function trueKey(char, letterCase) {
  return letterCase === "upper" && hasCase(char) ? char.toUpperCase() : char
}

function storedKey(char, letterCase) {
  if (letterCase === "both" || !hasCase(char)) return char
  if (letterCase === "upper") return isUpper(char) ? char.toLowerCase() : null
  return isUpper(char) ? null : char
}

function keyed(key, change) {
  const chars = Array.from(key).map(change)
  return chars.includes(null) ? null : chars.join("")
}

export function setLetterCase(font, letterCase) {
  if (letterCase === font.letterCase) return font
  const next = { ...font, letterCase, hidden: {} }
  for (const key of ["glyphs", "imported", "kerning"]) {
    const all = Object.entries(font.hidden?.[key] ?? {}).concat(Object.entries(font[key] ?? {}).map(([stored, value]) => [keyed(stored, char => trueKey(char, font.letterCase)), value]))
    const shown = {}
    next.hidden[key] = {}
    for (const [real, value] of all) {
      const stored = keyed(real, char => storedKey(char, letterCase))
      if (stored === null) next.hidden[key][real] = value
      else shown[stored] = value
    }
    next[key] = font[key] || Object.keys(shown).length ? shown : font[key]
  }
  return next
}

export function sameCharacter(char, from, to) {
  const real = trueKey(char, from)
  const other = isUpper(real) ? real.toLowerCase() : real.toUpperCase()
  return storedKey(real, to) ?? storedKey(other, to)
}
