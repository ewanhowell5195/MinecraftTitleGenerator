import { reactive } from "vue"
import { fontTextures, stripTextures } from "./assets.js"
import { fullName, sheetFolder, stripsOf } from "./font.js"
import { titleCase } from "./names.js"

const STRIPS = "strips."
const lists = reactive({})

function fontNamed(id, fonts) {
  const entry = fonts.find(font => font.id === id)
  if (!entry) throw new Error(`a credit is based on ${id}, which is not in the font list`)
  return entry
}

function request(owner, fonts) {
  if (owner.startsWith(STRIPS)) return stripTextures(owner.slice(STRIPS.length))
  const entry = fontNamed(owner, fonts)
  return fontTextures(sheetFolder(entry, fonts), stripsOf(entry, fonts))
}

function listOf(owner, fonts) {
  if (!(owner in lists)) {
    const pending = request(owner, fonts)
    lists[owner] = null
    pending.then(list => lists[owner] = list)
  }
  return lists[owner]
}

export function basedOnParts(basedOn, owner) {
  const pieces = basedOn.split(".")
  if (pieces.length === 3 && pieces[0] === "strips") return { owner: `${STRIPS}${pieces[1]}`, id: pieces[2] }
  return pieces.length > 1 ? { owner: pieces[0], id: pieces[1] } : { owner, id: pieces[0] }
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

function basedOnName(target, viewed, fonts) {
  if (target.owner === viewed) return titleCase(target.id)
  if (target.owner.startsWith(STRIPS)) return `${titleCase(target.owner.slice(STRIPS.length))} Strips: ${titleCase(target.id)}`
  return `${fullName(fontNamed(target.owner, fonts), fonts)}: ${titleCase(target.id)}`
}

function ownerOf(data, fallback) {
  return data.stripSet ? `${STRIPS}${data.stripSet}` : fallback
}

function follow(data, owner, viewed, fonts) {
  if (!data.basedOn) return data.author ?? null
  const target = basedOnParts(data.basedOn, ownerOf(data, owner))
  if (data.author) return `${data.author}, based on ${basedOnName(target, viewed, fonts)}`
  const list = listOf(target.owner, fonts)
  if (!list) return null
  const entry = findEntry(list, target.id)
  if (!entry) throw new Error(`a credit is based on ${data.basedOn}, which does not exist`)
  return follow(entry, target.owner, viewed, fonts)
}

export function fontCredit(data, fonts) {
  if (!data.basedOn) return data.author ?? null
  const target = fonts.find(font => font.id === data.basedOn)
  if (!target) throw new Error(`${data.id} is based on ${data.basedOn}, which is not in the font list`)
  return data.author ? `${data.author}, based on ${fullName(target, fonts)}` : fontCredit(target, fonts)
}

export function credit(data, fontId, fonts, parent = null) {
  const own = data.author || data.basedOn || !parent ? data : parent
  const owner = ownerOf(own, fontId)
  return follow(own, owner, owner, fonts)
}
