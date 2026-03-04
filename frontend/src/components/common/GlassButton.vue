<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary', // primary, secondary, text, accent
    validator: (val) => ['primary', 'secondary', 'text', 'accent'].includes(val)
  },
  glow: {
    type: Boolean,
    default: true
  },
  size: {
    type: String,
    default: 'medium' // small, medium, large
  }
})
</script>

<template>
  <button 
    class="glass-btn" 
    :class="[`variant-${variant}`, `size-${size}`, { 'glow': glow && variant !== 'text' }]"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.glass-btn {
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  outline: none;
  user-select: none;
  border: 1px solid transparent;
}

/* Sizes */
.size-small {
  padding: 6px 16px;
  font-size: 12px;
}
.size-medium {
  padding: 10px 24px;
  font-size: 14px;
}
.size-large {
  padding: 14px 32px;
  font-size: 16px;
}

/* Variants */
/* Primary */
.variant-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}
.variant-primary:hover {
  background: #006be0;
  transform: translateY(-2px);
}
.variant-primary:active {
  transform: translateY(0);
}
.variant-primary.glow {
  box-shadow: var(--glow-primary);
}
.variant-primary.glow:hover {
  box-shadow: 0 8px 24px rgba(0, 122, 255, 0.38);
}

/* Secondary (Glass) */
.variant-secondary {
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.78);
  color: var(--text-main);
  backdrop-filter: blur(14px);
}
.variant-secondary:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: var(--color-primary);
  transform: translateY(-1px);
  color: var(--color-primary);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
}

/* Accent */
.variant-accent {
  background: var(--color-accent);
  color: white;
  border: none;
}
.variant-accent:hover {
  background: #f08f00;
  transform: translateY(-2px);
}
.variant-accent.glow {
  box-shadow: var(--glow-accent);
}

/* Text */
.variant-text {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding-left: 8px;
  padding-right: 8px;
}
.variant-text:hover {
  color: var(--color-primary);
  background: rgba(0, 122, 255, 0.08);
}
</style>
