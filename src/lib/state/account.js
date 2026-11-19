import { ref } from "vue"
import { apiCall, jsonOptions } from "../submissions/api.js"
import { showNotice } from "./notices.js"
import { saveStore, store } from "./communityStore.js"
import { ACCOUNT_CHANNEL, SIGN_IN_RETURN } from "../core/providers.js"

const ACCOUNT_API = "/api/account"

export const account = ref(store.account)
export const signInProviders = ref(store.providers)
export const accountChanges = ref(0)

const signedInHooks = []
const signedInOrOutHooks = []

let accountRequest = null
let accountChecked = false
let channel = null

function called(url, options) {
  return apiCall(url, options, "The community presets aren't available right now", () => refreshAccount(true))
}

export function onSignedIn(hook) {
  signedInHooks.push(hook)
}

export function onSignedInOrOut(hook) {
  signedInOrOutHooks.push(hook)
}

function setAccount(user) {
  store.account = user
  account.value = user
  saveStore()
}

function announceAccountChange() {
  channel?.postMessage("changed")
}

function listenForAccountChanges() {
  if (channel) return
  channel = new BroadcastChannel(ACCOUNT_CHANNEL)
  channel.onmessage = () => refreshAccount(true)
}

export function refreshAccount(force = false) {
  listenForAccountChanges()
  if (accountChecked && !force) return Promise.resolve()
  accountRequest ??= fetchAccount().finally(() => accountRequest = null)
  return accountRequest
}

async function fetchAccount() {
  try {
    const { user, providers = [] } = await called(ACCOUNT_API)
    const wasSignedIn = !!store.account
    const changed = store.account?.id !== user?.id
    accountChecked = true
    store.providers = providers
    signInProviders.value = providers
    if (user) {
      for (const hook of signedInHooks) await hook()
    }
    setAccount(user)
    if (user || wasSignedIn) {
      for (const hook of signedInOrOutHooks) await hook()
    }
    if (changed) accountChanges.value++
  } catch (err) {
    console.error(err)
  }
}

export function signIn(provider) {
  const url = `${ACCOUNT_API}/login/${provider}?return=${encodeURIComponent(location.origin)}`
  listenForAccountChanges()
  if (window.open(url, "signin", "popup,width=520,height=760")) return
  sessionStorage.setItem(SIGN_IN_RETURN, location.href)
  location.assign(url)
}

export async function deleteAccount(mode) {
  await called(`${ACCOUNT_API}/delete`, jsonOptions("POST", { mode }))
  await fetchAccount()
  announceAccountChange()
}

export async function signOut() {
  try {
    await called(`${ACCOUNT_API}/logout`, { method: "POST" })
    await fetchAccount()
    announceAccountChange()
  } catch (err) {
    console.error(err)
    showNotice(`Couldn't sign out: ${err.message}`)
  }
}
