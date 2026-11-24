import { usePlatform } from "../../src/lib/core/platform.js"

const SITE = "https://mctitlegenerator.com/"
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i

const timers = new Set()

export function useBlockbench() {
  usePlatform({
    asset: path => ABSOLUTE.test(path) ? path : SITE + path.replace(/^\//, ""),
    frame(callback) {
      if (!document.hidden) return requestAnimationFrame(callback)
      const timer = setTimeout(callback, 16)
      timers.add(timer)
      return timer
    },
    cancelFrame(id) {
      if (timers.delete(id)) clearTimeout(id)
      else cancelAnimationFrame(id)
    }
  })
}
