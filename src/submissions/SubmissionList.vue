<script setup>
  import { reactive } from "vue"
  import UserName from "../components/UserName.vue"
  import { THUMBNAIL_KINDS, thumbnailPath } from "../lib/submissionKinds/published.js"
  import { submissionFileUrl, submissionPage } from "../lib/submissionsApi.js"
  import { CLIENT_KINDS } from "./kinds/index.js"

  const props = defineProps({
    items: { type: Array, required: true },
    fonts: { type: Array, required: true },
    showSender: { type: Boolean, default: false }
  })

  const missing = reactive(new Set())

  function imageOf(item) {
    if (!THUMBNAIL_KINDS.includes(item.kind)) return submissionFileUrl(item)
    const path = thumbnailPath(item, props.fonts)
    return item.filesUrl && path && !missing.has(item.id) ? `${item.filesUrl}${path}?v=${item.updatedAt}` : null
  }
</script>

<template>
  <ul class="submission-list">
    <li v-for="item of items" :key="item.id">
      <a :href="submissionPage(item.id)">
        <span class="thumb">
          <img v-if="imageOf(item)" :src="imageOf(item)" alt="" loading="lazy" @error="missing.add(item.id)">
          <span v-else class="pending">No thumbnail yet</span>
        </span>
        <span class="body">
          <span class="name ellipsis">{{ item.name }}</span>
          <span class="where ellipsis">{{ CLIENT_KINDS[item.kind].summary(item, fonts) }}</span>
        </span>
        <span v-if="showSender" class="sender">Submitted by <UserName v-if="item.ownerName" :name="item.ownerName" :provider="item.ownerProvider" :size="13" /><template v-else>a deleted account</template></span>
      </a>
    </li>
  </ul>
</template>
