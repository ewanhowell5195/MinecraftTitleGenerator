<script setup>
  import { computed, onMounted } from "vue"
  import { refreshAccount, refreshUsage } from "../lib/community.js"
  import { replaceTargets } from "../lib/presets.js"
  import Dropdown from "./Dropdown.vue"
  import Notice from "./Notice.vue"

  const props = defineProps({
    code: { type: String, required: true },
    label: { type: String, required: true }
  })

  const target = defineModel({ default: null })

  const options = computed(() => [{ value: null, label: "New preset" }].concat(replaceTargets(props.code).map(item => ({ value: item.code, label: item.name, hint: item.shared ? "Shared" : "", target: item }))))
  const chosen = computed({
    get: () => target.value?.code ?? null,
    set: value => target.value = options.value.find(option => option.value === value).target ?? null
  })

  onMounted(() => {
    refreshAccount()
    refreshUsage()
  })
</script>

<template>
  <div class="replace">
    <Dropdown v-if="options.length > 1" :label="label" searchable :options="options" v-model="chosen" />
    <Notice v-if="target?.online">This also replaces the shared version in Community, at the same link. Its votes, rating and uses are reset, and that cannot be undone.</Notice>
    <p v-else-if="target?.shared" class="note">This browser can't manage the shared version, so it will stay in Community as it is.</p>
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

  .note {
    color: var(--muted);
  }
</style>
