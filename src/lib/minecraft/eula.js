import { reactive } from "vue"

const STORAGE = "minecraft-title-eula"

export const EULA_URL = "https://www.minecraft.net/en-us/eula"

export const eula = reactive({ asking: false, reason: null })

export class EulaDeclined extends Error {
  constructor() {
    super("The Minecraft EULA wasn't agreed to")
    this.name = "EulaDeclined"
  }
}

let waiting = null

function accepted() {
  return localStorage.getItem(STORAGE) === "accepted"
}

export function eulaDeclined() {
  return localStorage.getItem(STORAGE) === "declined"
}

export function agreeToEula(reason = "tileables") {
  if (accepted()) return Promise.resolve()
  if (!waiting) {
    let settle
    const promise = new Promise((resolve, reject) => settle = { resolve, reject })
    waiting = { promise, ...settle }
    Object.assign(eula, { asking: true, reason })
  }
  return waiting.promise
}

export function answerEula(agreed) {
  const answered = waiting
  waiting = null
  eula.asking = false
  localStorage.setItem(STORAGE, agreed ? "accepted" : "declined")
  if (!answered) return
  if (agreed) answered.resolve()
  else answered.reject(new EulaDeclined())
}
