export const SITE = "https://mctitlegenerator.com"

const SUFFIX = " | Minecraft Title Generator"
const GENERATOR = "Make your own Minecraft style 3D titles in your browser, then render them as images."

export const PAGES = [
  { name: "home", file: "index.html", paths: ["/"], title: "Minecraft Title Generator", description: GENERATOR, styles: "site bar", header: "floating", footer: true, share: true, head: "<link rel=\"preload\" href=\"/home/logo.bin\" as=\"fetch\" crossorigin>" },
  { name: "app", file: "app/index.html", paths: ["/app/", "/app/presets/:id(\\d+)?"], title: "Minecraft Title Generator", description: GENERATOR, styles: "tool", stays: true },
  { name: "font-editor", file: "font-editor/index.html", paths: ["/font-editor/"], title: "Minecraft Title Generator Font Editor", description: "Draw your own Minecraft style font in your browser, then download it for the Minecraft Title Generator.", styles: "tool editor" },
  { name: "credits", file: "credits/index.html", paths: ["/credits/"], title: `Credits${SUFFIX}`, description: "Everyone who made the fonts and textures in the Minecraft Title Generator.", styles: "site bar", header: "fixed", footer: true, share: true },
  { name: "submit", file: "submit/index.html", paths: ["/submit/"], title: `Submit${SUFFIX}`, description: "Send your own fonts, textures, overlays, strips and tileables to the Minecraft Title Generator so everyone can use them.", styles: "tool bar submissions", header: "fixed" },
  { name: "submissions", file: "submissions/index.html", paths: ["/submissions/", "/submissions/:id(\\d+)/", "/submissions/:id(\\d+)/edit/"], title: `Submissions${SUFFIX}`, description: "Your submissions to the Minecraft Title Generator and their reviews.", styles: "tool bar submissions", header: "fixed", hidden: true },
  { name: "account", file: "account/index.html", paths: ["/account/"], title: `Manage account${SUFFIX}`, description: "Manage or delete your Minecraft Title Generator account.", styles: "tool bar submissions", header: "fixed", hidden: true },
  { name: "terms", file: "terms/index.html", paths: ["/terms/"], title: `Terms of Service${SUFFIX}`, description: "The terms for using the Minecraft Title Generator, sharing presets, and sending submissions.", styles: "site bar", header: "fixed", footer: true, share: true },
  { name: "privacy", file: "privacy/index.html", paths: ["/privacy/"], title: `Privacy Policy${SUFFIX}`, description: "What data the Minecraft Title Generator stores, why, how long it is kept, and how to remove it.", styles: "site bar", header: "fixed", footer: true, share: true },
  { name: "not-found", file: "404.html", paths: ["/:path(.*)*"], title: `Page not found${SUFFIX}`, description: "This page doesn't exist on the Minecraft Title Generator.", styles: "site bar", header: "fixed", footer: true, hidden: true }
]
