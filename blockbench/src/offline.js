import { ref } from "vue"
import { SITE } from "./platform.js"
import { FORMAT } from "./format.js"
import { library, libraryFailed, openLibrary } from "./library.js"

export const STYLES = `
  .mtg-offline {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px;
    text-align: center;
    color: var(--color-subtle_text);
  }
  .mtg-offline > i {
    max-width: none;
    margin-bottom: 4px;
    font-size: 40px;
  }
  .mtg-offline > strong {
    font-size: 16px;
    color: var(--color-text);
  }
  .mtg-offline > .markdown p {
    margin: 0 0 8px;
  }
  .mtg-offline > button {
    margin-top: 8px;
    user-select: none;
  }
  .mtg-offline-cover {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-back);
  }
  .mtg-offline-cover > .mtg-offline {
    max-width: 420px;
  }
`

const titleOpen = ref(false)

let cover = null
let styles = null

const RETRYING = "It keeps trying in the background, or you can try again now."

function heading() {
  if (navigator.onLine === false) return "You're offline"
  return library.unreachable ? "Connection failed" : "The title generator couldn't load"
}

function explanation() {
  if (navigator.onLine === false) return `Connect to the internet to load the fonts, textures and shapes. ${RETRYING}`
  if (!library.unreachable) return library.error
  return [
    "The Minecraft Title Generator couldn't load its fonts, textures and shapes.",
    `Make sure you're connected to the internet and can open this [fonts.json](${SITE}/fonts/fonts.json) file.`,
    "If you can't open it, it may be blocked by your computer or your internet provider. If it isn't your computer blocking it, a VPN can get around the block. [Cloudflare WARP](https://1.1.1.1/) is a free one that usually fixes this.",
    RETRYING
  ].join("\n\n")
}

export const OfflineNotice = {
  setup: () => ({ library, heading, explanation: () => pureMarked(explanation()), retry: openLibrary }),
  template: `
    <div class="mtg-offline">
      <i class="material-icons">cloud_off</i>
      <strong>{{ heading() }}</strong>
      <div class="markdown" v-html="explanation()"></div>
      <button :disabled="library.loading" @click="retry"><i class="material-icons">refresh</i> {{ library.loading ? "Trying again" : "Try again" }}</button>
    </div>
  `
}

export function whenLibrary(create) {
  if (!libraryFailed()) return create()
  Blockbench.showMessageBox({ title: heading(), message: explanation(), buttons: ["Try again", "dialog.cancel"], confirmIndex: 0, cancelIndex: 1 }, async button => {
    if (button !== 0) return
    await openLibrary()
    whenLibrary(create)
  })
  return false
}

export function followProject() {
  titleOpen.value = !!Project && Format?.id === FORMAT
}

export function leftProject() {
  titleOpen.value = false
}

export function registerOffline() {
  styles = Blockbench.addCSS(STYLES)
  const mount = document.createElement("div")
  document.getElementById("preview").append(mount)
  cover = new Vue({
    components: { OfflineNotice },
    setup: () => ({ shown: () => titleOpen.value && libraryFailed() }),
    template: "<div v-if='shown()' class='mtg-offline-cover'><offline-notice /></div><div v-else></div>"
  }).$mount(mount)
  followProject()
}

export function unregisterOffline() {
  cover.$el.remove()
  cover.$destroy()
  cover = null
  styles.delete()
}
