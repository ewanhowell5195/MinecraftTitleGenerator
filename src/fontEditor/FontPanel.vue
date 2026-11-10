<script setup>
  import { computed, onMounted, ref, shallowRef } from "vue"
  import Button from "../components/Button.vue"
  import Dropdown from "../components/Dropdown.vue"
  import Icon from "../components/Icon.vue"
  import NumberInput from "../components/NumberInput.vue"
  import { fullName, loadFontList } from "../lib/font.js"
  import { DEFAULT_BORDER, DEFAULT_DEPTH, DEFAULT_SPACE_WIDTH, autoStretch, lostPixels, resizeFont, setSquareSize, slug, squareSizeLoss, squaresOf } from "../lib/fontEditor.js"
  import { fontThumbnail } from "../lib/ui.js"
  import { font, update } from "./store.js"

  const ABOUT = [
    { key: "name", label: "Name", required: true, hint: "Shown in the font list and the credits." },
    { key: "id", label: "ID", required: true, slug: true, hint: "Lowercase letters, numbers and dashes. Made from the name until you change it." },
    { key: "author", label: "Author", required: true, hint: "Who made the font, shown in the credits." },
    { key: "basedOn", label: "Based on font", choice: true, hint: "The font yours was made from, so its author is credited too." },
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
    { key: "overlay", label: "Forced overlay", hint: "Draws an overlay.png over the letters on every texture except premade sheets. This editor doesn't make that file: you add it to the font's folder yourself, on the same layout as the font's flat.png." }
  ]

  const warning = ref(null)
  const published = shallowRef([])

  const basedOnOptions = computed(() => {
    const own = font.value.id || slug(font.value.name)
    const fonts = published.value.filter(entry => entry.id !== own).map(entry => ({ value: entry.id, label: fullName(entry, published.value), image: fontThumbnail(published.value, entry.id) })).sort((a, b) => a.label.localeCompare(b.label))
    const current = font.value.basedOn && !fonts.some(option => option.value === font.value.basedOn) ? [{ value: font.value.basedOn, label: font.value.basedOn, hint: "Not a published font" }] : []
    return [{ value: "", label: "None" }].concat(current, fonts)
  })
  const previewId = computed(() => font.value.id || slug(font.value.name) || "my-font")
  const finalSize = computed(() => `${font.value.height * font.value.density} pixels tall and ${font.value.width * font.value.density} wide`)
  const clashes = computed(() => {
    const name = font.value.name.trim().toLowerCase()
    const id = font.value.id || slug(font.value.name)
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
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= minimum) setField(key, value)
    else if (event.type === "change") event.target.value = font.value[key]
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
    const value = event.target.valueAsNumber
    const pixels = value * font.value.grid
    const shown = squaresOf(font.value, font.value[key])
    if (!Number.isInteger(pixels) || pixels < 1) {
      if (event.type === "change") event.target.value = shown
      return
    }
    if (pixels === font.value[key]) return
    applyOrWarn(event, shown, lostPixels(font.value, { [key]: pixels }), `Changing ${key === "height" ? "the height" : "the default width"} to ${value}`, () => update(resizeFont(font.value, { [key]: pixels }), `font.${key}`))
  }

  function setSquare(event) {
    const value = event.target.valueAsNumber
    if (!Number.isInteger(value) || value < 1) {
      if (event.type === "change") event.target.value = font.value.grid
      return
    }
    if (value === font.value.grid) return
    applyOrWarn(event, font.value.grid, squareSizeLoss(font.value, value), `Changing the square size to ${value}`, () => update(setSquareSize(font.value, value), "font.grid"))
  }

  function confirmResize() {
    warning.value.apply()
    warning.value = null
  }

  function markAll() {
    update(autoStretch(font.value))
  }
</script>

