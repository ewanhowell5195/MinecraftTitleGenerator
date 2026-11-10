<script setup>
  import { onMounted, ref } from "vue"
  import Button from "./Button.vue"
  import RenderDialog from "./RenderDialog.vue"

  defineProps({
    preset: { type: Object, required: true },
    canDeleteShared: { type: Boolean, required: true }
  })

  const emit = defineEmits(["close", "delete"])

  const main = ref(null)

  onMounted(() => main.value.focus())
</script>

<template>
  <RenderDialog title="Delete preset" close-title="Cancel" wide dismissable @close="emit('close')">
    <div class="dialog-body">
      <template v-if="canDeleteShared">
        <p><strong>{{ preset.name }}</strong> is shared publicly. Deleting it from Community moves it back to your presets, and it keeps its votes and uses if you share it again. Fully deleting it removes it for good.</p>
        <div class="buttons">
          <Button danger @click="emit('delete', 'full')">Fully delete</Button>
          <Button primary ref="main" @click="emit('delete', 'unshare')">Delete from Community</Button>
        </div>
      </template>
      <template v-else>
        <p><strong>{{ preset.name }}</strong> is also shared publicly. This browser can't manage it, so it will stay in Community.</p>
        <div class="buttons">
          <Button primary ref="main" @click="emit('delete', 'local')">Delete my preset only</Button>
        </div>
      </template>
    </div>
  </RenderDialog>
</template>

<style scoped>
  strong {
    font-weight: 600;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
