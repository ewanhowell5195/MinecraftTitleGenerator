import path from "node:path"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"
import { transform as transformCss } from "lightningcss"
import { build } from "vite"

const HERE = fileURLToPath(new URL("./", import.meta.url))
const NOTHING = "\0nothing"
const WOFF2 = "woff2-encoder/dist/decompress.js"
const WASM = /"data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)"/
const BLOCKED_WORDS = path.join(HERE, "../src/lib/core/blockedWords.js")
const STARTUP ="let C=new Promise(A=>{I({onRuntimeInitialized(){A(this)}})});"
const dev = process.argv.includes("--dev")

const withoutNode = {
  name: "without-node",
  enforce: "pre",
  resolveId: id => id.startsWith("node:") ? NOTHING : null,
  load: id => id === NOTHING ? "export default {}" : null
}

const serverWordCheck = {
  name: "server-word-check",
  load: id => path.normalize(id) === BLOCKED_WORDS ? "export function blockedWordProblem() { return null }" : null
}

const packedWoff2 = {
  name: "packed-woff2",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith(WOFF2)) return null
    const wasm = code.match(WASM)
    if (!wasm || code.split(STARTUP).length !== 2) throw new Error(`${WOFF2} no longer matches what the plugin build packs`)
    const packed = zlib.deflateRawSync(Buffer.from(wasm[1], "base64"), { level: 9 }).toString("base64")
    const inflate = `async function inflatedWasm(){const bytes=Uint8Array.from(atob("${packed}"),char=>char.charCodeAt(0));return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer())}`
    const startup = "let C=inflatedWasm().then(wasmBinary=>new Promise(A=>{I({wasmBinary,onRuntimeInitialized(){A(this)}})}));"
    return `${inflate}\n${code.replace(wasm[0], "\"data:application/octet-stream;base64,\"").replace(STARTUP, startup)}`
  }
}

function literal(text) {
  return `\`${text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``
}

function compactCss(node, id) {
  if (node.expressions.length) throw new Error(`STYLES in ${id} has an interpolation, so it can't be minified`)
  return literal(transformCss({ filename: id, code: Buffer.from(node.quasis[0].value.cooked), minify: true }).code.toString())
}

function compactTemplate(node, code) {
  const last = node.quasis.length - 1
  const parts = node.quasis.map((quasi, index) => {
    let raw = quasi.value.raw.replace(/\s*\n\s*/g, " ")
    if (index === 0) raw = raw.trimStart()
    if (index === last) raw = raw.trimEnd()
    return index < last ? `${raw}\${${code.slice(node.expressions[index].start, node.expressions[index].end)}}` : raw
  })
  return `\`${parts.join("")}\``
}

const compactStrings = {
  name: "compact-strings",
  transform(code, id) {
    if (!path.normalize(id).startsWith(path.join(HERE, "src")) || !/STYLES = `|template: `/.test(code)) return null
    const edits = []
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit)
      if (!node || typeof node.type !== "string") return
      if (node.type === "VariableDeclarator" && node.id.name === "STYLES" && node.init?.type === "TemplateLiteral") edits.push([node.init, compactCss(node.init, id)])
      if (node.type === "Property" && !node.computed && (node.key.name ?? node.key.value) === "template" && node.value.type === "TemplateLiteral") edits.push([node.value, compactTemplate(node.value, code)])
      for (const value of Object.values(node)) {
        if (value && typeof value === "object") visit(value)
      }
    }
    visit(this.parse(code))
    let result = code
    for (const [node, text] of edits.sort((a, b) => b[0].start - a[0].start)) {
      if (code[node.start] !== "`" || code[node.end - 1] !== "`") throw new Error(`the parser's offsets don't match ${id}`)
      result = result.slice(0, node.start) + text + result.slice(node.end)
    }
    return result
  }
}

await build({
  configFile: false,
  root: HERE,
  publicDir: false,
  logLevel: "warn",
  plugins: [withoutNode, serverWordCheck, packedWoff2].concat(dev ? [] : [compactStrings]),
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: path.join(HERE, "dist"),
    emptyOutDir: true,
    target: "esnext",
    minify: !dev,
    watch: process.argv.includes("--watch") ? {} : null,
    lib: { entry: path.join(HERE, "src/index.js"), formats: ["iife"], name: "minecraftTitleGenerator", fileName: () => "minecraft_title_generator.js" },
    rolldownOptions: { external: ["three", "vue"], output: { comments: false, globals: { three: "THREE", vue: "Vue" } } }
  }
})
