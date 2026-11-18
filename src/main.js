import { createApp } from "vue"
import { setTooltipDefaults, vTooltip } from "easy-tooltips-vue"
import Root from "./Root.vue"
import { followLinks, router } from "./router.js"
import { seedCommunity } from "./lib/state/community.js"
import { SEED_ID } from "./lib/core/seed.js"
import "fluid-tabs-vue"
import "fluid-marquee-vue"
import "./styles/theme.css"
import "./styles/controls.css"
import "./styles/tool.css"
import "./fontEditor/editor.css"
import "./submissions/submissions.css"
import "./styles/site.css"
import "./site/legal/legal.css"
import "./site/credits/credits.css"

const seed = document.getElementById(SEED_ID)
if (seed) seedCommunity(JSON.parse(seed.textContent))
setTooltipDefaults({ dismiss: true })
followLinks(document)
const app = createApp(Root).use(router).directive("tooltip", vTooltip)
router.isReady().then(() => app.mount("#app"))
