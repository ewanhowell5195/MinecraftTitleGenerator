import { watch } from "vue"
import { confirming } from "#lib/state/confirm.js"
import { fileError, notice } from "#lib/state/notices.js"

const stops = []

function ask(request) {
  if (!request) return
  Blockbench.showMessageBox({ title: request.title, message: request.paragraphs.join("\n\n"), buttons: [request.action, "dialog.cancel"], confirmIndex: 0, cancelIndex: 1 }, button => request.answer(button === 0))
}

function tell(message) {
  if (message === null) return
  fileError.value = null
  Blockbench.showMessageBox({ title: "Minecraft Title Generator", message })
}

export function registerAsking() {
  stops.push(watch(confirming, ask), watch(fileError, tell), watch(notice, text => text && Blockbench.showQuickMessage(text, 3000)))
}

export function unregisterAsking() {
  for (const stop of stops.splice(0)) stop()
}
