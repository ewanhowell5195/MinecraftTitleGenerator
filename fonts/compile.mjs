import fs from "node:fs"

const font = "minecraft-five-bold"

const charMap = {
  asterisk: "*",
  backwardslash: "\\",
  colon: ":",
  creeper: "😳",
  forwardslash: "/",
  greaterthan: ">",
  lessthan: "<",
  openquote: "😩",
  questionmark: "?"
}

const characters = {}

for (const file of fs.readdirSync(`${font}/characters`)) {
  console.log(file)
  const char = charMap[file.slice(0, -5)] ?? file.slice(0, -5)
  characters[char] = JSON.parse(fs.readFileSync(`${font}/characters/${file}`, "utf8")).elements
  for (const element of characters[char]) {
    for (const [direction, face] of Object.entries(element.faces)) {
      element.faces[direction] = face.uv
    }
  }
}

fs.writeFileSync(`${font}/characters.json`, JSON.stringify(characters))