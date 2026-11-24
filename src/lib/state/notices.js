import { ref } from "vue"

export const notice = ref("")
export const fileError = ref(null)

let noticing = null

export function showNotice(text) {
  notice.value = text
  clearTimeout(noticing)
  noticing = setTimeout(() => notice.value = "", 3000)
}
