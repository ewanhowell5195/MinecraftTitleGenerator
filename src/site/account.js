import { createApp } from "vue"
import AccountMenu from "../components/AccountMenu.vue"
import NotificationBell from "../components/NotificationBell.vue"
import "./bar.css"

createApp(NotificationBell).mount(".bar-notifications")
createApp(AccountMenu).mount(".bar-account")
