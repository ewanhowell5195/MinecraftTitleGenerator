export const SITE = "https://mctitlegenerator.com"
export const TAGLINE = "Make your own Minecraft style 3D titles, right in your browser!"

const SUFFIX = " | Minecraft Title Generator"

const HOME_DESCRIPTION = "Make your own Minecraft style 3D titles and logos, right in your browser. Pick fonts and textures, browse shared presets, and save your title as an image."
const APP_DESCRIPTION = "Type your text, pick a font and texture, and render your own Minecraft style 3D title as a PNG or SVG."
const FONT_EDITOR_DESCRIPTION = "Create your own Minecraft style fonts for the title generator, right in your browser!"

export const PERSON = { "@type": "Person", "@id": `${SITE}/#ewan`, name: "Ewan Howell", url: "https://ewanhowell.com/", sameAs: ["https://github.com/ewanhowell5195"] }
export const WEBSITE = { "@type": "WebSite", "@id": `${SITE}/#website`, name: "Minecraft Title Generator", url: `${SITE}/`, inLanguage: "en", publisher: { "@id": PERSON["@id"] } }

function application(path, name, description, image) {
  return { "@type": "WebApplication", "@id": `${SITE}${path}#app`, name, url: `${SITE}${path}`, description, image: `${SITE}${image}`, applicationCategory: "DesignApplication", operatingSystem: "Web", browserRequirements: "Requires JavaScript and WebGL", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" }, author: { "@id": PERSON["@id"] }, isPartOf: { "@id": WEBSITE["@id"] }, sameAs: ["https://github.com/ewanhowell5195/MinecraftTitleGenerator"] }
}

export function structuredData(...items) {
  return { "@context": "https://schema.org", "@graph": [WEBSITE, PERSON].concat(items) }
}

const GENERATOR = application("/app/", "Minecraft Title Generator", APP_DESCRIPTION, "/share/site.jpg")
const FONT_EDITOR = application("/font-editor/", "Minecraft Title Generator Font Editor", FONT_EDITOR_DESCRIPTION, "/share/font-editor.jpg")

export const PAGES = [
  { name: "home", file: "index.html", paths: ["/"], title: "Minecraft Title Generator - Make Minecraft Style 3D Titles", description: HOME_DESCRIPTION, buttons: [{ label: "Title Generator", url: `${SITE}/app/` }, { label: "Presets", url: `${SITE}/app/presets` }, { label: "Font Editor", url: `${SITE}/font-editor/` }], styles: "site", header: "floating", footer: true, data: structuredData(GENERATOR, FONT_EDITOR), head: "<link rel=\"preload\" href=\"/home/logo.bin\" as=\"fetch\" crossorigin>" },
  { name: "app", file: "app/index.html", paths: ["/app/", "/app/presets/:id(\\d+)?"], title: `Make a Title${SUFFIX}`, description: APP_DESCRIPTION, buttons: [{ label: "Open", url: `${SITE}/app/` }, { label: "Presets", url: `${SITE}/app/presets` }], styles: "tool", stays: true, data: structuredData(GENERATOR) },
  { name: "font-editor", file: "font-editor/index.html", extraFiles: ["font-editor/editor.html", "font-editor/import.html"], paths: ["/font-editor/", "/font-editor/editor", "/font-editor/import"], title: "Minecraft Title Generator Font Editor", image: "Font Editor", description: FONT_EDITOR_DESCRIPTION, styles: "tool editor", data: structuredData(FONT_EDITOR) },
  { name: "credits", file: "credits/index.html", paths: ["/credits/"], title: `Credits${SUFFIX}`, image: "Credits", description: "Everyone who has made the fonts, textures and shapes in the Minecraft Title Generator.", styles: "site", header: "fixed", footer: true },
  { name: "submit", file: "submit/index.html", paths: ["/submit/"], title: `Submit${SUFFIX}`, image: "Submit", buttons: [{ label: "Submit", url: `${SITE}/submit/` }], description: "Submit your own fonts, textures and shapes to the title generator for everyone to use!", styles: "tool submissions", header: "fixed" },
  { name: "submissions", file: "submissions/index.html", paths: ["/submissions/", "/submissions/:id(\\d+)/", "/submissions/:id(\\d+)/edit/"], title: `Submissions${SUFFIX}`, description: "Your submissions to the Minecraft Title Generator and their reviews.", styles: "tool submissions", header: "fixed", hidden: true, keyedById: true },
  { name: "account", file: "account/index.html", paths: ["/account/"], title: `Manage account${SUFFIX}`, description: "Manage or delete your Minecraft Title Generator account.", styles: "tool submissions", header: "fixed", hidden: true },
  { name: "terms", file: "terms/index.html", paths: ["/terms/"], title: `Terms of Service${SUFFIX}`, image: "Terms of Service", description: "The terms of service for using the Minecraft Title Generator, sharing presets, and sending submissions.", styles: "site", header: "fixed", footer: true },
  { name: "privacy", file: "privacy/index.html", paths: ["/privacy/"], title: `Privacy Policy${SUFFIX}`, image: "Privacy Policy", description: "What data the Minecraft Title Generator stores, and how to remove it.", styles: "site", header: "fixed", footer: true },
  { name: "not-found", file: "404.html", paths: ["/:path(.*)*"], title: `Page not found${SUFFIX}`, description: "This page doesn't exist on the Minecraft Title Generator.", styles: "site", header: "fixed", footer: true, hidden: true }
]
