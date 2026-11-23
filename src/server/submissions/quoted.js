// what GitHub acts on anywhere outside code: mentions, issues, maths, urls and commits
const LIVE = /[@#$]|:\/\/|www\.|\bgh-\d|\b(?=[a-f]*\d)[\da-f]{7,}\b/i
const MARKDOWN = /[\\`*_[\]<>|~&]/g
const LIST = /^(?:([-+=])|(\d+)([.)])$)/
const PIECES = /\\([!-/:-@[-`{-~])|&#(\d+);|(`+)([\s\S]*?[^`])\3(?!`)/g

function longestRun(text) {
  return Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
}

export function inline(text) {
  const fence = "`".repeat(longestRun(text) + 1)
  return `${fence} ${text} ${fence}`
}

function quotedWord(word, first) {
  if (LIVE.test(word)) return word.includes("`") ? inline(word) : `\`${word}\``
  const escaped = word.replace(MARKDOWN, "\\$&")
  return first ? escaped.replace(LIST, (_, mark, number, after) => mark ? `\\${mark}` : `${number}\\${after}`) : escaped
}

function quotedLine(line) {
  const [indent] = /^\s*/.exec(line)
  const words = line.slice(indent.length).split(/(\s+)/)
  return Array.from(indent, space => `&#${space.codePointAt(0)};`).concat(words.map((word, index) => index % 2 ? word : quotedWord(word, !index))).join("")
}

export function quoted(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map(line => `> ${quotedLine(line)}`).join("\n")
}

export function unquoted(text) {
  return text.split("\n").map(line => line.replace(/^> ?/, "").replace(PIECES, (_, mark, code, fence, word) => mark ?? (code ? String.fromCodePoint(Number(code)) : word.replace(/^ ([\s\S]+) $/, "$1")))).join("\n")
}
