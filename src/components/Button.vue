<script setup>
  import { computed, ref, useSlots } from "vue"
  import { vFileDrop } from "../lib/fileDrop.js"
  import Icon from "./Icon.vue"

  const props = defineProps({
    to: { type: [String, Object], default: null },
    href: { type: String, default: null },
    file: { type: Boolean, default: false },
    accept: { type: String, default: null },
    multiple: { type: Boolean, default: false },
    type: { type: String, default: "button" },
    disabled: { type: Boolean, default: false },
    primary: { type: Boolean, default: false },
    blue: { type: Boolean, default: false },
    danger: { type: Boolean, default: false },
    ghost: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
    big: { type: Boolean, default: false },
    wide: { type: Boolean, default: false },
    icon: { type: String, default: null },
    iconSize: { type: Number, default: 16 },
    title: { type: String, default: null }
  })

  const emit = defineEmits(["change"])

  const slots = useSlots()
  const element = ref(null)

  defineExpose({ focus: () => (element.value?.$el ?? element.value)?.focus() })

  const classes = computed(() => ({
    primary: props.primary,
    blue: props.blue,
    danger: props.danger,
    ghost: props.ghost,
    active: props.active,
    big: props.big,
    wide: props.wide,
    disabled: props.disabled,
    "icon-only": !slots.default
  }))
</script>

<template>
  <RouterLink v-if="to && !disabled" ref="element" class="button" :class="classes" :to="to" v-tooltip="title" :aria-label="title"><slot name="icon"><Icon v-if="icon" :name="icon" :size="iconSize" /></slot><slot></slot></RouterLink>
  <a v-else-if="to || href" ref="element" class="button" :class="classes" :href="disabled ? null : href" :aria-disabled="disabled || null" v-tooltip="title" :aria-label="title"><slot name="icon"><Icon v-if="icon" :name="icon" :size="iconSize" /></slot><slot></slot></a>
  <label v-else-if="file" ref="element" v-file-drop class="button" :class="classes" v-tooltip="title"><slot name="icon"><Icon v-if="icon" :name="icon" :size="iconSize" /></slot><slot></slot><input type="file" :accept="accept" :multiple="multiple" :disabled="disabled" :aria-label="title" @change="emit('change', $event)"></label>
  <button v-else ref="element" class="button" :class="classes" :type="type" :disabled="disabled" v-tooltip="title" :aria-label="title"><slot name="icon"><Icon v-if="icon" :name="icon" :size="iconSize" /></slot><slot></slot></button>
</template>
