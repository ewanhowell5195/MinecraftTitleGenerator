import { titleCase } from "./names.js"

const NAMES = { using_item: "Using", broken: "Broken", "fishing_rod/cast": "Cast", "bundle/has_selected_item": "Item selected", lodestone_tracker: "Lodestone", dyed_color: "Dyed", trim_material: "Trim", charge_type: "Loaded", use_duration: "Pull", "crossbow/pull": "Pull", use_cycle: "Brushing", compass: "Angle", time: "Time", context_dimension: "Dimension", local_time: "Date" }
const NONE = new Set(["trim_material", "charge_type"])
const CHARGES = { arrow: [{ id: "arrow" }], rocket: [{ id: "firework_rocket" }] }
const LEATHER = "#a06540"

function bare(id) {
  return String(id ?? "").replace(/^minecraft:/, "")
}

function nameOf(name) {
  return NAMES[name] ?? titleCase(name.split("/").at(-1))
}

function valueLabel(value) {
  return /^[a-z_]+$/.test(value) ? titleCase(value) : value
}

function modelName(def) {
  return bare(def?.type) === "model" ? titleCase(bare(def.model).split("/").at(-1)) : null
}

function hexOf(colour) {
  return `#${((colour >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`
}

function getPath(components, path) {
  return path.reduce((value, key) => value?.[key], components)
}

function setPath(components, [key, ...rest], value) {
  const next = { ...components }
  const inner = rest.length ? setPath(next[key] ?? {}, rest, value) : value
  if (inner == null || rest.length && !Object.keys(inner).length) delete next[key]
  else next[key] = inner
  return next
}

function pathAccess(path) {
  return { keys: [path[0]], get: components => getPath(components, path) ?? null, set: (components, value) => setPath(components, path, value) }
}

function selectAccess(def, property) {
  if (property === "charge_type") {
    return {
      name: property,
      keys: ["charged_projectiles"],
      get: components => components.charged_projectiles?.length ? components.charged_projectiles.some(projectile => bare(projectile?.id ?? projectile) === "firework_rocket") ? "rocket" : "arrow" : null,
      set: (components, value) => setPath(components, ["charged_projectiles"], CHARGES[value] ?? null)
    }
  }
  if (property === "trim_material") return { name: property, ...pathAccess(["trim", "material"]) }
  if (property === "block_state") return { name: def.block_state_property, ...pathAccess(["block_state", def.block_state_property]) }
  if (property === "component") return { name: bare(def.component), ...pathAccess([bare(def.component)]) }
  return { name: property, ...pathAccess([property]) }
}

function conditionAccess(def, property) {
  if (property === "has_component") {
    const name = bare(def.component)
    return { name, keys: [name], get: components => components[name] != null, set: (components, on) => setPath(components, [name], on ? name === "dyed_color" ? LEATHER : {} : null) }
  }
  return { name: property, keys: [property], get: components => components[property] === true, set: (components, on) => setPath(components, [property], on || null) }
}

function rangeIndex(entries, scale, value) {
  let chosen = -1
  for (const [index, entry] of entries.entries()) {
    if (scale * value >= entry.threshold) chosen = index
  }
  return chosen
}

function rangeOptions(def, property) {
  const scale = def.scale ?? 1
  const entries = (def.entries ?? []).toSorted((a, b) => a.threshold - b.threshold)
  const values = [(entries[0]?.threshold ?? 0) - 1].concat(entries.map((entry, index) => (entry.threshold + (entries[index + 1]?.threshold ?? entry.threshold + 1)) / 2)).map(value => Number((value / scale).toFixed(6)))
  const fallback = property === "count" ? 1 : 0
  const reachable = values.map((value, index) => ({ value, index: index - 1, model: index ? entries[index - 1].model : def.fallback })).filter(option => option.model && rangeIndex(entries, scale, option.value) === option.index)
  const models = reachable.map(option => JSON.stringify(option.model))
  const options = reachable.filter((option, index) => models.indexOf(models[index]) === index)
  return { scale, entries, fallback, options, models: options.map(option => JSON.stringify(option.model)), modelOf: index => JSON.stringify(reachable.find(option => option.index === index)?.model) }
}

