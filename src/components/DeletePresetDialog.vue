<script setup>
  import { onMounted, ref } from "vue"
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
    <div class="body">
      <p v-if="canDeleteShared"><strong>{{ preset.name }}</strong> is also shared publicly. You can delete just your preset and leave it in Community, or delete it from both.</p>
      <p v-else><strong>{{ preset.name }}</strong> is also shared publicly. This browser can't manage it, so it will stay in Community.</p>
      <div class="buttons">
        <button v-if="canDeleteShared" class="danger" type="button" @click="emit('delete', true)">Also delete from Community</button>
        <button ref="main" class="primary" type="button" @click="emit('delete', false)">Delete my preset only</button>
      </div>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }

  p {
    margin: 0;
    font-size: var(--font-md);
  }

  strong {
    font-weight: 600;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  button {
    user-select: none;
  }

  .danger {
    color: var(--danger);
  }
</style>
