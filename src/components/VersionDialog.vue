<script setup>
  import { computed, onMounted, ref } from "vue"
  import { listVersions } from "../lib/minecraft.js"
  import Badge from "./Badge.vue"
  import Notice from "./Notice.vue"
  import RenderDialog from "./RenderDialog.vue"
  import Segments from "./Segments.vue"

  const KINDS = [{ value: "release", label: "Releases" }, { value: "snapshot", label: "Snapshots" }]
  const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })

  const props = defineProps({
    current: { type: String, default: null }
  })

  const emit = defineEmits(["pick", "close"])

  const versions = ref([])
  const latest = ref({})
  const error = ref("")
  const query = ref("")
  const kind = ref("release")

  const shown = computed(() => {
    const term = query.value.trim().toLowerCase()
    return versions.value.filter(version => version.type === kind.value && version.id.toLowerCase().includes(term))
  })

  function date(version) {
    return DATE.format(new Date(version.releaseTime))
  }

  onMounted(async () => {
    try {
      const listed = await listVersions()
      versions.value = listed.versions
      latest.value = listed.latest
      if (listed.versions.find(version => version.id === props.current)?.type === "snapshot") kind.value = "snapshot"
    } catch (err) {
      error.value = `Could not load the Minecraft versions: ${err.message}`
    }
  })
</script>

<template>
  <RenderDialog title="Minecraft version" close-title="Close" dismissable @close="emit('close')">
    <div class="body">
      <Segments :options="KINDS" v-model="kind" />
      <input type="text" v-model="query" placeholder="Search versions" aria-label="Search versions" spellcheck="false">
      <Notice v-if="error">{{ error }}</Notice>
      <p v-else-if="!versions.length" class="message empty-state">Loading versions</p>
      <p v-else-if="!shown.length" class="message empty-state">No versions match</p>
      <div v-else class="list">
        <button v-for="version of shown" :key="version.id" class="version card card-row" :class="{ selected: version.id === current }" @click="emit('pick', version.id)">
          <span class="id">{{ version.id }}</span>
          <Badge v-if="version.id === latest.release || version.id === latest.snapshot">Latest</Badge>
          <span class="date">{{ date(version) }}</span>
        </button>
      </div>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 20px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: min(50vh, 420px);
    overflow-y: auto;
  }

  .version {
    flex: none;
    justify-content: flex-start;
    width: 100%;
    font-size: var(--font-md);
    font-weight: 500;
  }

  .date {
    margin-left: auto;
    font-size: var(--font-sm);
    font-weight: 400;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .message {
    height: min(50vh, 420px);
    margin: 0;
    padding: 8px 2px;
  }
</style>
