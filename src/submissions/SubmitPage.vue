<script setup>
  import { submissionPage } from "../lib/submissionsApi.js"
  import { router } from "../router.js"
  import SubmissionForm from "./SubmissionForm.vue"

  defineProps({
    fonts: { type: Array, required: true }
  })

  const prefill = Object.fromEntries(new URLSearchParams(location.search))

  function sent({ id }) {
    router.push(submissionPage(id))
  }
</script>

<template>
  <section class="intro">
    <h1>Submit to the title generator</h1>
    <p>Made a font or a texture? Send it here, and once it's accepted it shows up in the generator for everyone.</p>
  </section>
  <SubmissionForm :fonts="fonts" :prefill="prefill" @done="sent" />
</template>
