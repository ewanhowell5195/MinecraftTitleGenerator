import { Refusal, USER_AGENT, cachedAtEdge, guarded, reply } from "./http.js"
import { googleCatalog } from "../lib/font/googleCatalog.js"

const LIST_SECONDS = 86400

export const googleFonts = guarded(context => cachedAtEdge(context, async () => {
  try {
    return reply(200, { fonts: await googleCatalog(USER_AGENT) })
  } catch (err) {
    throw new Refusal(502, `${err.message}.`)
  }
}, { seconds: LIST_SECONDS, browser: `public, max-age=${LIST_SECONDS}` }))
