import { shallowRef } from "vue"

export const confirming = shallowRef(null)

export function askConfirm({ title, message, action = "OK", danger = false }) {
  confirming.value?.answer(false)
  return new Promise(resolve => {
    const request = {
      title,
      paragraphs: message.split("\n\n"),
      action,
      danger,
      answer(value) {
        if (confirming.value === request) confirming.value = null
        resolve(value)
      }
    }
    confirming.value = request
  })
}
