import { ref } from "vue"

const NOTICE_TIME = 3000

export const notice = ref("")

let noticing = null

export function showNotice(text) {
  notice.value = text
  clearTimeout(noticing)
  noticing = setTimeout(() => notice.value = "", NOTICE_TIME)
}
