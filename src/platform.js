import { usePlatform } from "./lib/core/platform.js"

usePlatform({ coverWorker: () => new Worker(new URL("./lib/texture/paint/coverWorker.js", import.meta.url), { type: "module" }) })
