import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const HERE = fileURLToPath(new URL("./", import.meta.url))
const NOTHING = "\0nothing"
const dev = process.argv.includes("--dev")

const withoutNode = {
  name: "without-node",
  enforce: "pre",
  resolveId: id => id.startsWith("node:") ? NOTHING : null,
  load: id => id === NOTHING ? "export default {}" : null
}

await build({
  configFile: false,
  root: HERE,
  publicDir: false,
  logLevel: "warn",
  plugins: [withoutNode],
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
