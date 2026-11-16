import { clearNotifications, listNotifications, markNotificationsSeen } from "../../../src/server/submissions/notifications.js"

export const onRequestGet = listNotifications
export const onRequestPost = markNotificationsSeen
export const onRequestDelete = clearNotifications
