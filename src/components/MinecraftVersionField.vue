<script setup>
  import { computed, ref } from "vue"
  import { jar } from "../lib/minecraft.js"
  import Icon from "./Icon.vue"
  import ProgressBar from "./ProgressBar.vue"
  import VersionDialog from "./VersionDialog.vue"

  defineProps({
    version: { type: String, default: null }
  })

  const emit = defineEmits(["pick"])

  const choosing = ref(false)
  const progress = computed(() => jar.total ? jar.done / jar.total : 0)

  function pick(version) {
    choosing.value = false
    emit("pick", version)
  }
</script>

<template>
  <button type="button" class="version field-button" :class="{ active: choosing }" v-tooltip="'Choose a Minecraft version'" @click="choosing = true">
    <span>Minecraft {{ version }}</span>
    <Icon class="chevron" name="down" :size="14" />
  </button>
  <div v-if="jar.version" class="download">
    <span>Downloading Minecraft {{ jar.version }}</span>
    <ProgressBar :value="progress" />
  </div>
  <VersionDialog v-if="choosing" :current="version" @pick="pick" @close="choosing = false" />
</template>

<style scoped>
  .version {
    flex: none;
    padding: 0 10px;
  }

  .version .chevron {
    margin-left: auto;
    color: var(--faint);
  }

  .download {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    font-size: var(--font-sm);
    color: var(--muted);
  }
</style>
