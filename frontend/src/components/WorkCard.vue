<template>
  <div class="work-card" @click="handleCardClick">
    <!-- 封面图 -->
    <div class="work-cover">
      <img 
        v-if="work.contentType === 'image'"
        :src="work.coverUrl" 
        :alt="work.title || '作品封面'"
        class="cover-image"
        @error="handleImageError"
      />
      <video
        v-else
        :src="work.coverUrl"
        class="cover-video"
        muted
        @error="handleImageError"
      ></video>
      
      <!-- 视频标识 -->
      <div v-if="work.contentType === 'video'" class="video-badge">
        <el-icon><VideoPlay /></el-icon>
      </div>
      
      <!-- 悬浮操作按钮 -->
      <div class="work-overlay">
        <el-button
          type="primary"
          size="small"
          class="use-template-btn"
          @click.stop="handleUseTemplate"
        >
          <el-icon style="margin-right: 4px"><Star /></el-icon>
          一键同款
        </el-button>
      </div>
    </div>
    
    <!-- 作品信息 -->
    <div class="work-info">
      <!-- 用户信息 -->
      <div class="user-info">
        <el-avatar :size="28" :src="work.userAvatar">
          {{ work.username?.charAt(0)?.toUpperCase() }}
        </el-avatar>
        <span class="username">{{ work.username }}</span>
      </div>
      
      <!-- 提示词预览 -->
      <div class="prompt-preview">
        {{ truncatedPrompt }}
      </div>
      
      <!-- 底部信息 -->
      <div class="work-meta">
        <!-- 模型标签 -->
        <el-tag v-if="work.modelName" size="small" class="model-tag">
          {{ work.modelName }}
        </el-tag>
        
        <!-- 统计信息 -->
        <div class="work-stats">
          <span class="stat-item">
            <el-icon><View /></el-icon>
            {{ formatCount(work.viewsCount) }}
          </span>
          <span class="stat-item">
            <el-icon><Star /></el-icon>
            {{ formatCount(work.likesCount) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, Star, View, Star as StarIcon } from '@element-plus/icons-vue'

// Props
const props = defineProps({
  work: {
    type: Object,
    required: true
  },
  isLoggedIn: {
    type: Boolean,
    default: false
  }
})

// 定义事件
const emit = defineEmits(['click', 'use-template'])

// 截断提示词显示
const truncatedPrompt = computed(() => {
  const prompt = props.work.prompt || ''
  return prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt
})

// 格式化数字
const formatCount = (count) => {
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k'
  }
  return count || 0
}

// 处理卡片点击
const handleCardClick = () => {
  emit('click', props.work)
}

// 处理一键同款
const handleUseTemplate = () => {
  if (!props.isLoggedIn) {
    ElMessage.warning('请先登录后使用一键同款功能')
    emit('use-template', { work: props.work, needLogin: true })
  } else {
    emit('use-template', { work: props.work, needLogin: false })
  }
}

// 处理图片加载错误
const handleImageError = (e) => {
  e.target.src = '/LOGO2.png' // 使用默认图片
}
</script>

<style scoped>
.work-card {
  /* 基础玻璃拟态 */
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-top: 1px solid var(--glass-highlight);
  border-left: 1px solid var(--glass-highlight);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--glass-shadow);
  height: fit-content;
  break-inside: avoid;
  margin-bottom: 16px;
  
  /* 顺滑交互过渡 */
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
              box-shadow 0.4s ease, 
              background 0.4s ease;
}

.work-card:hover {
  /* 优雅的上浮与阴影展现 (避免 Scale 导致的挤压错位) */
  transform: translateY(-8px);
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4), 
              0 0 20px rgba(0, 184, 230, 0.2);
  background: var(--glass-level-2-bg);
}

/* 封面图 */
.work-cover {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 比例 */
  background: linear-gradient(135deg, #f0f0f9 0%, #e5f0f5 100%);
  overflow: hidden;
}

.cover-image,
.cover-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-smooth);
}

.work-card:hover .cover-image,
.work-card:hover .cover-video {
  transform: scale(1.05);
}

/* 视频标识 */
.video-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: var(--primary-blue);
  color: white;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  backdrop-filter: blur(10px);
}

/* 悬浮操作层 */
.work-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 184, 230, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-smooth);
  backdrop-filter: blur(4px);
}

.work-card:hover .work-overlay {
  opacity: 1;
}

.use-template-btn {
  background: var(--primary-blue);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.3);
  transform: scale(0.9);
  transition: all var(--transition-smooth);
}

.work-card:hover .use-template-btn {
  transform: scale(1);
}

.use-template-btn:hover {
  background: var(--primary-blue-light);
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 184, 230, 0.4);
}

/* 作品信息 */
.work-info {
  padding: 12px;
}

/* 用户信息 */
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.username {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 提示词预览 */
.prompt-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
  min-height: 40px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 底部信息 */
.work-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-tag {
  background: var(--primary-blue-bg);
  border: 1px solid var(--primary-blue-light);
  color: var(--primary-blue-dark);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.work-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-item .el-icon {
  font-size: 14px;
}

:deep(.el-avatar) {
  background: var(--primary-blue);
  color: white;
  font-weight: 600;
}
</style>

