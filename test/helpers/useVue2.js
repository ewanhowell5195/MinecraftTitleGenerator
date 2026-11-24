import { registerHooks } from "node:module"

const VUE_2 = new URL("./vue2.js", import.meta.url).href

registerHooks({
  resolve(specifier, context, next) {
    return specifier === "vue" ? { url: VUE_2, shortCircuit: true } : next(specifier, context)
  }
})
