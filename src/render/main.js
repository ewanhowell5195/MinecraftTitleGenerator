import { createApp } from "vue"
import { persistence } from "../lib/view.js"
import RenderHost from "./RenderHost.vue"
import "../style.css"

persistence.on = false

createApp(RenderHost).mount("#app")
