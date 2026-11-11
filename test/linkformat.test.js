import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, test } from "node:test"
import { GENERATED_SETTINGS } from "../src/lib/generated.js"
import { UPLOAD_KEYS, decodeTitle, encodeTitle, readLines, unknownSetting, writeLines } from "../src/lib/linkformat.js"
import { LAYER, typeDefaults } from "../src/lib/settings.js"

const fixtures = JSON.parse(fs.readFileSync(new URL("links.json", import.meta.url), "utf8"))

function roundTrip(lines) {
  return readLines(writeLines(lines))
}

function isCompact(key, value) {
  return writeLines([{ [key]: value }])[2] !== 0
}

describe("twist in links", () => {
  test("round trips the twist centres", () => {
    const lines = [{ twistRibbon: 30, twistRibbonCentre: 25, twistRibbonMirror: true, twistDoor: -10, twistDoorCentre: 100 }]
    assert.deepEqual(decodeTitle(encodeTitle({ version: 5, lines }).code).lines, lines)
  })

  test("round trips every twist setting, in both directions", () => {
    const lines = [{ twistRibbon: -135, twistRibbonAnchor: "left", twistRibbonMirror: false, twistDoor: 45.5, twistDoorAnchor: "centre", twistDoorSame: true }, { twistRibbon: 180, twistRibbonAnchor: "right", twistDoor: -1, twistDoorAnchor: "right" }]
    assert.deepEqual(decodeTitle(encodeTitle({ version: 2, lines }).code).lines, lines)
  })
})

describe("old links", () => {
  for (const { name, code, lines } of fixtures) {
    test(name, () => {
      assert.deepEqual(decodeTitle(code), { version: 1, lines })
    })
  }
})

describe("settings table", () => {
  const { group, ...settings } = typeDefaults("top")

  for (const [key, value] of Object.entries(settings).filter(([key]) => !UPLOAD_KEYS.includes(key))) {
    test(`${key} is stored compactly`, () => {
      assert.ok(isCompact(key, value))
      assert.deepEqual(roundTrip([{ [key]: value }])[0][key], Array.isArray(value) && key === "stops" ? value.map(stop => ({ ...stop, colour: stop.colour.toLowerCase() })) : value)
    })
  }

  test("line words are stored compactly", () => {
    assert.ok(isCompact("words", [{ text: "a" }]))
  })

  for (const [key, value] of Object.entries(LAYER).filter(([key]) => key !== "file")) {
    test(`overlay ${key} is stored compactly`, () => {
      assert.ok(isCompact(key, value))
    })
  }

  const generated = new Set(Object.values(GENERATED_SETTINGS).flat().map(setting => setting.key))
  for (const key of generated) {
    test(`generated overlay ${key} is stored compactly`, () => {
      for (const list of ["overlays", "edgeOverlays"]) {
        const lines = [{ [list]: [{ overlay: "shine", source: "premade", [key]: 40 }] }]
        assert.ok(!Buffer.from(writeLines(lines)).includes(key))
        assert.deepEqual(roundTrip(lines), lines)
        assert.equal(unknownSetting(lines), null)
      }
    })
  }

  test("a line's fade is still on or off", () => {
    assert.ok(isCompact("fade", true))
    assert.equal(unknownSetting([{ fade: 40 }]), "fade")
  })

  test("an overlay fade opens and can be shared", () => {
    const { lines } = decodeTitle("EAQICEAKB71oSAQQGBQKB71rcAQAQwAzWAYAK")
    assert.deepEqual(lines, [{ text: "shine", overlays: [{ overlay: "shine", source: "premade", opacity: 100, fade: 80 }] }])
    assert.equal(unknownSetting(lines), null)
  })
})

