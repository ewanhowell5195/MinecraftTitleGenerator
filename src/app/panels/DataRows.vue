<script setup>
  import { computed, ref } from "vue"
  import { useListReorder } from "#c/composables/reorder.js"
  import Button from "#c/Button.vue"
  import Icon from "#c/Icon.vue"

  const props = defineProps({
    control: { type: Object, required: true },
    state: { type: Object, required: true }
  })

  const { context, resolved } = props.state
  const items = computed(() => resolved(props.control.items))
  const box = ref(null)
  const rows = []
  const { dragged, press } = useListReorder({ box, rows, ids: () => Array.from(items.value.keys()), move })

  function move(drag, to) {
    props.control.move(drag.id, to, context)
    drag.id = to
  }

  function select(index) {
    props.control.select(index, context)
  }
</script>

<template>
  <div ref="box" class="layers">
    <div :ref="el => (rows[index] = el)" class="layer card card-row small" v-for="(item, index) of items" :key="item.key" tabindex="0" role="button" :aria-pressed="item.selected" @click="select(index)" @keydown.enter="select(index)" @keydown.space.self.prevent="select(index)" :class="{ selected: item.selected, dragged: dragged === index, hidden: item.off }">
      <span class="grip" @pointerdown="press($event, index)"><Icon name="grip" :size="14" /></span>
      <img :src="item.image" alt="">
      <span class="name grow ellipsis">{{ item.label }}</span>
      <span class="actions">
        <Button v-for="action of item.actions" :key="action.title" ghost :icon="action.icon" :title="action.title" :aria-pressed="action.pressed" @click.stop="action.press()" />
      </span>
    </div>
  </div>
</template>

<style scoped>
  .layers {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .layer {
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--muted);
  }

  .layer.dragged {
    position: relative;
    z-index: 1;
    box-shadow: var(--drag-shadow);
  }

  .grip {
    align-self: stretch;
    margin-right: -4px;
  }

  .layer.dragged,
  .layer.dragged .grip {
    cursor: grabbing;
  }

  .layer img {
    width: 64px;
    height: 30px;
    padding: 3px;
    object-fit: contain;
    image-rendering: pixelated;
    background: var(--field);
  }

  .layer.hidden img {
    opacity: 0.3;
  }

  .layer.hidden .name {
    color: var(--faint);
  }

  .actions {
    display: flex;
    gap: 2px;
  }
</style>
