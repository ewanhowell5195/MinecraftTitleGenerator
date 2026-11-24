<script setup>
  import { ALIGNS, useCustomTexture } from "../../lib/panels/customTexture.js"
  import { readImage } from "../../lib/state/imageFiles.js"
  import Checkbox from "../../components/Checkbox.vue"
  import Segments from "../../components/Segments.vue"
  import Slider from "../../components/Slider.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const { coverX, coverY, fitsFont, font, modeHint, modes, object, overflow, pickCustom, reusable, reuse, sharing } = useCustomTexture(props.context)
</script>

<template>
  <UploadField accept="image/*" :label="object.customTexture ? 'Replace texture' : 'Choose an image'" empty="No texture uploaded" :image="object.customTexture" :clearable="!!object.customTexture" :back="reusable.length > 0" @change="readImage($event, pickCustom)" @clear="object.customTexture = null" />
  <template v-if="object.customTexture">
    <Segments label="Use as" :options="modes" v-model="object.customTextureMode" />
    <p class="hint" :class="{ bad: object.customTextureMode === 'standard' && !fitsFont }">{{ modeHint }}</p>
    <Checkbox v-if="object.customTextureMode === 'strip'" v-model="object.customStripPerCharacter" label="Restart on each character" hint="Starts the strip again from the left of every character, instead of running it along the whole line." />
    <template v-if="object.customTextureMode === 'cover'">
      <Segments label="Align to" :options="ALIGNS" v-model="object.customCoverAlign" />
      <Checkbox v-if="sharing" v-model="object.customCoverSpan" label="Span with other lines using this image" />
      <Slider v-if="overflow !== 'y' && overflow !== 'none'" label="Horizontal position" v-model="coverX" :min="0" :max="100" />
      <Slider v-if="overflow !== 'x' && overflow !== 'none'" label="Vertical position" v-model="coverY" :min="0" :max="100" />
    </template>
  </template>
  <p v-else-if="font?.mesh" class="hint">An image is tiled across the letters, or you can use it as a strip or stretch it over the line.</p>
  <p v-else class="hint">An image the shape of this font's flat texture is painted onto the letters. Anything else is tiled, or you can use it as a strip or stretch it over the line.</p>
  <UploadReuse :items="reusable" @pick="reuse" />
</template>
