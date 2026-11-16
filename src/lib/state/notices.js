import { ref } from "vue"

const NOTICE_TIME = 3000

export const notice = ref("")
export const fileError = ref(null)

let noticing = null

export function showNotice(text) {
  notice.value = text
  clearTimeout(noticing)
  noticing = setTimeout(() => notice.value = "", NOTICE_TIME)
}
