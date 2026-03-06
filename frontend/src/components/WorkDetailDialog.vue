<template>
  <el-dialog
    v-model="dialogVisible"
    :title="work?.title || '作品详情'"
    width="90%"
    max-width="1200px"
    @close="handleClose"
    class="work-detail-dialog"
  >
    <div v-if="work" class="dialog-content">
      <!-- 左侧：作品预览 -->
      <div class="media-section">
        <!-- 视频 -->
        <video 
          v-if="work.content_type === 'video'" 
          :src="work.cover_url" 
          class="detail-video"
          controls
          autoplay
          loop
        />
        
        <!-- 图片 -->
        <img 
          v-else
          :src="work.cover_url" 
          :alt="work.title || work.prompt"
          class="detail-image"
        />
      </div>
      
      <!-- 右侧：作品信息 -->
      <div class="info-section">
        <!-- 标题/提示词 -->
        <div class="prompt-section">
          <h3 class="section-title">提示词</h3>
          <p class="prompt-text">{{ work.prompt }}</p>
          <el-button 
            size="small" 
            text
            @click="copyPrompt"
            class="copy-btn"
          >
            <el-icon><DocumentCopy /></el-icon>
            复制
          </el-button>
        </div>
        
        <!-- 模型信息 -->
        <div v-if="work.model_name" class="info-row">
          <span class="info-label">模型:</span>
          <span class="info-value">{{ work.model_name }}</span>
        </div>
        
        <!-- 创建时间 -->
        <div class="info-row">
          <span class="info-label">创建时间:</span>
          <span class="info-value">{{ formatTime(work.created_at) }}</span>
        </div>
        
        <!-- 统计信息 -->
        <div class="stats-section">
          <div class="stat-card">
            <el-icon class="stat-icon"><View /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ work.views_count }}</div>
              <div class="stat-label">查看</div>
            </div>
          </div>
          <div class="stat-card">
            <el-icon class="stat-icon like-icon" :class="{ 'liked': localLiked }">
              <component :is="localLiked ? 'StarFilled' : 'Star'" />
            </el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ localLikesCount }}</div>
              <div class="stat-label">点赞</div>
            </div>
          </div>
        </div>
        
        <!-- 大号点赞按钮 -->
        <el-button 
          size="large"
          :type="localLiked ? 'danger' : 'primary'"
          class="like-button"
          @click="handleLike"
        >
          <el-icon class="button-icon">
            <component :is="localLiked ? 'StarFilled' : 'Star'" />
          </el-icon>
          {{ localLiked ? '已点赞' : '点赞' }}
        </el-button>
        
        <!-- 下载按钮 -->
        <el-button
          size="large"
          type="success"
          class="download-button"
          :loading="downloading"
          @click="handleDownload"
        >
          <el-icon class="button-icon"><Download /></el-icon>
          {{ downloading ? '下载中...' : '下载原图' }}
        </el-button>

        <!-- 发布状态 -->
        <div class="publish-section">
          <div class="publish-status-row">
            <span class="status-label">发布状态:</span>
            <el-tag :type="work.is_published ? 'success' : 'info'" size="large">
              {{ work.is_published ? '已上架' : '已下架' }}
            </el-tag>
          </div>
          
          <el-button 
            v-if="work.is_published"
            type="warning"
            size="large"
            @click="handleUnpublish"
            class="publish-button"
          >
            <el-icon><Bottom /></el-icon>
            下架作品
          </el-button>
          <el-button 
            v-else
            type="success"
            size="large"
            @click="handleRepublish"
            class="publish-button"
          >
            <el-icon><Top /></el-icon>
            重新上架
          </el-button>

          <el-button
            type="danger"
            size="large"
            @click="handleDeletePermanently"
            class="publish-button"
          >
            永久删除
          </el-button>
        </div>
      </div>
    </div>
    
    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View, Star, StarFilled, DocumentCopy, Top, Bottom, Download } from '@element-plus/icons-vue'
import { likeWork, unlikeWork, unpublishWork, republishWork, deleteWorkPermanently } from '../api/worksApi'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  work: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'like', 'publish-change', 'refresh', 'deleted'])

// 弹窗可见性
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 本地点赞状态
const localLiked = ref(false)
const localLikesCount = ref(0)
const downloading = ref(false)

// 监听 work 变化，更新本地状态
watch(() => props.work, (newWork) => {
  if (newWork) {
    localLiked.value = newWork.isLiked || false
    localLikesCount.value = newWork.likes_count || 0
  }
}, { immediate: true })

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

// 复制提示词
const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(props.work.prompt)
    ElMessage.success('提示词已复制')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