describe("values", () => {
  for (const value of [0, 1, 7, 8, 100, 359, 123456789, -1, -180, -180.25, 0.5, 0.7977, 0.000001, 1 / 3, 0.1 + 0.2, 1e21, -(2 ** 50), 2 ** 44, Number.MAX_VALUE, Number.MIN_VALUE]) {
    test(`number ${value}`, () => {
      assert.equal(roundTrip([{ hue: value }])[0].hue, value)
    })
  }

  test("simple numbers take few bytes", () => {
    assert.equal(writeLines([{ hue: 5 }]).length, 4)
    assert.equal(writeLines([{ hue: 359 }]).length, 5)
  })

  test("a Minecraft texture and its version", () => {
    const line = { textureSource: "tileable", tileableSource: "minecraft", minecraftTexture: "stone", minecraftVersion: "26.4-snapshot-7" }
    assert.deepEqual(roundTrip([line]), [line])
  })

  test("true and false", () => {
    assert.deepEqual(roundTrip([{ fade: true, smooth: false }]), [{ fade: true, smooth: false }])
  })

  test("booleans take only their key", () => {
    assert.equal(writeLines([{ spaceBefore: true }]).length, 3)
  })

  test("null", () => {
    assert.deepEqual(roundTrip([{ matchWidth: null, texture: null }]), [{ matchWidth: null, texture: null }])
    assert.deepEqual(roundTrip([{ matchWidth: 0, matchBottom: true }]), [{ matchWidth: 0, matchBottom: true }])
  })

  test("text keeps any characters", () => {
    for (const text of ["", " ", "héllo wörld", "✨ emoji 🎉", "日本語", "a\nb\t\"c\""]) {
      assert.deepEqual(roundTrip([{ text }]), [{ text }])
    }
  })

  test("long text", () => {
    const text = "minecraft ".repeat(100)
    assert.deepEqual(roundTrip([{ text }]), [{ text }])
  })

  test("colours take 3 bytes and come back lowercase", () => {
    assert.equal(writeLines([{ borderColour: "#FFAA00" }]).length, 6)
    assert.deepEqual(roundTrip([{ borderColour: "#FFAA00" }]), [{ borderColour: "#ffaa00" }])
  })

  test("gradient stops", () => {
    const stops = [{ colour: "#ff8800", position: 0 }, { colour: "#3300aa", position: 33.5 }, { colour: "#000000", position: 100 }]
    assert.deepEqual(roundTrip([{ stops }]), [{ stops }])
  })

  test("nested words and overlays", () => {
    const lines = [{ type: "bottom", matchWidth: 0, words: [{ text: "one", overlays: [{ overlay: "outline", blend: "screen", opacity: 50, seed: 12345 }] }, { text: "two", edgeOverlays: [] }] }]
    assert.deepEqual(roundTrip(lines), lines)
  })

  test("no lines, no settings", () => {
    assert.deepEqual(roundTrip([]), [])
    assert.deepEqual(roundTrip([{}]), [{}])
  })
})

describe("values the table cannot hold", () => {
  const cases = {
    "a setting missing from the table": { brandNew: { a: [1, 2] } },
    "text where a number goes": { scaleX: "1" },
    "a number where text goes": { text: 5 },
    "a number where a boolean goes": { fade: 40 },
    "null where a boolean goes": { fade: null },
    "an unknown choice": { blend: "plus-lighter" },
    "a colour that is not hex": { colour: "red" },
    "a colour with alpha": { borderColour: "#ffffff80" },
    "a stop with extra fields": { stops: [{ colour: "#ff0000", position: 0, extra: 1 }] },
    "a list of the wrong things": { overlays: [1, 2] }
  }

  for (const [name, line] of Object.entries(cases)) {
    test(name, () => {
      assert.deepEqual(roundTrip([line]), [line])
    })
  }

  test("an unknown setting cannot set the prototype", () => {
    const [line] = roundTrip([JSON.parse('{ "__proto__": { "polluted": true } }')])
    assert.equal(Object.getPrototypeOf(line), Object.prototype)
    assert.equal(line.polluted, undefined)
    assert.equal({}.polluted, undefined)
  })
})