function walkDefinition(definition, components, potions, all) {
  const controls = []
  const seen = new Set()

  function add(control) {
    if (seen.has(control.key)) return
    seen.add(control.key)
    controls.push(control)
  }

  function tints(def) {
    for (const tint of def.tints ?? []) {
      const type = bare(tint.type)
      if (type === "dye") {
        const access = pathAccess(["dyed_color"])
        add({ key: "dye", type: "colour", label: "Dye colour", keys: access.keys, value: access.get(components) ?? hexOf(tint.default ?? 0), choose: value => access.set(components, value) })
      } else if (type === "potion" && potions.length) {
        const access = pathAccess(["potion_contents", "potion"])
        const options = [{ value: 0, label: "Water" }].concat(potions.map((id, index) => ({ value: index + 1, label: titleCase(id) })))
        add({ key: "potion", type: "select", label: "Potion", keys: access.keys, options, value: potions.indexOf(bare(access.get(components))) + 1, choose: index => access.set(components, potions[index - 1] ?? null) })
      }
    }
  }

  function walk(def) {
    if (!def || typeof def !== "object") return
    const type = bare(def.type)
    const property = bare(def.property)
    if (type === "model") tints(def)
    else if (type === "composite") def.models?.forEach(walk)
    else if (type === "select") {
      const cases = (def.cases ?? []).filter(entry => typeof entry.when !== "object" || Array.isArray(entry.when) && entry.when.every(when => typeof when === "string"))
      if (property === "display_context" || property === "custom_model_data" || cases.length < def.cases?.length) {
        const shown = property === "display_context" ? def.cases?.find(entry => [entry.when].flat().map(bare).includes("gui")) : null
        if (all) def.cases?.forEach(entry => walk(entry.model))
        return walk(shown?.model ?? def.fallback)
      }
      const access = selectAccess(def, property)
      const whens = cases.map(entry => bare([entry.when].flat()[0]))
      const options = [{ value: 0, label: NONE.has(property) ? "None" : "Default" }].concat(whens.map((when, index) => ({ value: index + 1, label: valueLabel(when) })))
      const value = whens.indexOf(bare(access.get(components))) + 1
      add({ key: `select:${access.name}`, type: "select", label: nameOf(access.name), keys: access.keys, options, value, choose: index => access.set(components, whens[index - 1] ?? null) })
      if (all) cases.forEach(entry => walk(entry.model))
      walk(all || !value ? def.fallback : cases[value - 1].model)
    } else if (type === "condition") {
      if (property === "custom_model_data" || property === "component") {
        if (all) walk(def.on_true)
        return walk(def.on_false)
      }
      const access = conditionAccess(def, property)
      const value = access.get(components)
      add({ key: `condition:${access.name}`, type: "toggle", label: nameOf(access.name), keys: access.keys, value, choose: on => access.set(components, on) })
      if (all) walk(def.on_true)
      walk(value && !all ? def.on_true : def.on_false)
    } else if (type === "range_dispatch") {
      const range = rangeOptions(def, property)
      if (property === "custom_model_data" || range.options.length < 2) {
        if (all) range.options.forEach(option => walk(option.model))
        return walk(range.options.find(option => option.index === rangeIndex(range.entries, range.scale, range.fallback))?.model ?? def.fallback)
      }
      const access = pathAccess([property])
      const current = rangeIndex(range.entries, range.scale, access.get(components) ?? range.fallback)
      const resting = range.modelOf(rangeIndex(range.entries, range.scale, range.fallback))
      const options = range.options.map((option, index) => ({ value: index, label: modelName(option.model) ?? `Stage ${index + 1}` }))
      const value = Math.max(0, range.models.indexOf(range.modelOf(current)))
      add({ key: `range:${property}`, type: "select", label: nameOf(property), keys: access.keys, options, value, choose: index => access.set(components, range.models[index] === resting ? null : range.options[index].value) })
      if (all) range.options.forEach(option => walk(option.model))
      walk(range.options[value]?.model)
    }
  }

  walk(definition?.model)
  return controls
}

export function itemControls(definition, components = {}, potions = []) {
  return walkDefinition(definition, components ?? {}, potions, false)
}

export function fitComponents(definition, previous, potions = []) {
  const controls = walkDefinition(definition, {}, potions, true)
  if (!controls.length) return null
  const keys = new Set(controls.flatMap(control => control.keys))
  return Object.fromEntries(Object.entries(previous ?? {}).filter(([key]) => keys.has(key)))
}
