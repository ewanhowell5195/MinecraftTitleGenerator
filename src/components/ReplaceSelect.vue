<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import { refreshAccount, refreshUsage, sharedNames } from "../lib/community.js"
  import { replaceTargets, unlinkedShares } from "../lib/presets.js"
  import Dropdown from "./Dropdown.vue"

  const props = defineProps({
    code: { type: String, required: true },
    label: { type: String, required: true }
  })

  const target = defineModel({ default: null })
  const names = ref({})
  const error = ref("")

  const options = computed(() => [{ value: null, label: "New preset" }].concat(replaceTargets(props.code, names.value).map(item => ({ value: item.code ?? item.shared, label: item.name, hint: item.shared ? "Shared" : "", target: item }))))
  const chosen = computed({
    get: () => target.value?.code ?? target.value?.shared ?? null,
    set: value => target.value = options.value.find(option => option.value === value).target ?? null
  })

  async function loadNames(ids) {
    if (!ids) return
    try {
      names.value = await sharedNames(ids.split(",").map(Number))
    } catch (err) {
      console.error(err)
      error.value = `Couldn't load your shared presets: ${err.message}`
    }
  }

  watch(() => unlinkedShares().join(), loadNames, { immediate: true })

  onMounted(() => {
    refreshAccount()
    refreshUsage()
  })
</script>

<template>
  <div class="replace">
    <Dropdown v-if="options.length > 1" :label="label" searchable :options="options" v-model="chosen" />
    <p v-if="target?.online" class="warning">This also replaces the shared version in Community, at the same link. Its votes and rating are reset, and that cannot be undone.</p>
    <p v-else-if="target?.shared" class="note">This browser can't manage the shared version, so it will stay in Community as it is.</p>
    <p v-if="error" class="warning">{{ error }}</p>
  </div>
</template>

<style scoped>
  .replace {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .replace:empty {
    display: none;
  }

  .replace :deep(.label) {
    font-weight: 600;
    color: var(--text);
  }

  p {
    margin: 0;
    font-size: var(--font-md);
  }

  .warning {
    color: var(--danger);
  }

  .note {
    color: var(--muted);
  }
</style>
