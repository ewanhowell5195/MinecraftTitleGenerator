import { createApp } from "vue"
import { vTooltip } from "easy-tooltips-vue"
import Root from "./Root.vue"
import { followLinks, router } from "./router.js"
import "fluid-tabs-vue"
import "fluid-marquee-vue"
import "./theme.css"
import "./controls.css"
import "./style.css"
import "./fontEditor/editor.css"
import "./submissions/submissions.css"
import "./site/home/home.css"
import "./site/legal/legal.css"
import "./site/credits/credits.css"

followLinks(document)
createApp(Root).use(router).directive("tooltip", vTooltip).mount("#app")
