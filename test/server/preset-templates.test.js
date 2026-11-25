import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { pictureUrl } from "#lib/core/pictures.js"
import { ratingText, sharedText, toGoText, usesText, votesText } from "#src/app/presets/presetText.js"
import { DETAIL_SLOT, LIST_SLOT, SEARCH, TILES, VARIANTS, filled, markerPreset, presetsHtml, variantKey } from "#server/presetTemplates.js"

function tileTemplate(marker) {
  const rating = marker.rating === null ? "<span>Needs votes</span>" : `<span>${ratingText(marker.rating)}</span>`
  return `<div class="card" data-v-1><img src="${pictureUrl(marker)}" alt="A preview of the ${marker.name} title"><a href="/app/presets/${marker.id}">${marker.name}</a>${marker.author ? `<button>${marker.author}</button>` : "<span>Community</span>"}${rating}</div>`
}

function detailTemplate(marker) {
  const rating = marker.rating === null ? `<p>${toGoText(marker.votes)}</p>` : `<span style="--rating:${ratingText(marker.rating)}"></span><strong>${ratingText(marker.rating)}</strong><span>${votesText(marker.votes)}</span>`
  return `<input value="${SEARCH}"><button>Popular this week</button><div>${TILES}</div><aside><h2>${marker.name}</h2>${rating}<span>${usesText(marker)}</span><span>Shared ${sharedText(marker.createdAt)}</span></aside>`
}

const templates = {
  list: `<input value="${SEARCH}"><button>Popular this week</button><div>${TILES}</div>`,
  empty: "<p>Nobody has shared a preset yet.</p>",
  emptySearch: `<input value="${SEARCH}"><p>No presets match this search.</p>`,
  tiles: Object.fromEntries(VARIANTS.map(variant => [variantKey(variant), tileTemplate(markerPreset(LIST_SLOT, variant))])),
  detail: Object.fromEntries(VARIANTS.map(variant => [variantKey(variant), detailTemplate(markerPreset(DETAIL_SLOT, variant))]))
}

const RATED = { id: 12, code: "abc", fingerprint: "f00d", name: "Iron & <Ember>", downloads: 40, week: 3, votes: 9, rating: 4.25, createdAt: Date.UTC(2026, 10, 5), author: "steve", authorProvider: "github" }
const UNRATED = { id: 7, code: "def", fingerprint: null, name: "Markername1 again", downloads: 1, votes: 1, rating: null, createdAt: Date.UTC(2026, 9, 1), author: null, authorProvider: null }

describe("presets page templates", () => {
  test("a tile is filled with the preset's own values, escaped", () => {
    const tile = filled(templates.tiles["rated-github"], markerPreset(LIST_SLOT, { rated: true, provider: "github" }), RATED)
    assert.equal(tile, "<div class=\"card\" data-v-1><img src=\"https://thumbnails.mctitlegenerator.com/p/f00d.webp\" alt=\"A preview of the Iron &#38; &#60;Ember&#62; title\"><a href=\"/app/presets/12\">Iron &#38; &#60;Ember&#62;</a><button>steve</button><span>4.3</span></div>")
  })

  test("a preset without a picture of its own uses its title code, and a name holding a placeholder is left alone", () => {
    const tile = filled(templates.tiles["unrated-community"], markerPreset(LIST_SLOT, { rated: false, provider: null }), UNRATED)
    assert.match(tile, /src="https:\/\/thumbnails\.mctitlegenerator\.com\/t\/def\.webp"/)
    assert.match(tile, />Markername1 again</)
    assert.match(tile, /<span>Community<\/span><span>Needs votes<\/span>/)
  })

  test("the list holds a tile per preset in order, with the sort and search the address asked for", () => {
    const html = presetsHtml(templates, { presets: [RATED, UNRATED], selected: null, sort: "new", search: "iron \"x\"" })
    assert.ok(html.startsWith("<input value=\"iron &#34;x&#34;\"><button>Newest</button><div><div class=\"card\" data-v-1><img"))
    assert.ok(html.indexOf(">Iron &#38;") < html.indexOf(">Markername1 again<"))
  })

  test("a selected preset fills the detail panel and marks its own tile", () => {
    const html = presetsHtml(templates, { presets: [UNRATED, RATED], selected: RATED, sort: "week", search: "" })
    assert.match(html, /<aside><h2>Iron &#38; &#60;Ember&#62;<\/h2><span style="--rating:4.3"><\/span><strong>4.3<\/strong><span>from 9 votes<\/span><span>40 uses in total, 3 in the last 7 days<\/span><span>Shared 5 November 2026<\/span><\/aside>/)
    assert.equal(html.match(/class="card selected"/g).length, 1)
    assert.ok(html.indexOf("card selected") > html.indexOf("Markername1 again"))
  })

  test("an unrated selected preset says how many votes it still needs", () => {
    const html = presetsHtml(templates, { presets: [], selected: UNRATED, sort: "week", search: "" })
    assert.ok(html.includes(`<h2>Markername1 again</h2><p>${toGoText(1)}</p><span>1 use in total</span>`))
  })

  test("no presets shows the empty message that fits the search", () => {
    assert.equal(presetsHtml(templates, { presets: [], selected: null, sort: "week", search: "" }), templates.empty)
    assert.equal(presetsHtml(templates, { presets: [], selected: null, sort: "week", search: "zzz" }), "<input value=\"zzz\"><p>No presets match this search.</p>")
  })
})
