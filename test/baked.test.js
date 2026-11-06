import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"

const typing = JSON.parse(fs.readFileSync("public/home/typing.json", "utf8"))
const MODELS = [{ name: "logo", ...JSON.parse(fs.readFileSync("public/home/logo.json", "utf8")) }].concat(typing.phrases.map(phrase => ({ ...phrase, name: `typing/${phrase.name}` })))

function verticesOf(name) {
  const file = fs.readFileSync(`public/home/${name}.bin`)
  return new Int16Array(file.buffer, file.byteOffset, file.length / 2)
}

function lettersOnPlane(vertices, items, axis, plane) {
  const letters = new Set()
  for (const shell of items.filter(item => item.shell)) {
    for (let vertex = shell.start; vertex < shell.start + shell.count; vertex++) {
      if (vertices[vertex * 6 + axis] === plane) letters.add(vertices[vertex * 6 + 3])
    }
  }
  return letters
}

describe("baked holes", () => {
  for (const { name, items, glyphs } of MODELS) {
    test(`every hole in ${name} stays on its own letter's side of the gaps`, () => {
      const vertices = verticesOf(name)
      for (const clip of items.filter(item => item.clip)) {
        const start = clip.start * 6
        const axis = [1, 2].find(candidate => Array.from({ length: clip.count }, (_, vertex) => vertices[start + vertex * 6 + candidate]).every(value => value === vertices[start + candidate]))
        const line = Array.from(lettersOnPlane(vertices, items, axis, vertices[start + axis])).sort((a, b) => glyphs[a].min + glyphs[a].max - glyphs[b].min - glyphs[b].max)
        for (let quad = 0; quad < clip.count; quad += 6) {
          const corners = Array.from({ length: 6 }, (_, corner) => (clip.start + quad + corner) * 6)
          const letter = vertices[corners[0] + 3]
          assert.ok(corners.every(at => vertices[at + 3] === letter))
          const place = line.indexOf(letter)
          assert.ok(place >= 0, `hole uses letter ${letter}, which is not on its line`)
          const before = place ? (glyphs[line[place - 1]].max + glyphs[letter].min) / 2 : -Infinity
          const after = place < line.length - 1 ? (glyphs[letter].max + glyphs[line[place + 1]].min) / 2 : Infinity
          const xs = corners.map(at => vertices[at] / 64)
          assert.ok(Math.min(...xs) >= before - 0.05 && Math.max(...xs) <= after + 0.05, `hole from ${Math.min(...xs)} to ${Math.max(...xs)} crosses the gaps of letter ${letter} at ${before} and ${after}`)
        }
      }
    })
  }
})
