export function splitWord({ text, spaceBefore }, start, end) {
  const parts = [[0, start], [start, end], [end, text.length]].filter(([from, to]) => text.slice(from, to).trim())
  if (parts.length < 2 || !parts.some(([from, to]) => from === start && to === end)) return null
  return parts.map(([from, to], index) => ({ text: text.slice(from, to).trim(), spaceBefore: index ? /\s/.test(text[from - 1] + text[from]) : spaceBefore, picked: from === start }))
}
