export function onRequestGet({ request, env }) {
  return env.ASSETS.fetch(new URL("/submit/", request.url))
}
