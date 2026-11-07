import { createApp } from "vue"
import App from "./App.vue"
import "./style.css"

indexedDB.deleteDatabase("minecraft-title-pictures")

createApp(App).mount("#app")
