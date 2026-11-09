const ITEM_FILE = /^assets\/minecraft\/items\/[^/]+\.json$/
const COLORMAP_SIZE = 256

function located(ref) {
  const [space, name] = ref.includes(":") ? ref.split(":") : ["minecraft", ref]
  return { space, name }
}

function typeOf(node) {
  return located(node.type ?? "").name
}

function modelNodes(node, found = []) {
  if (!node || typeof node !== "object") return found
  if (Array.isArray(node)) {
    for (const item of node) modelNodes(item, found)
    return found
  }
  if (typeOf(node) === "model" && node.model) found.push(node)
  for (const value of Object.values(node)) modelNodes(value, found)
  return found
}

function resolved(textures, ref, seen = new Set()) {
  if (!ref?.startsWith("#")) return ref ?? null
  const key = ref.slice(1)
  if (seen.has(key)) return null
  seen.add(key)
  return resolved(textures, textures[key], seen)
}

export function grassColormapPixel(temperature, downfall) {
  const heat = Math.min(1, Math.max(0, temperature))
  const rain = Math.min(1, Math.max(0, downfall)) * heat
  return { x: Math.floor((1 - heat) * (COLORMAP_SIZE - 1)), y: Math.floor((1 - rain) * (COLORMAP_SIZE - 1)) }
}

function hex(rgb) {
  return `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`
}

export async function blockTints(paths, readJson, grassColour) {
  const models = new Map()

  async function model(ref) {
    if (!models.has(ref)) {
      models.set(ref, (async () => {
        const { space, name } = located(ref)
        const file = `assets/${space}/models/${name}.json`
        const data = paths.has(file) ? await readJson(file) : null
        if (!data) return { textures: {}, elements: null }
        const parent = data.parent ? await model(data.parent) : { textures: {}, elements: null }
        return { textures: { ...parent.textures, ...data.textures }, elements: data.elements ?? parent.elements }
      })())
    }
    return models.get(ref)
  }

  async function colour(tint) {
    const type = typeOf(tint)
    if (type === "constant") return hex([tint.value >> 16 & 255, tint.value >> 8 & 255, tint.value & 255])
    if (type === "grass") return hex(await grassColour(tint.temperature, tint.downfall))
    return null
  }

  const tints = new Map()
  async function tint(texture, value) {
    const name = texture && located(texture).name
    if (!name?.startsWith("block/") || tints.has(name.slice(6))) return
    const found = value && await colour(value)
    if (found) tints.set(name.slice(6), found)
  }

  for (const file of Array.from(paths).filter(path => ITEM_FILE.test(path)).sort()) {
    for (const node of modelNodes((await readJson(file))?.model)) {
      if (!node.tints?.length) continue
      const { textures, elements } = await model(node.model)
      if (!elements) {
        for (const [index, value] of node.tints.entries()) await tint(resolved(textures, textures[`layer${index}`]), value)
        continue
      }
      for (const element of elements) {
        for (const face of Object.values(element.faces ?? {})) {
          if (face.tintindex !== undefined) await tint(resolved(textures, face.texture), node.tints[face.tintindex])
        }
      }
    }
  }
  return tints
}
