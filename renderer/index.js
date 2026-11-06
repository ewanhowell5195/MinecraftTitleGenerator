import module from "node:module"
import { fileURLToPath } from "node:url"

const SHARED = new URL("../src/", import.meta.url).href

module.registerHooks({
  resolve(specifier, context, next) {
    return next(specifier, specifier === "three" && context.parentURL?.startsWith(SHARED) ? { ...context, parentURL: import.meta.url } : context)
  }
})

export const { answerMinecraftAssets, renderTitle, serveRenders } = await import("./render.js")

if (process.argv[1] === fileURLToPath(import.meta.url)) serveRenders()
