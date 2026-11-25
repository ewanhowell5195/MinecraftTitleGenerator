<script setup>
  import { computed, inject } from "vue"
  import { checkControls } from "#lib/panels/controls.js"
  import { host } from "#lib/panels/host.js"
  import Button from "#c/Button.vue"
  import Checkbox from "#c/Checkbox.vue"
  import ColourPicker from "#c/ColourPicker.vue"
  import Dropdown from "#c/Dropdown.vue"
  import Field from "#c/Field.vue"
  import Notice from "#c/Notice.vue"
  import NumberInput from "#c/NumberInput.vue"
  import Segments from "#c/Segments.vue"
  import Slider from "#c/Slider.vue"
  import Toggle from "#c/Toggle.vue"
  import UploadReuse from "#c/UploadReuse.vue"
  import GradientEditor from "../GradientEditor.vue"
  import MinecraftDownload from "../MinecraftDownload.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import DataGroup from "./DataGroup.vue"
  import DataPair from "./DataPair.vue"
  import DataPicker from "./DataPicker.vue"
  import DataRows from "./DataRows.vue"
  import DataTiles from "./DataTiles.vue"
  import DataUpload from "./DataUpload.vue"
  import { BLOCKS } from "./blocks.js"

  const props = defineProps({
    panel: { type: Object, required: true },
    state: { type: Object, required: true },
    controls: { type: [Array, Function], required: true }
  })

  const blocks = inject(BLOCKS, {})
  const { change, context, isShown, resolved, valueOf } = props.state

  const drawn = computed(() => {
    const controls = resolved(props.controls)
    checkControls(props.panel.id, controls, blocks)
    return controls
  })

  function press(control) {
    if (control.guide === "centre") host.guide?.(props.panel.id, context.word)
  }

  function setNumber(control, event) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= control.min) change(control, value)
    else event.target.value = valueOf(control)
  }
</script>

