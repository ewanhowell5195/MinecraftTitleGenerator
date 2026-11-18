import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "vite"
import { PAGES } from "../site/pages.js"
import { splashOf } from "../site/shell.js"
import { TEMPLATES } from "../server/presetTemplates.js"
import { presetTemplates } from "./presetTemplates.js"

const ENTRY = "src/prerender/entry.js"

function assetLinks(modules, manifest) {
  const files = Array.from(new Set(modules.flatMap(id => manifest[id] ?? [])))
  const styles = files.filter(file => file.endsWith(".css")).map(file => `<link rel="stylesheet" href="${file}">`)
  const scripts = files.filter(file => file.endsWith(".js")).map(file => `<link rel="modulepreload" crossorigin href="${file}">`)
  return styles.concat(scripts).join("")
}

function renderedPath(page) {
  return page.paths[0].startsWith("/:") ? "/404" : page.paths[0]
}

export async function prerender(root, outDir) {
  const server = path.join(root, "node_modules", ".prerender")
  await build({ root, configFile: path.join(root, "vite.config.js"), logLevel: "warn", build: { ssr: ENTRY, outDir: server, emptyOutDir: true } })
  const { renderPage } = await import(pathToFileURL(path.join(server, "entry.js")).href)
  const manifestFolder = path.join(outDir, ".vite")
  const manifest = JSON.parse(await fs.promises.readFile(path.join(manifestFolder, "ssr-manifest.json"), "utf8"))
  for (const page of PAGES.filter(page => page.rendered)) {
    const file = path.join(outDir, page.file)
    const shell = await fs.promises.readFile(file, "utf8")
    const splash = splashOf(page)
    if (!shell.includes(splash)) throw new Error(`${page.file} has no splash to swap for the rendered page`)
    const { html, modules } = await renderPage(renderedPath(page))
    const rendered = shell.replace(splash, () => `<div id="app">${html}</div>`).replace("</head>", () => `${assetLinks(modules, manifest)}</head>`)
    await fs.promises.writeFile(file, rendered)
  }
  const { templates, modules } = await presetTemplates(renderPage)
  const file = path.join(outDir, TEMPLATES)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify({ links: assetLinks(modules, manifest), ...templates }))
  await fs.promises.rm(manifestFolder, { recursive: true })
  await fs.promises.rm(server, { recursive: true })
}
