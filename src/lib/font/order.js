export const CREEPER = "\u{1F633}"
export const OPENING_QUOTE = "\u{1F629}"
export const TERMINATOR_OPEN = "┫"
export const TERMINATOR_CLOSE = "┣"

const KEY_BREAK = "\u0000"

export const DEFAULT_ORDER = `${CREEPER}abcdefghijklmnopqrstuvwxyz0123456789&#()[]{}/\\?!.:-${OPENING_QUOTE}'+=<>%^*~,;_$£€@${TERMINATOR_OPEN}${TERMINATOR_CLOSE}`

export function glyphKey(char, index) {
  return `${char}${KEY_BREAK}${index}`
}

export function baseChar(key) {
  return key.split(KEY_BREAK)[0]
}
