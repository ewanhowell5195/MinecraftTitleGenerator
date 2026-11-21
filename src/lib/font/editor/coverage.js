import { hasCase } from "./characters.js"

const DRAWABLE = /^[\p{L}\p{N}\p{P}\p{S}]$/u
const EMOJI = /\p{Emoji_Presentation}/u
const UNUSED = new Set(["\"", "‘", "’", "“", "”"])
const CLOSING_QUOTE = "’"
const CODE = /^(?:u\+)?([0-9a-f]{2,6})$/i
const GROUPS = [
  { id: "latin", label: "Latin", test: /\p{Script=Latin}/u },
  { id: "numbers", label: "Numbers", test: /\p{N}/u },
  { id: "punctuation", label: "Punctuation", test: /\p{P}/u },
  { id: "symbols", label: "Symbols", test: /\p{S}/u },
  { id: "greek", label: "Greek", test: /\p{Script=Greek}/u },
  { id: "cyrillic", label: "Cyrillic", test: /\p{Script=Cyrillic}/u },
  { id: "armenian", label: "Armenian", test: /\p{Script=Armenian}/u },
  { id: "georgian", label: "Georgian", test: /\p{Script=Georgian}/u },
  { id: "hebrew", label: "Hebrew", test: /\p{Script=Hebrew}/u },
  { id: "arabic", label: "Arabic", test: /\p{Script=Arabic}/u },
  { id: "devanagari", label: "Devanagari", test: /\p{Script=Devanagari}/u },
  { id: "thai", label: "Thai", test: /\p{Script=Thai}/u },
  { id: "hangul", label: "Hangul", test: /\p{Script=Hangul}/u },
  { id: "hiragana", label: "Hiragana", test: /\p{Script=Hiragana}/u },
  { id: "katakana", label: "Katakana", test: /\p{Script=Katakana}/u },
  { id: "han", label: "Han", test: /\p{Script=Han}/u },
  { id: "other", label: "Other letters", test: /./u }
]

const SLICE_MS = 12

const drawn = new WeakMap()

function pause() {
  return new Promise(resolve => setTimeout(resolve))
}

async function listDrawn(source) {
  const chars = source.minecraft ? source.characters.filter(char => DRAWABLE.test(char) && !EMOJI.test(char)) : await listOutlined(source)
  if (!chars.includes("'") && chars.includes(CLOSING_QUOTE)) chars.push("'")
  return chars.filter(char => !UNUSED.has(char)).sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
}

async function listOutlined(source) {
  const chars = []
  let until = performance.now() + SLICE_MS
  for (const [code, index] of Object.entries(source.tables.cmap.glyphIndexMap)) {
    if (performance.now() > until) {
      await pause()
      until = performance.now() + SLICE_MS
    }
    const char = String.fromCodePoint(Number(code))
    if (index && DRAWABLE.test(char) && !EMOJI.test(char) && source.glyphs.get(index).path.commands.length) chars.push(char)
  }
  return chars
}

export function drawnCharacters(source) {
  if (!drawn.has(source)) drawn.set(source, listDrawn(source))
  return drawn.get(source)
}

export function casedCharacters(chars, letterCase) {
  if (letterCase === "both") return chars
  return chars.filter(char => !hasCase(char) || char === (letterCase === "upper" ? char.toUpperCase() : char.toLowerCase()))
}

export function matchesSearch(char, search) {
  const term = search.trim()
  if (!term) return true
  if (Array.from(term).includes(char)) return true
  const code = term.match(CODE)
  return !!code && parseInt(code[1], 16) === char.codePointAt(0)
}

export function characterGroups(chars) {
  const groups = GROUPS.map(group => ({ id: group.id, label: group.label, chars: [] }))
  for (const char of chars) groups[GROUPS.findIndex(group => group.test.test(char))].chars.push(char)
  return groups.filter(group => group.chars.length)
}

export function codeOf(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
}