describe("uploaded overlays", () => {
  const pixel = "data:image/png;base64,AAAA"

  test("are left out and counted", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ overlays: [{ source: "file", file: pixel }, { overlay: "outline" }], edgeOverlays: [{ source: "file", file: pixel }] }] })
    assert.equal(skipped, 2)
    assert.deepEqual(decodeTitle(code).lines, [{ overlays: [{ overlay: "outline" }], edgeOverlays: [] }])
  })

  test("in words are left out and counted", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ words: [{ text: "a", overlays: [{ source: "file", file: pixel }] }, { text: "b" }] }] })
    assert.equal(skipped, 1)
    assert.deepEqual(decodeTitle(code).lines, [{ words: [{ text: "a", overlays: [] }, { text: "b" }] }])
  })

  test("an empty upload slot is dropped but not counted", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ overlays: [{ source: "file" }] }] })
    assert.equal(skipped, 0)
    assert.deepEqual(decodeTitle(code).lines, [{ overlays: [] }])
  })

  test("old image data on a built-in overlay is removed", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ overlays: [{ overlay: "outline", file: pixel }] }] })
    assert.equal(skipped, 0)
    assert.deepEqual(decodeTitle(code).lines, [{ overlays: [{ overlay: "outline" }] }])
  })

  test("the title passed in is left alone", () => {
    const lines = [{ overlays: [{ source: "file", file: pixel }], words: [{ overlays: [{ source: "file", file: pixel }] }] }]
    const before = structuredClone(lines)
    encodeTitle({ version: 1, lines })
    assert.deepEqual(lines, before)
  })
})

describe("link codes", () => {
  const title = { version: 1, lines: [{ text: "hello", texture: "grass", hue: 120 }] }

  test("round trip", () => {
    assert.deepEqual(decodeTitle(encodeTitle(title).code), title)
  })

  test("only use characters safe in a url", () => {
    for (let hue = 0; hue < 360; hue++) {
      assert.match(encodeTitle({ version: 1, lines: [{ text: "?>~ÿ", hue }] }).code, /^[A-Za-z0-9_-]+$/)
    }
  })

  test("start with the version and whether the rest is compressed", () => {
    assert.equal(encodeTitle(title).code[0], "C")
    assert.equal(encodeTitle({ version: 10, lines: [{ text: "same" }, { text: "same" }, { text: "same" }, { text: "same" }] }).code[0], "V")
  })

  test("report a newer version instead of rejecting it", () => {
    assert.equal(decodeTitle(encodeTitle({ ...title, version: 31 }).code).version, 31)
  })

  test("refuse a version the first character can't hold", () => {
    assert.throws(() => encodeTitle({ ...title, version: 32 }), /version 32/)
  })

  test("words that share settings open as they were saved", () => {
    const lines = [{ type: "bottom", scaleX: 0.8, words: [{ text: "title", texture: "fired", hue: 10, customBorder: true }, { text: "generator", texture: "fired", hue: 20, customBorder: true }] }, { words: [{ text: "one", texture: "ice" }] }]
    assert.deepEqual(decodeTitle(encodeTitle({ version: 1, lines }).code).lines, lines)
  })

  test("a twist anchor on a line stays on the line", () => {
    const lines = [{ twistRibbonAnchor: "left", words: [{ text: "a", texture: "ice" }, { text: "b", texture: "ice" }] }]
    assert.deepEqual(decodeTitle(encodeTitle({ version: 1, lines }).code).lines, lines)
  })

  test("only compress when it is shorter", () => {
    const lines = Array.from({ length: 6 }, () => ({ text: "repeated", texture: "cracked", overlays: [{ overlay: "highlights_top", opacity: 50 }] }))
    assert.ok(encodeTitle({ version: 1, lines }).code.length < 1 + Math.ceil(writeLines(lines).length * 4 / 3))
    assert.deepEqual(decodeTitle(encodeTitle({ version: 1, lines }).code).lines, lines)
  })

  test("stay short for the generator logo", () => {
    const logo = fixtures.find(fixture => fixture.name === "the generator logo")
    assert.ok(encodeTitle({ version: 1, lines: logo.lines }).code.length <= 110)
  })
})

describe("damaged links", () => {
  const { code } = encodeTitle({ version: 1, lines: fixtures.find(fixture => fixture.name === "the generator logo").lines })

  test("every cut off length is rejected", () => {
    const bytes = writeLines(decodeTitle(code).lines)
    for (let length = 0; length < bytes.length; length++) {
      assert.throws(() => readLines(bytes.subarray(0, length)))
    }
  })

  test("extra data is rejected", () => {
    assert.throws(() => readLines(new Uint8Array(Array.from(writeLines([{}])).concat(0))))
  })

  test("an unknown setting id is rejected", () => {
    assert.throws(() => readLines(new Uint8Array([1, 1, 254, 127])))
  })

  test("an unknown choice is rejected", () => {
    assert.throws(() => readLines(new Uint8Array([1, 1, 6, 99])))
  })

  test("broken text is rejected", () => {
    assert.throws(() => readLines(new Uint8Array([1, 1, 2, 1, 255])))
  })

  test("an endless number is rejected", () => {
    assert.throws(() => readLines(new Uint8Array(Array(20).fill(255))))
  })

  for (const [name, bad] of Object.entries({ "nothing": "", "no version": "!abc", "bad characters": "1!!!!", "only a version": "1" })) {
    test(`${name} gives the damaged message`, () => {
      assert.throws(() => decodeTitle(bad), { message: "it is incomplete or damaged" })
    })
  }
})

