export const SITE = "https://mctitlegenerator.com"
export const TAGLINE = "Make your own Minecraft style 3D titles, right in your browser!"

const SUFFIX = " | Minecraft Title Generator"

const APP = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "Minecraft Title Generator", url: `${SITE}/` },
    { "@type": "WebApplication", name: "Minecraft Title Generator", url: `${SITE}/app/`, description: TAGLINE, image: `${SITE}/home/og.jpg`, applicationCategory: "DesignApplication", operatingSystem: "Any", browserRequirements: "Requires JavaScript and WebGL", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, author: { "@type": "Person", name: "Ewan Howell", url: "https://ewanhowell.com" } }
  ]
}

export const PAGES = [
  { name: "home", file: "index.html", paths: ["/"], title: "Minecraft Title Generator", description: TAGLINE, styles: "site bar", header: "floating", footer: true, data: APP, head: "<link rel=\"preload\" href=\"/home/logo.bin\" as=\"fetch\" crossorigin>" },
  { name: "app", file: "app/index.html", paths: ["/app/", "/app/presets/:id(\\d+)?"], title: "Minecraft Title Generator", description: TAGLINE, styles: "tool", stays: true },
  { name: "font-editor", file: "font-editor/index.html", paths: ["/font-editor/"], title: "Minecraft Title Generator Font Editor", image: "Font Editor", description: "Create your own Minecraft style fonts for the title generator, right in your browser!", styles: "tool editor" },
  { name: "credits", file: "credits/index.html", paths: ["/credits/"], title: `Credits${SUFFIX}`, image: "Credits", description: "Everyone who has made the fonts, textures and shapes in the Minecraft Title Generator.", styles: "site bar", header: "fixed", footer: true },
  { name: "submit", file: "submit/index.html", paths: ["/submit/"], title: `Submit${SUFFIX}`, image: "Submit", description: "Submit your own fonts, textures and shapes to the title generator for everyone to use!", styles: "tool bar submissions", header: "fixed" },
  { name: "submissions", file: "submissions/index.html", paths: ["/submissions/", "/submissions/:id(\\d+)/", "/submissions/:id(\\d+)/edit/"], title: `Submissions${SUFFIX}`, description: "Your submissions to the Minecraft Title Generator and their reviews.", styles: "tool bar submissions", header: "fixed", hidden: true },
  { name: "account", file: "account/index.html", paths: ["/account/"], title: `Manage account${SUFFIX}`, description: "Manage or delete your Minecraft Title Generator account.", styles: "tool bar submissions", header: "fixed", hidden: true },
  { name: "terms", file: "terms/index.html", paths: ["/terms/"], title: `Terms of Service${SUFFIX}`, image: "Terms of Service", description: "The terms of service for using the Minecraft Title Generator, sharing presets, and sending submissions.", styles: "site bar", header: "fixed", footer: true },
  { name: "privacy", file: "privacy/index.html", paths: ["/privacy/"], title: `Privacy Policy${SUFFIX}`, image: "Privacy Policy", description: "What data the Minecraft Title Generator stores, and how to remove it.", styles: "site bar", header: "fixed", footer: true },
  { name: "not-found", file: "404.html", paths: ["/:path(.*)*"], title: `Page not found${SUFFIX}`, description: "This page doesn't exist on the Minecraft Title Generator.", styles: "site bar", header: "fixed", footer: true, hidden: true }
]