// 点赞/取消点赞
const handleLike = async () => {
  if (!props.work) return
  
  const originalLikedState = localLiked.value
  const originalLikesCount = localLikesCount.value
  
  // 乐观更新
  localLiked.value = !localLiked.value
  localLikesCount.value = localLiked.value ? localLikesCount.value + 1 : localLikesCount.value - 1
  
  try {
    if (localLiked.value) {
      await likeWork(props.work.id)
      ElMessage.success('点赞成功')
    } else {
      await unlikeWork(props.work.id)
      ElMessage.success('已取消点赞')
    }
    
    // 通知父组件更新
    emit('like', props.work.id, localLiked.value)
  } catch (error) {
    // 回滚状态
    localLiked.value = originalLikedState
    localLikesCount.value = originalLikesCount
    console.error('点赞操作失败:', error)
    ElMessage.error('操作失败')
  }
}

// 下架作品
const handleUnpublish = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要下架这个作品吗？下架后将不会在首页展示。',
      '确认下架',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const response = await unpublishWork(props.work.id)
    if (response.data.success) {
      props.work.is_published = false
      emit('publish-change', props.work.id, false)
      ElMessage.success('作品已下架')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('下架失败:', error)
      ElMessage.error('下架失败')
    }
  }
}

// 重新上架作品
const handleRepublish = async () => {
  try {
    const response = await republishWork(props.work.id)
    if (response.data.success) {
      props.work.is_published = true
      emit('publish-change', props.work.id, true)
      ElMessage.success('作品已重新上架')
    }
  } catch (error) {
    console.error('上架失败:', error)
    ElMessage.error('上架失败')
  }
}

// 永久删除作品
const handleDeletePermanently = async () => {
  if (!props.work?.id) return

  try {
    await ElMessageBox.confirm(
      '删除后将同步清理云端文件，且不可恢复，确认继续？',
      '确认永久删除',
      {
        confirmButtonText: '永久删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await deleteWorkPermanently(props.work.id)
    if (response.data.success) {
      ElMessage.success(response.data.message || '作品已永久删除')
      emit('deleted', props.work.id)
      handleClose()
    } else {
      ElMessage.error(response.data.message || response.data.error || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('永久删除失败:', error)
      ElMessage.error(error.response?.data?.error || error.response?.data?.message || '永久删除失败')
    }
  }
}

// 下载作品
const handleDownload = async () => {
  if (!props.work?.cover_url) return

  downloading.value = true
  try {
    const isVideo = props.work.content_type === 'video'
    const ext = isVideo ? 'mp4' : 'png'
    const filename = `${props.work.title || 'work'}-${props.work.id}.${ext}`

    // 通过 fetch 下载 blob，避免跨域问题
    const response = await fetch(props.work.cover_url)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success('下载成功')
  } catch (error) {
    console.error('下载失败:', error)
    // 降级：直接打开链接
    window.open(props.work.cover_url, '_blank')
  } finally {
    downloading.value = false
  }
}

// 关闭弹窗
const handleClose = () => {
  dialogVisible.value = false
}
</script>

<style scoped>
.work-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.dialog-content {
  display: flex;
  gap: 32px;
  padding: 24px;
  min-height: 500px;
}

/* 媒体预览区 */
.media-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 12px;
  overflow: hidden;
}

.detail-image,
.detail-video {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  display: block;
}

/* 信息区 */
.info-section {
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 提示词区域 */
.prompt-section {
  background: #f9fafb;
  padding: 16px;
  border-radius: 8px;
  position: relative;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.prompt-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #6b7280;
  word-break: break-word;
}

.copy-btn {
  margin-top: 12px;
}

/* 信息行 */
.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e5e7eb;
}

.info-label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  color: #111827;
}

/* 统计卡片 */
.stats-section {
  display: flex;
  gap: 16px;
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.stat-icon {
  font-size: 32px;
  color: #9ca3af;
}

.stat-icon.like-icon.liked {
  color: #ff5873;
  animation: pulse 0.5s ease;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
}

/* 大号点赞按钮 */
.like-button {
  width: 100%;
  height: 56px;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.like-button .button-icon {
  font-size: 20px;
  margin-right: 8px;
}

.like-button:active {
  transform: scale(0.95);
}

/* 下载按钮 */
.download-button {
  width: 100%;
  height: 48px;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.download-button .button-icon {
  font-size: 18px;
  margin-right: 8px;
}

/* 发布状态区域 */
.publish-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
  border-top: 2px solid #e5e7eb;
}

.publish-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.publish-button {
  width: 100%;
  height: 48px;
  font-size: 15px;
  font-weight: 600;
}

/* 响应式 */
@media (max-width: 1024px) {
  .dialog-content {
    flex-direction: column;
  }
  
  .info-section {
    flex: 1;
  }
  
  .media-section {
    min-height: 400px;
  }
}

@media (max-width: 768px) {
  .dialog-content {
    padding: 16px;
    gap: 20px;
  }
  
  .stats-section {
    flex-direction: column;
  }
  
  .stat-card {
    padding: 12px;
  }
}
</style>