describe("names in links", () => {
  test("any font is stored compactly by its id", () => {
    const list = JSON.parse(fs.readFileSync(new URL("../public/font/fonts.json", import.meta.url), "utf8"))
    for (const id of list.flatMap(({ variants, ...font }) => [font].concat(variants ?? [])).map(entry => entry.id).concat("a-font-added-later")) {
      assert.ok(isCompact("font", id), id)
      assert.equal(roundTrip([{ font: id }])[0].font, id)
    }
  })

  test("names of every length round trip", () => {
    for (const name of ["", "a", "ab", "abc", "abcd", "story_mode", "1.21.4", "26.4-snapshot-7", "cracked_polished_blackstone_bricks", "..--__99zz"]) {
      for (const key of ["texture", "textureVariant", "tileable", "tileableVariant", "minecraftTexture", "minecraftVersion"]) assert.equal(roundTrip([{ [key]: name }])[0][key], name)
      assert.equal(roundTrip([{ overlays: [{ overlay: name }] }])[0].overlays[0].overlay, name)
    }
  })

  test("names are packed into fewer bytes than their letters", () => {
    assert.equal(writeLines([{ font: "minecraft-legends" }]).length, 3 + 1 + 12)
  })

  test("shapes are stored by their id", () => {
    for (const id of ["cube", "minecraft-ten-blank", "dungeons-skull"]) assert.equal(roundTrip([{ shape: id }])[0].shape, id)
  })

  test("a name with other characters still round trips", () => {
    assert.equal(roundTrip([{ texture: "Fancy Name" }])[0].texture, "Fancy Name")
  })
})

describe("text in links", () => {
  test("every kind of text round trips", () => {
    for (const text of ["", "a", "MINECRAFT", "update text here", "John doe's", "{ dungeons }", "java & bedrock", "minecrAft", "kalmax0328's", "\u{1F333}", "café", "\u{1F633}£€@"]) assert.equal(roundTrip([{ text }])[0].text, text)
  })

  test("links store text in lowercase, like the text box", () => {
    const lines = [{ text: "MINECRAFT" }, { words: [{ text: "Title" }, { text: "minecrAft" }] }]
    assert.deepEqual(decodeTitle(encodeTitle({ version: 1, lines }).code).lines, [{ text: "minecraft" }, { words: [{ text: "title" }, { text: "minecraft" }] }])
  })

  test("letters and digits pack smaller than punctuation", () => {
    assert.ok(writeLines([{ text: "java edition" }]).length < writeLines([{ text: "java.edition" }]).length)
    assert.ok(writeLines([{ text: "java.edition" }]).length < writeLines([{ text: "javaéedition" }]).length)
  })

  test("text the characters can't cover is stored as it is", () => {
    assert.equal(writeLines([{ text: "\u{1F333}" }]).length, 3 + 1 + 4)
  })
})

describe("uploads in links", () => {
  test("a custom texture is left out and counted", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ text: "a", textureSource: "custom", customTexture: "data:image/png;base64,AAAA", customTextureMode: "tileable", tileableScale: 3 }] })
    assert.equal(skipped, 1)
    assert.deepEqual(decodeTitle(code).lines, [{ text: "a", tileableScale: 3 }])
  })

  test("a custom font is left out, so the link opens in the default font", () => {
    const { code, skipped } = encodeTitle({ version: 1, lines: [{ text: "a", font: "custom-abc", customFont: { kind: "ascii", data: "data:image/png;base64,AAAA" }, depth: 30 }] })
    assert.equal(skipped, 1)
    assert.deepEqual(decodeTitle(code).lines, [{ text: "a", depth: 30 }])
  })
})