<template>
  <template v-for="(control, index) of drawn" :key="control.id ?? index">
    <template v-if="isShown(control)">
      <p v-if="control.type === 'hint'" class="hint" :class="{ bad: resolved(control.bad) }">{{ resolved(control.text) }}</p>
      <div v-else-if="control.type === 'heading' && control.reset" class="row">
        <h3 class="grow">{{ resolved(control.text) }}</h3>
        <Button ghost v-if="resolved(control.modified)" @click="control.reset(context)">Reset</Button>
      </div>
      <h3 v-else-if="control.type === 'heading'">{{ resolved(control.text) }}</h3>
      <Notice v-else-if="control.type === 'notice'">{{ resolved(control.text) }}</Notice>
      <Slider v-else-if="control.type === 'slider'" :label="control.label" :model-value="valueOf(control)" @update:model-value="change(control, $event)" :min="resolved(control.min)" :max="resolved(control.max)" :typed-min="resolved(control.typedMin)" :typed-max="resolved(control.typedMax)" :step="control.step" :steps="control.steps" :log="control.log" :hint="resolved(control.hint)" @pointerdown="press(control)" @change="control.done?.(context)" />
      <Checkbox v-else-if="control.type === 'toggle' && control.check" :label="control.label" :hint="resolved(control.hint)" :model-value="!!valueOf(control)" @update:model-value="change(control, $event)" />
      <Toggle v-else-if="control.type === 'toggle'" :class="{ wide: control.wide }" :label="control.label" :hint="resolved(control.hint)" :model-value="!!valueOf(control)" @update:model-value="change(control, $event)" />
      <Segments v-else-if="control.type === 'segments'" :label="control.label" :hint="resolved(control.hint)" :radio="control.radio" :options="resolved(control.options)" :model-value="valueOf(control)" @update:model-value="change(control, $event)" />
      <Dropdown v-else-if="control.type === 'dropdown'" :class="{ grow: control.grow }" :label="control.label" :searchable="control.searchable" :options="resolved(control.options)" :model-value="valueOf(control)" @update:model-value="change(control, $event)" v-tooltip="control.tooltip" />
      <Field v-else-if="control.type === 'colour' && control.label" group :label="control.label">
        <ColourPicker :model-value="valueOf(control)" @update:model-value="change(control, $event)" />
      </Field>
      <ColourPicker v-else-if="control.type === 'colour'" :class="{ grow: control.grow }" :model-value="valueOf(control)" @update:model-value="change(control, $event)" />
      <div v-else-if="control.type === 'colours'" class="colours">
        <ColourPicker v-for="(colour, at) of resolved(control.items)" :key="at" :model-value="colour.value" @update:model-value="colour.write" />
      </div>
      <GradientEditor v-else-if="control.type === 'gradient'" :key="control.perObject ? context.object.id : 0" :model-value="valueOf(control)" @update:model-value="change(control, $event)" :smooth="resolved(control.smooth)" :mix="resolved(control.mix)" :angle="resolved(control.angle)" :min="control.min" />
      <Field v-else-if="control.type === 'button' && control.hint" group :hint="control.hint">
        <Button wide :icon="control.icon" :disabled="resolved(control.disabled)" @click="control.press(context)"><span>{{ control.label }}</span></Button>
      </Field>
      <Button v-else-if="control.type === 'button' && control.icon" wide :primary="control.primary" :big="control.big" :icon="control.icon" :icon-size="control.big ? 20 : 16" :disabled="resolved(control.disabled)" @click="control.press(context)"><span>{{ control.label }}</span></Button>
      <Button v-else-if="control.type === 'button'" :wide="!control.narrow" :class="{ narrow: control.narrow }" v-tooltip="control.tooltip" @click="control.press(context)">{{ control.label }}</Button>
      <Field v-else-if="control.type === 'number'" :label="control.label">
        <NumberInput :min="control.min" :value="valueOf(control)" :disabled="resolved(control.disabled)" @change="setNumber(control, $event)" />
      </Field>
      <DataPair v-else-if="control.type === 'pair'" :control="control" />
      <div v-else-if="control.type === 'search' && control.browse" class="row">
        <input v-if="!resolved(control.hidden)" type="text" v-model="context.state.search.value" :placeholder="resolved(control.placeholder)" :aria-label="resolved(control.placeholder)" spellcheck="false">
        <div v-else class="grow"></div>
        <Button icon="rows" :title="control.browse.title" @click="control.browse.open(context)" />
      </div>
      <input v-else-if="control.type === 'search'" type="text" v-model="context.state.search.value" :placeholder="resolved(control.placeholder)" :aria-label="resolved(control.placeholder)">
      <DataTiles v-else-if="control.type === 'tiles'" :control="control" :state="state" />
      <DataRows v-else-if="control.type === 'layerRows'" :control="control" :state="state" />
      <DataUpload v-else-if="control.type === 'upload'" :control="control" :state="state" />
      <UploadReuse v-else-if="control.type === 'reuse'" :items="resolved(control.items)" @pick="control.pick($event, context)" />
      <MinecraftVersionField v-else-if="control.type === 'version'" :version="valueOf(control)" @pick="change(control, $event)" />
      <MinecraftDownload v-else-if="control.type === 'download'" />
      <DataPicker v-else-if="control.type === 'picker'" :panel="panel" :state="state" :control="control" />
      <DataGroup v-else-if="control.type === 'group'" :panel="panel" :state="state" :control="control" />
      <Field v-else-if="control.type === 'field'" group :label="resolved(control.label)">
        <DataControls :panel="panel" :state="state" :controls="control.controls" />
      </Field>
      <component v-else-if="control.type === 'block'" :is="blocks[control.name]" :panel="panel" :context="context" />
      <div v-else-if="control.type === 'row' || control.type === 'stack'" :class="control.grid ? 'columns' : control.type">
        <DataControls :panel="panel" :state="state" :controls="control.controls" />
      </div>
    </template>
  </template>
</template>

<style scoped>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .narrow {
    align-self: flex-start;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .colours {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
</style>
