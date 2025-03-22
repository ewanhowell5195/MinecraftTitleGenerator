import readline from "node:readline"
import path from "node:path"
import fs from "node:fs"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer))
  })
}

async function askInt(question) {
  while (true) {
    const answer = await ask(question)
    if (/^-?\d+$/.test(answer)) return parseInt(answer)
    console.log("Please enter a valid integer.")
  }
}

async function askShape() {
  while (true) {
    const input = await ask("Enter shape id: ")
    const filePath = path.resolve(`../shapes/${input}/model.json`)
    if (fs.existsSync(filePath)) return filePath
    else console.log(`The shape "shapes/${input}/model.json" was not found`)
  }
}

const shapePath = await askShape()
const newWidth = await askInt("Enter new UV width: ")
const newHeight = await askInt("Enter new UV height: ")

rl.close()

const shape = JSON.parse(fs.readFileSync(shapePath))

const oldWidth = shape.texture_size[0]
const oldHeight = shape.texture_size[1]

for (let el of shape.elements) {
  for (let dir in el.faces) {
    let uv = el.faces[dir].uv
    if (!uv) continue
    el.faces[dir].uv = [
      uv[0] / newWidth * oldWidth,
      uv[1] / newHeight * oldHeight,
      uv[2] / newWidth * oldWidth,
      uv[3] / newHeight * oldHeight
    ]
  }
}

shape.texture_size = [newWidth, newHeight]

fs.writeFileSync(path.join(path.dirname(shapePath), "model_fixed.json"), JSON.stringify(shape, null, 2))
console.log("UVs updated and saved to model_fixed.json.")