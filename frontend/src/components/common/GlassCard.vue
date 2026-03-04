<script setup>
defineProps({
  level: {
    type: Number,
    default: 2
  },
  hoverEffect: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div 
    class="glass-card" 
    :class="[`level-${level}`, { 'hover-effect': hoverEffect }]"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.glass-card {
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
  padding: 24px;
  position: relative;
  overflow: hidden;
}

/* 光泽效果 */
.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -50%;
  width: 200%;
  height: 100%;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.34),
    transparent
  );
  transform: skewX(-20deg);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s;
}

.hover-effect:hover::before {
  opacity: 1;
  animation: shine 1.5s infinite;
}

@keyframes shine {
  0% { transform: translateX(-100%) skewX(-20deg); }
  100% { transform: translateX(100%) skewX(-20deg); }
}

.level-1 {
  background: var(--glass-level-1-bg);
  border: 1px solid var(--glass-level-1-border);
  backdrop-filter: var(--glass-level-1-backdrop);
  box-shadow: var(--glass-level-1-shadow);
}

.level-2 {
  background: var(--glass-level-2-bg);
  border: 1px solid var(--glass-level-2-border);
  backdrop-filter: var(--glass-level-2-backdrop);
  box-shadow: var(--glass-level-2-shadow);
}

.level-3 {
  background: var(--glass-level-3-bg);
  border: 1px solid var(--glass-level-3-border);
  backdrop-filter: var(--glass-level-3-backdrop);
  box-shadow: var(--glass-level-3-shadow);
}

.hover-effect:hover {
  transform: translateY(-3px);
  border-color: #fff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.1);
}
</style>
