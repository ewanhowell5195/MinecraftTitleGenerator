<script setup>
  import { ref } from "vue"
  import Icon from "../components/Icon.vue"
  import MinecraftDownload from "./MinecraftDownload.vue"
  import VersionDialog from "./VersionDialog.vue"

  defineProps({
    version: { type: String, default: null }
  })

  const emit = defineEmits(["pick"])

  const choosing = ref(false)

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
  <MinecraftDownload />
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
</style>
