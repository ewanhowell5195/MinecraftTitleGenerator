import { pixelsOf } from "../lib/canvas.js"
import { fontFromFiles, fontFromPublished, parseFontJson } from "../lib/fontEditor.js"
import { fullName, loadImage, parseMask, sheetFolder, splitCells, fullOrder } from "../lib/font.js"

function sheetFromImage(image) {
  return { data: pixelsOf(image), width: image.width, height: image.height }
}

export async function imageOf(file) {
  const url = URL.createObjectURL(file)
  try {
    return sheetFromImage(await loadImage(url))
  } catch {
    throw new Error(`${file.name} isn't an image this browser can read`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function fontFromUploads(files) {
  const list = Array.from(files)
  const png = list.find(file => /\.png$/i.test(file.name))
  const jsonFile = list.find(file => /\.json$/i.test(file.name))
  if (!png && !jsonFile) throw new Error("choose a .png sheet, a .json font file, or both")
  const json = jsonFile ? parseFontJson(await jsonFile.text()) : null
  let sheet = null
  if (png) sheet = await imageOf(png)
  else if (json.editor?.texture) {
    try {
      sheet = sheetFromImage(await loadImage(json.editor.texture))
    } catch {
      throw new Error(`the texture saved inside ${jsonFile.name} can't be read`)
    }
  }
  return fontFromFiles({ sheet, json })
}

export async function fontFromList(entry, fonts) {
  const image = await loadImage(`${sheetFolder(entry, fonts)}/font.png`)
  const { list, capHeight } = parseMask(pixelsOf(image), image.width, image.height, fullOrder(entry, fonts), 0)
  const { glyphs } = splitCells(entry, fonts, list)
  return fontFromPublished({ ...entry, name: fullName(entry, fonts) }, Object.values(glyphs), capHeight)
}