<template>
  <div class="settings">
    <section class="flow">
      <h3>About</h3>
      <div class="about">
        <component :is="item.choice ? 'div' : 'label'" v-for="item of ABOUT" :key="item.key" class="field" :class="{ full: item.full }">
          <span class="label-row"><span class="label">{{ item.label }}</span><span class="tag" :class="{ required: item.required }">{{ item.required ? "Required" : "Optional" }}</span></span>
          <Dropdown v-if="item.choice" searchable :options="basedOnOptions" :model-value="font[item.key]" @update:model-value="setField(item.key, $event, false)" />
          <input v-else-if="item.slug" type="text" :class="{ clashing: clashes[item.key] }" :value="font[item.key]" :placeholder="item.key === 'id' ? previewId : item.placeholder" spellcheck="false" @change="setField(item.key, slug($event.target.value), false)">
          <input v-else type="text" :class="{ clashing: clashes[item.key] }" :value="font[item.key]" @input="setText(item.key, $event)">
          <small v-if="clashes[item.key]" class="hint bad">{{ clashes[item.key] }}</small>
          <small class="hint">{{ item.hint }}</small>
        </component>
      </div>
    </section>

    <section class="flow">
      <h3>Size</h3>
      <div class="numbers">
        <label class="field"><span class="label">Height</span><NumberInput min="1" :value="squaresOf(font, font.height)" @input="setSize('height', $event)" @change="setSize('height', $event)" /></label>
        <label class="field"><span class="label">Default width</span><NumberInput min="1" :value="squaresOf(font, font.width)" @input="setSize('width', $event)" @change="setSize('width', $event)" /></label>
        <label class="field"><span class="label">Square size</span><NumberInput min="1" :value="font.grid" @input="setSquare" @change="setSquare" /></label>
      </div>
      <p class="hint">Height and width count squares, and one click paints one square. Square size is how many pixels each square is. Each character is {{ finalSize }}.</p>
      <div v-if="warning" class="warning">
        <p>{{ warning.text }} changes {{ warning.lost }} drawn {{ warning.lost === 1 ? "pixel" : "pixels" }}.</p>
        <div class="row">
          <Button @click="warning = null">Cancel</Button>
          <Button danger @click="confirmResize">Change anyway</Button>
        </div>
      </div>
    </section>

    <section class="flow">
      <h3>Spacing and shape</h3>
      <p class="hint">These are in pixels, not squares.</p>
      <div class="numbers">
        <div v-for="item of SPACING" :key="item.key" class="field">
          <label class="label" :for="`font-${item.key}`">{{ item.label }}</label>
          <div class="resettable">
            <NumberInput :id="`font-${item.key}`" :min="item.min" :value="font[item.key]" @input="setNumber(item.key, $event, item.min ?? -1000)" @change="setNumber(item.key, $event, item.min ?? -1000)" />
            <Button ghost v-if="font[item.key] !== item.fallback" v-tooltip="`Reset to ${item.fallback}`" :aria-label="`Reset ${item.label.toLowerCase()} to ${item.fallback}`" @click="setField(item.key, item.fallback, false)"><template #icon><Icon name="reset" :size="14" /></template></Button>
          </div>
        </div>
      </div>
    </section>

    <section class="flow">
      <h3>Options</h3>
      <div v-for="flag of FLAGS" :key="flag.key" class="option">
        <label class="check">
          <input type="checkbox" :checked="font[flag.key]" @change="setField(flag.key, $event.target.checked, false)">
          <span class="check-text"><span class="check-label">{{ flag.label }}</span><small class="hint">{{ flag.hint }}</small></span>
        </label>
        <div v-if="flag.key === 'terminatorSpace' && font.terminatorSpace" class="field nested">
          <label class="label" for="font-terminatorSpaceWidth">Terminator space width</label>
          <NumberInput id="font-terminatorSpaceWidth" min="0" :value="font.defineSpace ? '' : font.terminatorSpaceWidth ?? ''" :placeholder="font.defineSpace ? '' : String(font.spaceWidth)" :disabled="font.defineSpace" @input="setTerminatorWidth" @change="setTerminatorWidth" />
          <small class="hint">{{ font.defineSpace ? "Your font draws its own space character, which is always used beside the terminators." : `In pixels. Leave empty to use the normal space width of ${font.spaceWidth}.` }}</small>
        </div>
      </div>
    </section>

    <section class="flow">
      <h3>Stretch zones</h3>
      <p class="hint">Marks the stretch zones of every character automatically, replacing the ones marked now. Each character can still be changed on the Characters tab.</p>
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

  .label-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .tag {
    font-size: var(--font-xs);
    color: var(--faint);
  }

  .tag.required {
    color: var(--accent);
  }

  input.clashing {
    border-color: var(--danger);
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .numbers .number-input {
    width: 100%;
  }

  .resettable {
    position: relative;
  }

  .resettable :deep(input) {
    padding-right: 60px;
  }

  .resettable .icon-only {
    position: absolute;
    top: 0;
    right: 21px;
  }

  .warning {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    font-size: var(--font-md);
    background: var(--card);
    border-left: 3px solid var(--danger);
  }

  .warning p {
    margin: 0;
  }

  .option {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .check {
    display: flex;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .check-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .check-label {
    font-size: var(--font-md);
    font-weight: 600;
  }

  .nested {
    margin-left: 26px;
  }

  .nested input {
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
