import { reactive } from "vue"
import { textureList } from "./assets.js"
import { sheetFolder } from "./font.js"
import { titleCase } from "./names.js"

const lists = reactive({})

function listOf(fontId, fonts) {
  if (!(fontId in lists)) {
    const entry = fonts.find(font => font.id === fontId)
    if (!entry) throw new Error(`a credit is based on ${fontId}, which is not in the font list`)
    lists[fontId] = null
    textureList(sheetFolder(entry, fonts)).then(list => lists[fontId] = list)
  }
  return lists[fontId]
}

function parts(basedOn, fontId) {
  const [first, second] = basedOn.split(".")
  return second ? { fontId: first, id: second } : { fontId, id: first }
}

export function findEntry(list, id) {
  for (const group of [list.textures, list.overlays]) {
    if (group?.[id]) return group[id]
    for (const parent of Object.values(group ?? {})) {
      const variant = parent.variants?.[id]
      if (variant) return variant.author || variant.basedOn ? variant : parent
    }
  }
  return null
}

function basedOnName(target, viewedFont, fonts) {
  if (target.fontId === viewedFont) return titleCase(target.id)
  const entry = fonts.find(font => font.id === target.fontId)
  if (!entry) throw new Error(`a credit is based on ${target.fontId}, which is not in the font list`)
  return `${entry.name}: ${titleCase(target.id)}`
}

function follow(data, fontId, viewedFont, fonts) {
  if (!data.basedOn) return data.author ?? null
  const target = parts(data.basedOn, fontId)
  if (data.author) return `${data.author}, based on ${basedOnName(target, viewedFont, fonts)}`
  const list = listOf(target.fontId, fonts)
  if (!list) return null
  const entry = findEntry(list, target.id)
  if (!entry) throw new Error(`a credit is based on ${data.basedOn}, which does not exist`)
  return follow(entry, target.fontId, viewedFont, fonts)
}

export function fontCredit(data, fonts) {
  if (!data.basedOn) return data.author ?? null
  const target = fonts.find(font => font.id === data.basedOn)
  if (!target) throw new Error(`${data.id} is based on ${data.basedOn}, which is not in the font list`)
  return data.author ? `${data.author}, based on ${target.name}` : fontCredit(target, fonts)
}

export function credit(data, fontId, fonts, parent = null) {
  return follow(data.author || data.basedOn || !parent ? data : parent, fontId, fontId, fonts)
}
