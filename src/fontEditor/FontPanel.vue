<script setup>
  import { computed, onMounted, ref, shallowRef, watch } from "vue"
  import Button from "../components/Button.vue"
  import Checkbox from "../components/Checkbox.vue"
  import Dropdown from "../components/Dropdown.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import NameList from "../components/NameList.vue"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import Segments from "../components/Segments.vue"
  import { fullName, loadFontList } from "../lib/font.js"
  import { DEFAULT_BORDER, DEFAULT_DEPTH, DEFAULT_ID, DEFAULT_SPACE_WIDTH, LETTER_CASES, autoStretch, fontId, lostPixels, resizeFont, setSquareSize, slug, squareSizeLoss, squaresOf } from "../lib/fontEditor.js"
  import { fontThumbnail } from "../lib/ui.js"
  import { typedNumber } from "./fields.js"
  import { changeLetterCase, font, update } from "./store.js"

  const ABOUT = [
    { key: "name", label: "Name", required: true, hint: "Shown in the font list and the credits." },
    { key: "id", label: "ID", required: true, slug: true, hint: "Lowercase letters, numbers and dashes. Made from the name until you change it." },
    { key: "authors", label: "Authors", required: true, names: true, hint: "Everyone who worked on the font, shown in the credits. If you're porting someone else's font with their permission, list both yourself and them." },
    { key: "basedOn", label: "Based on font", choice: true, hint: "The font yours was made from, so its authors are credited too." },
    { key: "description", label: "Description", full: true, hint: "A short line shown under the font's name in the generator." }
  ]

  const SPACING = [
    { key: "spaceWidth", label: "Space width", min: 0, fallback: DEFAULT_SPACE_WIDTH },
    { key: "characterSpacing", label: "Letter spacing", min: null, fallback: 0 },
    { key: "depth", label: "Depth", min: 0, fallback: DEFAULT_DEPTH },
    { key: "border", label: "Border", min: 0, fallback: DEFAULT_BORDER }
  ]

  const FLAGS = [
    { key: "terminatorSpace", label: "Space beside terminators", hint: "Leaves a gap between the ┫ ┣ end pieces and the text." },
    { key: "forcedTerminators", label: "Always use terminators", hint: "Every line gets the ┫ ┣ end pieces, and the option to turn them off is hidden." },
    { key: "autoBorder", label: "Automatic border frame", hint: "Draws a filled frame around the whole line, for outline style fonts." },
    { key: "flat", label: "Flat font", hint: "Update Text won't get its usual 30 extra depth." },
    { key: "allFaces", label: "All faces", hint: "Inner and side faces are on by default, with no fade." },
    { key: "overlay", label: "Forced overlay", hint: "Draws an overlay.png over the letters on every texture except premade sheets. This editor doesn't make that file: you add it to the font's folder yourself, on the same layout as the font's flat.png." }
  ]

  const CASE_HINTS = {
    both: "Titles keep the case they're typed in, so every letter needs a capital and a lowercase version.",
    upper: "Titles use one case, drawn with capital letters.",
    lower: "Titles use one case, drawn with lowercase letters."
  }

  const warning = ref(null)
  const published = shallowRef([])

  const basedOnOptions = computed(() => {
    const own = fontId(font.value)
    const fonts = published.value.filter(entry => entry.id !== own).map(entry => ({ value: entry.id, label: fullName(entry, published.value), image: fontThumbnail(published.value, entry.id) })).sort((a, b) => a.label.localeCompare(b.label))
    const current = font.value.basedOn && !fonts.some(option => option.value === font.value.basedOn) ? [{ value: font.value.basedOn, label: font.value.basedOn, hint: "Not a published font" }] : []
    return [{ value: "", label: "None" }].concat(current, fonts)
  })
  const previewId = computed(() => fontId(font.value) || DEFAULT_ID)
  const finalSize = computed(() => `${font.value.height * font.value.density} pixels tall and ${font.value.width * font.value.density} wide`)
  const clashes = computed(() => {
    const name = font.value.name.trim().toLowerCase()
    const id = fontId(font.value)
    const sameName = published.value.find(entry => fullName(entry, published.value).toLowerCase() === name)
    const sameId = published.value.find(entry => entry.id === id)
    return {
      name: sameName ? `${fullName(sameName, published.value)} already uses this name. Pick another so the two aren't mixed up.` : null,
      id: sameId ? `${fullName(sameId, published.value)} already uses this ID, so the generator would treat your font as that one.` : null
    }
  })

  onMounted(async () => {
    published.value = await loadFontList()
  })

  function setField(key, value, group = true) {
    update({ ...font.value, [key]: value }, group ? `font.${key}` : null)
  }

  function setText(key, event) {
    const value = event.target.value
    const followsName = key === "name" && (!font.value.id || font.value.id === slug(font.value.name))
    update({ ...font.value, [key]: value, ...(followsName ? { id: slug(value) } : {}) }, `font.${key}`)
  }

  function setNumber(key, event, minimum) {
    const value = typedNumber(event, font.value[key], typed => Number.isInteger(typed) && typed >= minimum)
    if (value !== null) setField(key, value)
  }

  function setTerminatorWidth(event) {
    if (event.target.value === "") return setField("terminatorSpaceWidth", null)
    setNumber("terminatorSpaceWidth", event, 0)
  }

  function applyOrWarn(event, shown, lost, text, apply) {
    if (!lost) return apply()
    if (event.type !== "change") return
    event.target.value = shown
    warning.value = { text, lost, apply }
  }

  function setSize(key, event) {
    const shown = squaresOf(font.value, font.value[key])
    const value = typedNumber(event, shown, typed => Number.isInteger(typed * font.value.grid) && typed * font.value.grid >= 1)
    if (value === null) return
    const pixels = value * font.value.grid
    if (pixels === font.value[key]) return
    applyOrWarn(event, shown, lostPixels(font.value, { [key]: pixels }), `Changing ${key === "height" ? "the height" : "the default width"} to ${value}`, () => update(resizeFont(font.value, { [key]: pixels }), `font.${key}`))
  }

  function setSquare(event) {
    const value = typedNumber(event, font.value.grid, typed => Number.isInteger(typed) && typed >= 1)
    if (value === null || value === font.value.grid) return
    applyOrWarn(event, font.value.grid, squareSizeLoss(font.value, value), `Changing the square size to ${value}`, () => update(setSquareSize(font.value, value), "font.grid"))
  }

  function confirmResize() {
    warning.value.apply()
    warning.value = null
  }

  function markAll() {
    update(autoStretch(font.value))
  }

  watch(font, () => {
    warning.value = null
  })
