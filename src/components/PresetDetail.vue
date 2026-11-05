<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import { NAME_LIMIT } from "../lib/presets.js"
  import { presetLink } from "../lib/presetsPage.js"
  import Icon from "./Icon.vue"
  import PresetRating from "./PresetRating.vue"
  import TitlePicture from "./TitlePicture.vue"

  const props = defineProps({
    preset: { type: Object, required: true },
    local: { type: Boolean, default: false },
    mine: { type: Boolean, default: false },
    saved: { type: Boolean, default: false }
  })

  const COPY_MESSAGE_TIME = 2000

  const emit = defineEmits(["close", "open", "save", "vote", "rename", "remove", "share", "view"])

  const renaming = ref(false)
  const copyMessage = ref("")
  let copying = null

  const vSelected = {
    mounted(field) {
      field.focus()
      field.select()
    }
  }

  const uses = computed(() => {
    const { downloads, week } = props.preset
    if (!downloads) return "Not used yet"
    const total = `${downloads} ${downloads === 1 ? "use" : "uses"} in total`
    return week === undefined ? total : `${total}, ${week || "none"} in the last 7 days`
  })
  const sharedOn = computed(() => new Date(props.preset.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }))

  function finishRenaming(event) {
    if (!renaming.value) return
    renaming.value = false
    emit("rename", event.target.value)
  }

  function showCopyMessage(text) {
    copyMessage.value = text
    clearTimeout(copying)
    copying = setTimeout(() => copyMessage.value = "", COPY_MESSAGE_TIME)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(presetLink(props.preset.id))
      showCopyMessage("Link copied")
    } catch (err) {
      console.error(err)
      showCopyMessage("Could not copy")
    }
  }

  watch(() => props.preset.code, () => {
    renaming.value = false
    copyMessage.value = ""
    clearTimeout(copying)
  })

  onBeforeUnmount(() => clearTimeout(copying))
</script>

<template>
  <aside class="detail">
    <header>
      <button class="icon-button" title="Close this preset" aria-label="Close this preset" @click="emit('close')"><Icon name="close" :size="18" /></button>
    </header>
    <div class="scroll">
      <TitlePicture :code="preset.code" large />
      <div class="heading">
        <input v-if="renaming" v-selected class="name-field" type="text" :value="preset.name" :maxlength="NAME_LIMIT" :aria-label="`Name of ${preset.name}`" spellcheck="false" @blur="finishRenaming" @keydown.enter="$event.target.blur()" @keydown.esc.stop="renaming = false">
        <h2 v-else :title="preset.name">{{ preset.name }}</h2>
        <button v-if="local && !renaming" class="icon-button small" :title="`Rename ${preset.name}`" :aria-label="`Rename ${preset.name}`" @click="renaming = true"><Icon name="pencil" :size="14" /></button>
        <span v-if="local && preset.shared" class="yours">Shared publicly</span>
        <span v-else-if="mine" class="yours">Shared by you</span>
      </div>
      <template v-if="!local">
        <PresetRating :rating="preset.rating" :votes="preset.votes" :mine="preset.vote" :own="mine" large @vote="emit('vote', $event)" />
        <p class="facts"><span>{{ uses }}</span><span>Shared {{ sharedOn }}</span></p>
      </template>
      <div class="actions">
        <button class="primary" @click="emit('open')">Open in editor</button>
        <template v-if="local">
          <button v-if="!preset.shared" @click="emit('share')"><Icon name="share" :size="16" /><span>Share publicly</span></button>
          <button v-else @click="emit('view')"><Icon name="open" :size="16" /><span>View in Community</span></button>
          <button class="danger" @click="emit('remove')"><Icon name="trash" :size="16" /><span>Delete</span></button>
        </template>
        <template v-else>
          <button v-if="!mine" :disabled="saved" @click="emit('save')"><Icon name="bookmark" :size="16" /><span>{{ saved ? "In My presets" : "Save to My presets" }}</span></button>
          <button @click="copyLink"><Icon name="share" :size="16" /><span>{{ copyMessage || "Copy link" }}</span></button>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
  .detail {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--surface);
    border-left: 1px solid var(--line);
  }

  header {
    display: none;
  }

  .scroll {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    padding: 20px 20px 24px;
    overflow-y: auto;
  }

  .heading {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 38px;
  }

  h2 {
    margin: 0;
    overflow: hidden;
    font-size: var(--font-xl);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name-field {
    flex: 1;
    min-width: 0;
    font-size: var(--font-lg);
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: var(--font-md);
  }

  .yours {
    flex: none;
    margin-left: auto;
    padding-left: 8px;
    font-size: var(--font-md);
    color: var(--accent);
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions button {
    display: flex;
    flex: 1 1 180px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    user-select: none;
  }

  .danger {
    color: var(--danger);
  }

  @media (max-width: 800px) {
    .detail {
      border-left: none;
    }

    header {
      flex: none;
      display: flex;
      justify-content: flex-end;
      padding: 8px 8px 0;
    }

    .scroll {
      padding-top: 4px;
    }
  }
</style>
