import { onMounted, watch } from "vue"
import { CONNECT_LIFE, connectCode, connectPath } from "#lib/core/connecting.js"
import { platform } from "#lib/core/platform.js"
import { account, refreshAccount, signOut } from "#lib/state/account.js"
import { dropKey, forgetKey, keepKey, startKey } from "./key.js"

const CHECK = 2000

let connecting = null
let stopWatching = null

function pause() {
  return new Promise(resolve => {
    const timer = setTimeout(done, CHECK)
    function done() {
      clearTimeout(timer)
      removeEventListener("focus", done)
      resolve()
    }
    addEventListener("focus", done)
  })
}

function stopConnecting() {
  if (!connecting) return
  const { dialog } = connecting
  connecting = null
  dropKey()
  dialog.hide()
  dialog.delete()
}

async function waitForAccount(attempt) {
  const ends = Date.now() + CONNECT_LIFE
  while (connecting === attempt && Date.now() < ends) {
    await pause()
    if (connecting === attempt) await refreshAccount(true)
    if (connecting !== attempt || !account.value) continue
    keepKey()
    stopConnecting()
    Blockbench.showQuickMessage(`Signed in as ${account.value.name}`, 2000)
    return
  }
  if (connecting !== attempt) {
    if (account.value) refreshAccount(true)
    return
  }
  stopConnecting()
  Blockbench.showMessageBox({ title: "Sign in", message: "The sign-in expired before it was connected. Try again." })
}

async function signIn() {
  stopConnecting()
  const keyHash = await startKey()
  const open = () => Blockbench.openLink(platform.asset(connectPath(keyHash)))
  const dialog = new Dialog("minecraft_title_sign_in", {
    title: "Sign in",
    width: 420,
    buttons: ["dialog.cancel"],
    cancel_on_click_outside: false,
    component: {
      data: () => ({ code: connectCode(keyHash) }),
      methods: { open },
      template: `
        <div class="mtg-controls mtg-sign-in">
          <p>Press Connect in your browser. The page should show this code:</p>
          <p class="mtg-code">{{ code }}</p>
          <button class="mtg-button" @click="open"><i class="material-icons">open_in_new</i><span>Open the page again</span></button>
        </div>
      `
    },
    onCancel: stopConnecting,
    onButton: stopConnecting
  })
  connecting = { dialog }
  dialog.show()
  open()
  waitForAccount(connecting)
}

export const AccountButton = {
  setup() {
    onMounted(() => refreshAccount())
    return { account }
  },
  methods: {
    signIn,
    menu(event) {
      new Menu([
        { name: "Manage account", icon: "manage_accounts", click: () => Blockbench.openLink(platform.asset("/account/")) },
        { name: "Sign out", icon: "logout", click: () => signOut() }
      ]).open(event.currentTarget)
    }
  },
  template: `
    <button v-if="account" class="mtg-button mtg-account" :title="'Signed in as ' + account.name" @click="menu"><i :class="'fab fa-' + account.provider"></i><span>{{ account.name }}</span></button>
    <button v-else class="mtg-button mtg-account" title="Sign in" @click="signIn"><i class="material-icons">person</i><span>Sign in</span></button>
  `
}

export function registerAccount() {
  stopWatching = watch(account, value => value || forgetKey(), { flush: "sync" })
}

export function unregisterAccount() {
  stopConnecting()
  stopWatching()
}