</script>

<template>
  <div class="settings">
    <section class="flow">
      <h3>About</h3>
      <div class="about">
        <Field v-for="item of ABOUT" :key="item.key" :label="item.label" :required="item.required" :hint="item.hint" :error="clashes[item.key]" :group="item.choice || item.names" :class="{ full: item.full }">
          <Dropdown v-if="item.choice" searchable :options="basedOnOptions" :model-value="font[item.key]" @update:model-value="setField(item.key, $event, false)" />
          <NameList v-else-if="item.names" :model-value="font[item.key]" @update:model-value="setField(item.key, $event, false)" />
          <input v-else-if="item.slug" type="text" :class="{ clashing: clashes[item.key] }" :value="font[item.key]" :placeholder="previewId" spellcheck="false" @change="setField(item.key, slug($event.target.value), false)">
          <input v-else type="text" :class="{ clashing: clashes[item.key] }" :value="font[item.key]" @input="setText(item.key, $event)">
        </Field>
      </div>
    </section>

    <section class="flow">
      <h3>Size</h3>
      <div class="numbers">
        <Field label="Height"><NumberInput min="1" :value="squaresOf(font, font.height)" @input="setSize('height', $event)" @change="setSize('height', $event)" /></Field>
        <Field label="Default width"><NumberInput min="1" :value="squaresOf(font, font.width)" @input="setSize('width', $event)" @change="setSize('width', $event)" /></Field>
        <Field label="Square size"><NumberInput min="1" :value="font.grid" @input="setSquare" @change="setSquare" /></Field>
      </div>
      <p class="hint">Height and width count squares, and one click paints one square. Square size is how many pixels each square is. Each character is {{ finalSize }}.</p>
      <Notice v-if="warning">
        <p>{{ warning.text }} changes {{ warning.lost }} drawn {{ warning.lost === 1 ? "pixel" : "pixels" }}.</p>
        <div class="row">
          <Button @click="warning = null">Cancel</Button>
          <Button danger @click="confirmResize">Change anyway</Button>
        </div>
      </Notice>
    </section>

    <section class="flow">
      <h3>Letter case</h3>
      <Segments :options="LETTER_CASES" :model-value="font.letterCase" @update:model-value="changeLetterCase" />
      <p class="hint">{{ CASE_HINTS[font.letterCase] }} Switching keeps the letters you hide, so switching back brings them back, but only the letters you can see are downloaded or submitted.</p>
    </section>

    <section class="flow">
      <h3>Spacing and shape</h3>
      <p class="hint">These are in pixels, not squares.</p>
      <div class="numbers">
        <Field v-for="item of SPACING" :key="item.key" group :label="item.label" :label-for="`font-${item.key}`">
          <NumberInput :id="`font-${item.key}`" :min="item.min" :value="font[item.key]" @input="setNumber(item.key, $event, item.min ?? -1000)" @change="setNumber(item.key, $event, item.min ?? -1000)">
            <template v-if="font[item.key] !== item.fallback" #action><Button ghost v-tooltip="`Reset to ${item.fallback}`" :aria-label="`Reset ${item.label.toLowerCase()} to ${item.fallback}`" @click="setField(item.key, item.fallback, false)"><template #icon><Icon name="reset" :size="16" /></template></Button></template>
          </NumberInput>
        </Field>
      </div>
    </section>

    <section class="flow">
      <h3>Options</h3>
      <div v-for="flag of FLAGS" :key="flag.key" class="option">
        <Checkbox :label="flag.label" :hint="flag.hint" :model-value="font[flag.key]" @update:model-value="setField(flag.key, $event, false)" />
        <Field v-if="flag.key === 'terminatorSpace' && font.terminatorSpace" class="nested" label="Terminator space width" :hint="font.defineSpace ? 'Your font draws its own space character, which is always used beside the terminators.' : `In pixels. Leave empty to use the normal space width of ${font.spaceWidth}.`">
          <NumberInput min="0" :value="font.defineSpace ? '' : font.terminatorSpaceWidth ?? ''" :placeholder="font.defineSpace ? '' : String(font.spaceWidth)" :disabled="font.defineSpace" @input="setTerminatorWidth" @change="setTerminatorWidth" />
        </Field>
      </div>
    </section>

    <section class="flow">
      <h3>Stretch zones</h3>
      <p class="hint">Marks the stretch zones of every character automatically, replacing the ones marked now. Each character can still be changed on the Characters tab. Characters left with no marks are marked the same way when you submit the font.</p>
      <Button class="start" @click="markAll"><template #icon><Icon name="wand" :size="14" /></template>Mark every character</Button>
    </section>
  </div>
</template>

<style scoped>
  .about {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 14px;
  }

  .full {
    grid-column: 1 / -1;
  }

  input.clashing {
    border-color: var(--danger);
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .option {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .nested {
    margin-left: 26px;
  }

  .nested .number-input {
    width: 96px;
  }

  .start {
    align-self: flex-start;
  }

  @media (max-width: 520px) {
    .about,
    .numbers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .about > .field {
      grid-column: 1 / -1;
    }
  }
</style>
