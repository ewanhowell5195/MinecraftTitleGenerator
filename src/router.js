import { nextTick } from "vue"
import { START_LOCATION, createRouter, createWebHistory } from "vue-router"
import { navigated, setNavigator } from "./lib/navigation.js"
import { SITE } from "./pages.js"
import { pageKey, pageRoutes, routed } from "./site/routes.js"

const CAPTURE_WAIT = 200
const COMPONENTS = {
  home: () => import("./pages/HomePage.vue"),
  app: () => import("./App.vue"),
  "font-editor": () => import("./fontEditor/FontEditor.vue"),
  credits: () => import("./pages/CreditsPage.vue"),
  submit: () => import("./submissions/SubmissionsApp.vue"),
  submissions: () => import("./submissions/SubmissionsApp.vue"),
  account: () => import("./submissions/SubmissionsApp.vue"),
  terms: () => import("./pages/TermsPage.vue"),
  privacy: () => import("./pages/PrivacyPage.vue"),
  "not-found": () => import("./pages/NotFound.vue")
}

export const router = createRouter({
  history: createWebHistory(),
  routes: pageRoutes(COMPONENTS),
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

setNavigator(router)
router.beforeResolve(crossfade)
router.afterEach(crossfaded)
router.afterEach((to, from, failure) => {
  if (!failure) navigated(to, from)
})

function setHead(selector, attribute, value) {
  const element = document.head.querySelector(selector)
  if (element) element.setAttribute(attribute, value)
}

router.afterEach((to, from, failure) => {
  const page = to.meta
  if (failure || page.stays && page.name === from.meta.name) return
  document.documentElement.dataset.styles = page.styles
  document.title = page.title
  setHead("meta[name=description]", "content", page.description)
  setHead("link[rel=canonical]", "href", `${SITE}${to.path}`)
  const robots = document.head.querySelector("meta[name=robots]")
  if (page.hidden && !robots) document.head.insertAdjacentHTML("beforeend", "<meta name=\"robots\" content=\"noindex\">")
  else if (!page.hidden) robots?.remove()
})

export function followLinks(root) {
  root.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target.closest("a[href]")
    const target = anchor && routed(anchor, location, path => router.resolve(path))
    if (!target) return
    event.preventDefault()
    router.push(target)
  })
}
