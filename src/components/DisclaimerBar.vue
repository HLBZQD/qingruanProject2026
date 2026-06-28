<script setup lang="ts">
const props = withDefaults(defineProps<{
  text?: string
  fixed?: boolean
}>(), {
  text: '本平台的 AI 健康建议、风险预测、方案生成等内容仅供健康参考，不能替代专业医疗诊断、治疗或建议。如有健康问题，请及时就医咨询专业医师。',
  fixed: false,
})
</script>

<template>
  <div class="disclaimer-bar" :class="{ fixed: fixed }" role="note">
    <i class="fas fa-info-circle disclaimer-icon" aria-hidden="true"></i>
    <p class="disclaimer-text">{{ text }}</p>
  </div>
</template>

<style scoped>
.disclaimer-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px var(--spacing-lg);
  background: rgba(250, 173, 20, 0.08);
  border-top: 1px solid rgba(250, 173, 20, 0.15);
  border-bottom: 1px solid rgba(250, 173, 20, 0.15);
}

.disclaimer-bar.fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));
  z-index: 40;
}

.disclaimer-icon {
  font-size: 14px;
  color: #ad8b00;
  margin-top: 2px;
  flex-shrink: 0;
}

.disclaimer-text {
  flex: 1;
  font-size: 11px;
  line-height: 1.5;
  color: #8c6f00;
  margin: 0;
}
</style>
