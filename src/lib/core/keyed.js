import { markRaw, shallowRef } from "vue"

export function keyed() {
  const refs = new Map()

  function at(key) {
    if (!refs.has(key)) refs.set(key, shallowRef())
    return refs.get(key)
  }

  return markRaw(new Proxy({}, {
    get: (target, key) => typeof key === "symbol" || key.startsWith("__v_") ? target[key] : at(key).value,
    set(target, key, value) {
      target[key] = value
      at(key).value = value
      return true
    },
    deleteProperty(target, key) {
      delete target[key]
      at(key).value = undefined
      return true
    }
  }))
}
