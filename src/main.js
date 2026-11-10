import { createApp } from "vue"
import Root from "./Root.vue"
import { followLinks, router } from "./router.js"
import "fluid-tabs-vue"
import "fluid-marquee-vue"
import "./theme.css"
import "./controls.css"
import "./style.css"
import "./fontEditor/editor.css"
import "./submissions/submissions.css"
import "./home/home.css"
import "./legal/legal.css"
import "./credits/credits.css"
import "./site/bar.css"

indexedDB.deleteDatabase("minecraft-title-pictures")

followLinks(document)
createApp(Root).use(router).mount("#app")
