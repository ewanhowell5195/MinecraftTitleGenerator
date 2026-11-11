<script setup>
  import { reactive } from "vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import UserName from "../components/UserName.vue"
  import { THUMBNAIL_KINDS, thumbnailPath } from "../lib/submissionKinds/published.js"
  import { submissionExtraUrl, submissionFileUrl, submissionPage } from "../lib/submissionsApi.js"
  import { CLIENT_KINDS } from "./kinds/index.js"

  const props = defineProps({
    items: { type: Array, required: true },
    fonts: { type: Array, required: true },
    showSender: { type: Boolean, default: false }
  })

  const missing = reactive(new Set())

  function imageOf(item) {
    if (missing.has(item.id)) return null
    if (item.kind === "shapeModel") return submissionExtraUrl(item, "texture")
    if (!THUMBNAIL_KINDS.includes(item.kind)) return submissionFileUrl(item)
    const path = thumbnailPath(item, props.fonts)
    return item.filesUrl && path ? `${item.filesUrl}${path}?v=${item.updatedAt}` : null
  }
</script>

<template>
  <TileGrid :min="240">
    <Tile v-for="item of items" :key="item.id" :label="item.name" :href="submissionPage(item.id)">
      <template #picture>
        <img v-if="imageOf(item)" class="shot" :src="imageOf(item)" alt="" loading="lazy" @error="missing.add(item.id)">
        <span v-else class="empty-state">No thumbnail yet</span>
      </template>
      <span class="where">{{ CLIENT_KINDS[item.kind].summary(item, fonts) }}</span>
      <span v-if="showSender" class="sender">Submitted by <UserName v-if="item.ownerName" :name="item.ownerName" :provider="item.ownerProvider" :size="13" /><template v-else>a deleted account</template></span>
    </Tile>
  </TileGrid>
</template>

<style scoped>
  .shot {
    width: 100%;
    height: 100%;
  }

  .where {
    margin-top: -4px;
    font-weight: 500;
    color: var(--faint);
  }

  .sender {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    align-self: stretch;
    min-width: 0;
    margin-top: auto;
    padding-top: 8px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--faint);
    border-top: 1px solid var(--line);
  }

  .sender .user-name {
    color: var(--muted);
  }
</style>
