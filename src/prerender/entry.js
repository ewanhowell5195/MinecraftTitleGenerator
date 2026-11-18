import { createSSRApp } from "vue"
import { renderToString } from "vue/server-renderer"
import Root from "../Root.vue"
import { router } from "../router.js"
import { seedCommunity } from "../lib/state/community.js"

export async function renderPage(path, seed = null) {
  if (seed) seedCommunity(seed)
  const app = createSSRApp(Root).use(router).directive("tooltip", {})
  await router.push(path)
  await router.isReady()
  const context = {}
  const html = await renderToString(app, context)
  return { html, modules: Array.from(context.modules ?? []) }
}
