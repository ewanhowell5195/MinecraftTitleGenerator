import { nextTick } from "vue"
import { START_LOCATION, createMemoryHistory, createRouter, createWebHistory } from "vue-router"
import { isPlainClick } from "./components/composables/events.js"
import { navigated, setNavigator } from "./lib/state/navigation.js"
import { SITE } from "./site/pages.js"
import { pageKey, pageRoutes, routed } from "./site/routes.js"
import { PAGE_COMPONENTS } from "./site/pageComponents.js"

const CAPTURE_WAIT = 200
const RELOADED = "stale-chunk-reload"
const RELOAD_GAP = 10000
const STALE_CHUNK = /dynamically imported module|module script failed|unable to preload css/i
const SERVER = import.meta.env.SSR

export const router = createRouter({
  history: SERVER ? createMemoryHistory() : createWebHistory(),
  routes: pageRoutes(PAGE_COMPONENTS),
  scrollBehavior(to, from, saved) {
    if (saved) return { ...saved, behavior: "instant" }
    if (to.hash) return { el: to.hash }
    if (to.path === from.path) return false
    return { top: 0, behavior: "instant" }
  }
})

const fades = new WeakMap()

function crossfade(to, from) {
  if (from === START_LOCATION || pageKey(to) === pageKey(from)) return
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return
  return new Promise(resolve => {
    const shown = new Promise(done => fades.set(to, done))
    const transition = document.startViewTransition(() => {
      clearTimeout(waiting)
      resolve()
      return shown
    })
    // the old page is only captured on the next frame, which never comes while the window isn't being drawn
    const waiting = setTimeout(() => transition.skipTransition(), CAPTURE_WAIT)
    // ready rejects whenever a transition is skipped, eg by the next navigation starting
    transition.ready.catch(() => {})
  })
}

function crossfaded(to, from, failure) {
  const done = fades.get(to)
  if (!done) return
  fades.delete(to)
  // Chrome abandons a transition when the page gets too short for its scroll position, which it can once the next page's styles are set in the hook below
  if (!failure && to.path !== from.path) scrollTo({ top: 0, behavior: "instant" })
  nextTick().then(() => setTimeout(done))
}

function reloadFresh(url) {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOADED)) || 0
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch {}
  if (Date.now() - last < RELOAD_GAP) return false
  location.assign(url)
  return true
}

let navigating = false
router.beforeEach(() => {
  navigating = true
})
router.afterEach(() => {
  navigating = false
})
router.onError((error, to) => {
  navigating = false
  if (STALE_CHUNK.test(error?.message ?? "") && to) reloadFresh(router.resolve(to).href)
})
setNavigator(router)
router.afterEach((to, from, failure) => {
  if (!failure) navigated(to, from)
})

if (!SERVER) {
  addEventListener("vite:preloadError", () => {
    if (!navigating) reloadFresh(location.href)
  })
  router.beforeResolve(crossfade)
  router.afterEach(crossfaded)
  router.afterEach(showPage)
}

function setHead(selector, attribute, value) {
  const element = document.head.querySelector(selector)
  if (element) element.setAttribute(attribute, value)
}

function showPage(to, from, failure) {
  const page = to.meta
  if (failure || from === START_LOCATION || page.stays && page.name === from.meta.name) return
  document.documentElement.dataset.styles = page.styles
  document.title = page.title
  setHead("meta[name=description]", "content", page.description)
  setHead("link[rel=canonical]", "href", `${SITE}${to.path}`)
  const robots = document.head.querySelector("meta[name=robots]")
  if (page.hidden && !robots) document.head.insertAdjacentHTML("beforeend", "<meta name=\"robots\" content=\"noindex\">")
  else if (!page.hidden) robots?.remove()
}

export function followLinks(root) {
  root.addEventListener("click", event => {
    if (event.defaultPrevented || !isPlainClick(event)) return
    const anchor = event.target.closest("a[href]")
    const target = anchor && routed(anchor, location, path => router.resolve(path))
    if (!target) return
    event.preventDefault()
    router.push(target)
  })
}
