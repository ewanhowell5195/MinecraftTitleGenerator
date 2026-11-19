const STILL = { mode: "stretch", top: 0, bottom: 0, move: 0, marked: true }

function strengths(placed, centre = 0.5) {
  const minX = Math.min(...placed.map(item => item.x))
  const maxX = Math.max(...placed.map(item => item.x + item.glyph.width))
  const pivot = minX * (1 - centre) + maxX * centre
  const centres = placed.map(item => item.x + item.glyph.width / 2 - pivot)
  const reach = Math.max(...centres.map(Math.abs))
  return centres.map(centre => reach ? (centre / reach) ** 2 : 0)
}

function bend(amount, strength, capHeight) {
  return Math.round(Math.abs(amount) * (amount < 0 ? 1 - strength : strength) * capHeight)
}

function curve(mode, top, bottom, marked, strength, capHeight) {
  return mode === "move" ? { raise: 0, drop: 0, marked } : { raise: bend(top, strength, capHeight), drop: bend(bottom, strength, capHeight), marked }
}

function wordArc(words, item) {
  return words[item.word]?.arc ?? STILL
}

export function glyphArcs(placed, words, options, capHeight) {
  const amounts = strengths(placed, options.arcCentre)
  const wordAmounts = new Array(placed.length).fill(0)
  for (const index of words.keys()) {
    const members = placed.flatMap((item, at) => item.word === index ? [at] : [])
    if (members.length) strengths(members.map(at => placed[at]), words[index].arc?.centre).forEach((amount, at) => (wordAmounts[members[at]] = amount))
  }
  return placed.map((item, index) => {
    const arc = wordArc(words, item)
    const arcs = [curve(options.arcMode, options.arcTop, options.arcBottom, options.arcMarked !== false, amounts[index], capHeight), curve(arc.mode, arc.top, arc.bottom, arc.marked !== false, wordAmounts[index], capHeight)]
    const lineLift = options.arcMode === "move" ? Math.round(options.arcMove * amounts[index] * capHeight) : 0
    const lift = lineLift + (arc.mode === "move" ? Math.round(arc.move * wordAmounts[index] * capHeight) : 0)
    return { arcs, lift, lineLift }
  })
}
