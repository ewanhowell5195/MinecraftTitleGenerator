import { effect, stop, toRaw } from "vue"

export function touch(value) {
  if (value === null || typeof value !== "object") return
  for (const key in value) touch(value[key])
}

function rerunner(runner) {
  let queued = false
  return () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      runner()
    })
  }
}

export function trackEach(list, changed) {
  const followed = new Map()

  function follow(item) {
    const raw = toRaw(item)
    let again = null
    const runner = effect(() => touch(item), {
      scheduler: () => {
        changed(raw)
        again()
      }
    })
    again = rerunner(runner)
    followed.set(raw, runner)
  }

  function sync() {
    const present = new Set(list().map(toRaw))
    for (const [raw, runner] of followed) {
      if (present.has(raw)) continue
      stop(runner)
      followed.delete(raw)
    }
    for (const item of list()) if (!followed.has(toRaw(item))) follow(item)
  }

  let again = null
  const membership = effect(() => list().map(item => item), {
    scheduler: () => {
      changed(null)
      again()
    }
  })
  again = rerunner(() => {
    membership()
    sync()
  })
  sync()
}
