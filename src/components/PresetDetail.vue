<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import { NAME_LIMIT } from "../lib/presets.js"
  import { presetLink } from "../lib/presetsPage.js"
  import { providerLabel } from "../lib/providers.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"
  import UserName from "./UserName.vue"
  import PresetRating from "./PresetRating.vue"
  import TitlePicture from "./TitlePicture.vue"

  const props = defineProps({
    preset: { type: Object, required: true },
    local: { type: Boolean, default: false },
    mine: { type: Boolean, default: false },
    owned: { type: Boolean, default: false },
    stats: { type: Object, default: null },
    saved: { type: Boolean, default: false }
  })

  const COPY_MESSAGE_TIME = 2000

  const emit = defineEmits(["close", "open", "save", "vote", "rename", "remove", "share", "view", "user"])

  const renaming = ref(false)
  const copyMessage = ref("")
  let copying = null

  const vSelected = {
    mounted(field) {
      field.focus()
      field.select()
    }
  }

  const figures = computed(() => props.local ? props.stats : props.preset)
  const uses = computed(() => {
    const { downloads, week } = figures.value
    if (!downloads) return "Not used yet"
    const total = `${downloads} ${downloads === 1 ? "use" : "uses"} in total`
    return week === undefined ? total : `${total}, ${week || "none"} in the last 7 days`
  })
  const sharedOn = computed(() => new Date(figures.value.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }))

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
      <Button ghost title="Close this preset" aria-label="Close this preset" @click="emit('close')"><template #icon><Icon name="close" :size="18" /></template></Button>
    </header>
    <div class="content">
      <TitlePicture :code="preset.code" :fingerprint="local ? null : preset.fingerprint" large />
      <div class="heading">
        <input v-if="renaming" v-selected class="name-field" type="text" :value="preset.name" :maxlength="NAME_LIMIT" :aria-label="`Name of ${preset.name}`" spellcheck="false" @blur="finishRenaming" @keydown.enter="$event.target.blur()" @keydown.esc.stop="renaming = false">
        <h2 v-else class="ellipsis" :title="preset.name">{{ preset.name }}</h2>
        <Button tiny ghost v-if="(local || owned) && !renaming" :title="`Rename ${preset.name}`" :aria-label="`Rename ${preset.name}`" @click="renaming = true"><template #icon><Icon name="pencil" :size="14" /></template></Button>
        <span v-if="local && preset.inBrowser" class="browser" title="Your account is full, so this is only saved in this browser">This browser only</span>
        <span v-if="local && preset.shared" class="yours">Shared publicly</span>
        <span v-else-if="mine" class="yours">Shared by you</span>
      </div>
      <template v-if="figures">
        <PresetRating :rating="figures.rating" :votes="figures.votes" :mine="preset.vote" :own="mine || local" @vote="emit('vote', $event)" />
        <p class="facts"><span>{{ uses }}</span><span>Shared {{ sharedOn }}</span><span v-if="figures.author" class="author">By <button type="button" class="link-button" :title="`Show presets by ${figures.author} on ${providerLabel(figures.authorProvider)}`" @click="emit('user', figures.author, figures.authorProvider)"><strong><UserName :name="figures.author" :provider="figures.authorProvider" /></strong></button></span></p>
      </template>
      <div class="actions">
        <Button primary @click="emit('open')">Open in editor</Button>
        <template v-if="local">
          <Button v-if="!preset.shared" @click="emit('share')"><template #icon><Icon name="share" :size="16" /></template><span>Share publicly</span></Button>
          <Button v-else @click="emit('view')"><template #icon><Icon name="open" :size="16" /></template><span>View in Community</span></Button>
          <Button danger @click="emit('remove')"><template #icon><Icon name="trash" :size="16" /></template><span>Delete</span></Button>
        </template>
        <template v-else>
          <Button v-if="!mine" :disabled="saved" @click="emit('save')"><template #icon><Icon name="bookmark" :size="16" /></template><span>{{ saved ? "In My presets" : "Save to My presets" }}</span></Button>
          <Button @click="copyLink"><template #icon><Icon name="share" :size="16" /></template><span>{{ copyMessage || "Copy link" }}</span></Button>
          <Button danger v-if="owned" @click="emit('remove')"><template #icon><Icon name="trash" :size="16" /></template><span>Delete</span></Button>
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

  .content {
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
    font-weight: 600;
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

  .yours,
  .browser {
    flex: none;
    margin-left: auto;
    padding-left: 8px;
    font-size: var(--font-md);
  }

  .yours {
    color: var(--accent);
  }

  .browser {
    color: var(--muted);
  }

  .browser + .yours {
    margin-left: 0;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
  }

  .author {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .author strong {
    font-weight: 600;
    color: var(--text);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions button {
    flex: 1 1 180px;
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

    .content {
      padding-top: 4px;
    }
  }
</style>
