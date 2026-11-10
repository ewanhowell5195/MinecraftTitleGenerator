import { createRouter, createWebHistory } from "vue-router"
import { navigated, setNavigator } from "./lib/navigation.js"
import { PAGES, SITE } from "./pages.js"

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

const routes = PAGES.flatMap(page => page.paths.map((path, index) => ({ path, name: index ? `${page.name}-${index}` : page.name, component: COMPONENTS[page.name], meta: page })))

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return { ...saved, behavior: "instant" }
    if (to.hash) return { el: to.hash }
    if (to.path === from.path) return false
    return { top: 0, behavior: "instant" }
  }
})

setNavigator(router)
router.afterEach(navigated)

function setHead(selector, attribute, value) {
  const element = document.head.querySelector(selector)
  if (element) element.setAttribute(attribute, value)
}

router.afterEach((to, from) => {
  const page = to.meta
  if (page.stays && page.name === from.meta.name) return
  document.documentElement.dataset.styles = page.styles
  document.title = page.title
  setHead("meta[name=description]", "content", page.description)
  setHead("link[rel=canonical]", "href", `${SITE}${to.path}`)
  const robots = document.head.querySelector("meta[name=robots]")
  if (page.hidden && !robots) document.head.insertAdjacentHTML("beforeend", "<meta name=\"robots\" content=\"noindex\">")
  else if (!page.hidden) robots?.remove()
})

function routed(anchor) {
  if (anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return null
  const url = new URL(anchor.href, location.href)
  if (url.origin !== location.origin) return null
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null
  const target = router.resolve(`${url.pathname}${url.search}${url.hash}`)
  return target.meta.name === "not-found" ? null : target
}

export function followLinks(root) {
  root.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target.closest("a[href]")
    const target = anchor && routed(anchor)
    if (!target) return
    event.preventDefault()
    router.push(target)
  })
}
