<template>
  <div class="app">
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
