<script setup lang="ts">
import AppIcon from '@/components/icons/AppIcon.vue'

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
    <span class="disclaimer-accent" aria-hidden="true"></span>
    <AppIcon name="info" :size="14" color="#D97706" class="disclaimer-icon" />
    <p class="disclaimer-text">{{ text }}</p>
  </div>
</template>

<style scoped>
.disclaimer-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px var(--spacing-lg);
  background: linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%);
  border-top: 1.5px solid rgba(245, 158, 11, 0.15);
  border-bottom: 1.5px solid rgba(245, 158, 11, 0.15);
  position: relative;
  overflow: hidden;
}

.disclaimer-bar.fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));
  z-index: 40;
}

.disclaimer-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--color-amber);
  border-radius: 0 2px 2px 0;
}

.disclaimer-icon {
  margin-top: 2px;
  flex-shrink: 0;
}

.disclaimer-text {
  flex: 1;
  font-size: 11px;
  line-height: 1.5;
  color: #92400E;
  margin: 0;
  font-weight: 500;
}
</style>
