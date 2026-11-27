import { plainCopy } from "../core/values.js"
import { LINE } from "../settings/settings.js"

const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse"])

function mirrored(object, targets, { inner, changed, removed, mutated }) {
  const wrappers = new WeakMap()
  function wrap(value, path) {
    if (value === null || typeof value !== "object") return value
    if (!wrappers.has(value)) {
      wrappers.set(value, new Proxy(value, {
        get(target, prop) {
          if (typeof prop === "symbol" || prop === "__ob__") return Reflect.get(target, prop)
          if (prop.startsWith("__v_")) return undefined
          if (Array.isArray(target) && MUTATORS.has(prop)) {
            return (...args) => {
              const result = target[prop](...args.map(plainCopy))
              mutated(path, target)
              return result
            }
          }
          if (Array.isArray(target) && typeof Array.prototype[prop] === "function") return Array.prototype[prop]
          return wrap(Reflect.get(target, prop), inner(path, prop))
        },
        set(target, prop, next) {
          Reflect.set(target, prop, plainCopy(next))
          changed(path, prop, next)
          return true
        },
        deleteProperty(target, prop) {
          Reflect.deleteProperty(target, prop)
          removed(path, prop)
          return true
        }
      }))
    }
    return wrappers.get(value)
  }
  return new Proxy(object, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop === "__ob__") return Reflect.get(target, prop)
      if (prop.startsWith("__v_")) return undefined
      return wrap(Reflect.get(target, prop), [prop])
    },
    set(target, prop, next) {
      const value = plainCopy(next)
      for (const other of targets(prop)) other[prop] = other === object ? value : plainCopy(value)
      return true
    }
  })
}

function broadcast(object, targets) {
  function within(path, prop) {
    return path[0] === "layerSettings" && path.length < 3 ? path.concat(prop) : path
  }
  function sync([key, layer, name]) {
    for (const other of targets(key)) {
      if (other === object) continue
      if (name === undefined) other[key] = plainCopy(object[key])
      else if (other[key][layer]) other[key][layer][name] = plainCopy(object[key][layer][name])
    }
  }
  const synced = (path, prop) => sync(within(path, prop))
  return mirrored(object, targets, { inner: within, changed: synced, removed: synced, mutated: sync })
}

function at(root, path) {
  let value = root
  for (const step of path) {
    if (value === null || typeof value !== "object") return undefined
    value = value[step]
  }
  return value
}

export function alongside(object, targets) {
  function parents(path) {
    return targets(path[0]).filter(other => other !== object).map(other => at(other, path)).filter(parent => parent !== null && typeof parent === "object")
  }
  function setAt(path, prop, value) {
    for (const parent of parents(path)) parent[prop] = plainCopy(value)
  }
  return mirrored(object, targets, {
    inner: (path, prop) => path.concat(prop),
    changed: setAt,
    removed: (path, prop) => parents(path).forEach(parent => delete parent[prop]),
    mutated: (path, target) => setAt(path.slice(0, -1), path.at(-1), target)
  })
}

export function wholeLine(object, words) {
  return broadcast(object, key => key === "text" ? [object] : words())
}

export function oneWord(object, words) {
  return broadcast(object, key => LINE.has(key) ? words() : [object])
}
