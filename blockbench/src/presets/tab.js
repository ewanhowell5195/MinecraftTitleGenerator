import { FORMAT } from "../format.js"

const dressed = new Map()
const views = new WeakMap()
const shown = new WeakSet()

function viewOf(format, icon) {
  if (!views.has(format)) {
    const view = Object.create(format, { icon: { value: icon } })
    shown.add(view)
    views.set(format, view)
  }
  return views.get(format)
}

function dress(project, shows, name, icon) {
  if (dressed.has(project) || project.format?.id !== FORMAT) return
  const own = Object.getOwnPropertyDescriptor(project, "format")
  dressed.set(project, own)
  Object.defineProperty(project, "format", {
    configurable: true,
    enumerable: true,
    get() {
      const format = own.get ? own.get.call(this) : own.value
      return shows(this) ? viewOf(format, icon) : format
    },
    set(value) {
      const format = shown.has(value) ? Object.getPrototypeOf(value) : value
      if (own.set) own.set.call(this, format)
      else own.value = format
    }
  })
  project.getDisplayName = function (...args) {
    return shows(this) ? name : ModelProject.prototype.getDisplayName.apply(this, args)
  }
}

export function dressTabs(shows, name, icon) {
  function listener({ project }) {
    for (const old of dressed.keys()) {
      if (!ModelProject.all.includes(old)) dressed.delete(old)
    }
    dress(project, shows, name, icon)
  }
  for (const project of ModelProject.all) dress(project, shows, name, icon)
  Blockbench.on("select_project", listener)
  return () => {
    Blockbench.removeListener("select_project", listener)
    for (const [project, own] of dressed) {
      Object.defineProperty(project, "format", own)
      delete project.getDisplayName
    }
    dressed.clear()
  }
}
