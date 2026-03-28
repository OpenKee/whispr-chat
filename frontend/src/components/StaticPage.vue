<template>
  <div class="page">
    <div class="page-header">
      <router-link to="/" class="back-btn">← 返回</router-link>
      <h1>{{ title }}</h1>
    </div>
    <div class="page-body" v-html="content"></div>
  </div>
</template>

<script>
export default {
  name: 'StaticPage',
  props: {
    title: String,
    content: String
  }
}
</script>

<style scoped>
.page {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  animation: fadeIn 0.3s ease;
}

.page-header {
  max-width: 640px;
  margin: 0 auto 24px;
}

.back-btn {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  display: inline-block;
  margin-bottom: 16px;
  transition: color 0.2s;
}

.back-btn:hover { color: var(--accent); }

.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -1px;
}

.page-body {
  max-width: 640px;
  margin: 0 auto;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.page-body :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 28px 0 12px;
}

.page-body :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 20px 0 8px;
}

.page-body :deep(p) {
  margin-bottom: 12px;
}

.page-body :deep(ul) {
  margin: 8px 0 16px 20px;
}

.page-body :deep(li) {
  margin-bottom: 6px;
}

.page-body :deep(.highlight) {
  color: var(--accent);
  font-weight: 500;
}

.page-body :deep(.last-update) {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

@media (max-width: 600px) {
  .page { padding: 16px; }
  .page-header h1 { font-size: 22px; }
}
</style>
