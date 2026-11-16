import { createApp } from "vue"
import { setTooltipDefaults, vTooltip } from "easy-tooltips-vue"
import Root from "./Root.vue"
import { followLinks, router } from "./router.js"
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

setTooltipDefaults({ dismiss: true })
followLinks(document)
createApp(Root).use(router).directive("tooltip", vTooltip).mount("#app")
