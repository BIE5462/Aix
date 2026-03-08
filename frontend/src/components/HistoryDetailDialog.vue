<template>
  <el-dialog
    v-model="dialogVisible"
    title="历史记录详情"
    width="90%"
    max-width="1400px"
    @close="handleClose"
    class="history-detail-dialog"
  >
    <div v-if="historyItem" class="dialog-content">
      <!-- 左侧：预览区 -->
      <div class="preview-section">
        <!-- 视频 -->
        <video 
          v-if="historyItem.mode === 'video-generation' && historyItem.videoUrl" 
          :src="historyItem.videoUrl" 
          class="preview-video"
          controls
          autoplay
          loop
        />
        
        <!-- 图片模式 -->
        <template v-else-if="historyItem.generatedImages && historyItem.generatedImages.length > 0">
          <!-- 选中图片大图显示 -->
          <div class="large-preview">
            <img :src="getImageUrl(historyItem.generatedImages[selectedImageIndex])" alt="大图预览" />
          </div>
          
          <!-- 图片缩略图导航 -->
          <div class="images-grid">
            <div 
              v-for="(image, index) in historyItem.generatedImages" 
              :key="index"
              class="image-item"
              @click="selectedImageIndex = index"
              :class="{ 'selected': selectedImageIndex === index }"
            >
              <img :src="getImageUrl(image)" :alt="`图片 ${index + 1}`" />
              <div class="image-index">{{ index + 1 }}</div>
            </div>
          </div>
        </template>
        
        <!-- 失败占位 -->
        <div v-else class="preview-placeholder">
          <el-icon class="placeholder-icon"><Warning /></el-icon>
          <p>生成失败或无内容</p>
        </div>
      </div>
      
      <!-- 右侧：信息区 -->
      <div class="info-section">
        <!-- 生成模式 -->
        <div class="info-row">
          <span class="info-label">生成模式:</span>
          <el-tag :type="getModeTagType(historyItem.mode)" size="large">
            {{ getModeText(historyItem.mode) }}
          </el-tag>
        </div>
        
        <!-- 模型信息 -->
        <div v-if="modelName" class="info-row">
          <span class="info-label">模型:</span>
          <span class="info-value">{{ modelName }}</span>
        </div>
        
        <!-- 提示词 -->
        <div class="prompt-section">
          <h3 class="section-title">提示词</h3>
          <p class="prompt-text">{{ historyItem.prompt || '无提示词' }}</p>
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
        
        <!-- 参考图 -->
        <div v-if="historyItem.referenceImage" class="reference-section">
          <h3 class="section-title">参考图</h3>
          <img :src="historyItem.referenceImage" alt="参考图" class="reference-image" />
        </div>
        
        <!-- 创建时间 -->
        <div class="info-row">
          <span class="info-label">创建时间:</span>
          <span class="info-value">{{ formatTime(historyItem.createdAt) }}</span>
        </div>
        
        <!-- 状态 -->
        <div v-if="historyItem.status" class="info-row">
          <span class="info-label">状态:</span>
          <el-tag :type="getStatusTagType(historyItem.status)">
            {{ getStatusText(historyItem.status) }}
          </el-tag>
        </div>
        
        <!-- 操作按钮区 -->
        <div class="action-buttons">
          <el-button
            v-if="canPublish"
            type="primary"
            size="large"
            @click="handlePublish"
            :icon="Upload"
          >
            发布到首页
          </el-button>

          <el-button
            v-if="canDownloadImage"
            type="info"
            size="large"
            @click="handleDownloadImage"
            :icon="Download"
          >
            下载图片
          </el-button>

          <el-button
            v-if="canDownloadVideo"
            type="info"
            size="large"
            @click="handleDownloadVideo"
            :icon="Download"
          >
            下载视频
          </el-button>

          <el-button
            v-if="!isSaved"
            type="success"
            size="large"
            @click="handleSave"
            :icon="FolderAdd"
          >
            保存到历史记录
          </el-button>
          
          <el-button 
            type="warning"
            size="large"
            @click="handleUse"
            :icon="Edit"
          >
            使用此配置
          </el-button>

          <el-button
            type="danger"
            size="large"
            @click="handleDelete"
            :icon="Delete"
          >
            删除历史
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
import { ref, computed, watch, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DocumentCopy, Upload, Download, FolderAdd, Edit, Delete, Warning } from '@element-plus/icons-vue'
import { deleteHistory } from '../api/imageApi'
import { fetchProxyBlob, triggerBlobDownload } from '../api/downloadApi'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  historyItem: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'use-history', 'publish', 'save', 'deleted'])

// 弹窗可见性
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 选中的图片索引
const selectedImageIndex = ref(0)

// 尝试从父组件注入模型列表
const availableModels = inject('availableModels', ref([]))
const videoModels = inject('videoModels', ref([]))

// 获取模型名称（根据模型ID查找）
const modelName = computed(() => {
  if (!props.historyItem) return ''
  
  // 如果已经有modelName且不是数字，直接返回
  if (props.historyItem.modelName && isNaN(props.historyItem.modelName)) {
    return props.historyItem.modelName
  }
  
  // 根据模型ID查找模型名称
  const modelId = props.historyItem.modelId || props.historyItem.model_id
  
  if (!modelId) return props.historyItem.modelName || ''
  
  // 根据模式查找对应的模型列表
  let models = []
  if (props.historyItem.mode === 'video-generation') {
    models = videoModels.value
  } else {
    models = availableModels.value
  }
  
  // 查找模型
  const model = models.find(m => m.id === parseInt(modelId) || m.id === modelId)
  return model ? model.name : (props.historyItem.modelName || `模型 #${modelId}`)
})

// 重置选中索引
watch(() => props.historyItem, (newItem) => {
  if (newItem) {
    selectedImageIndex.value = 0
  }
})

// 获取图片URL
const getImageUrl = (image) => {
  if (typeof image === 'string') return image
  return image.url || image
}

// 获取下载图片URL
const getDownloadImageUrl = (image) => {
  if (!image) return ''
  if (typeof image === 'string') return image
  return image.originalUrl || image.ossUrl || image.oss_url || image.url || ''
}

// 判断是否需要通过代理下载
const needsProxyDownload = (url) => {
  if (!url) return false

  return (
    url.includes('creatimage.oss-cn-beijing.aliyuncs.com') ||
    url.includes('tos-cn-beijing.volces.com') ||
    url.includes('ark-content-generation') ||
    (url.startsWith('http') && !url.includes('localhost'))
  )
}

// 是否可以发布
const canPublish = computed(() => {
  if (!props.historyItem) return false
  return props.historyItem.generatedImages?.length > 0 || props.historyItem.videoUrl
})

// 是否可以下载图片
const canDownloadImage = computed(() => {
  if (!props.historyItem?.generatedImages?.length) return false
  const currentImage = props.historyItem.generatedImages[selectedImageIndex.value]
  return !!getDownloadImageUrl(currentImage)
})

// 是否可以下载视频
const canDownloadVideo = computed(() => {
  return !!props.historyItem?.videoUrl
})

// 是否已保存
const isSaved = computed(() => {
  // 这里可以根据实际情况判断
  return true // 假设从历史记录打开的都已保存
})

// 获取模式文本
const getModeText = (mode) => {
  const modeMap = {
    'text-to-image': '文生图',
    'image-to-image': '图生图',
    'video-generation': 'AI视频',
    'image-to-video': '图生视频'
  }
  return modeMap[mode] || mode
}

// 获取模式标签类型
const getModeTagType = (mode) => {
  const typeMap = {
    'text-to-image': 'primary',
    'image-to-image': 'success',
    'video-generation': 'danger',
    'image-to-video': 'warning'
  }
  return typeMap[mode] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const statusMap = {
    'completed': '已完成',
    'processing': '生成中',
    'failed': '失败'
  }
  return statusMap[status] || status
}

// 获取状态标签类型
const getStatusTagType = (status) => {
  const typeMap = {
    'completed': 'success',
    'processing': 'warning',
    'failed': 'danger'
  }
  return typeMap[status] || 'info'
}

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
    await navigator.clipboard.writeText(props.historyItem.prompt)
    ElMessage.success('提示词已复制')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

// 使用此配置
const handleUse = () => {
  emit('use-history', props.historyItem)
  ElMessage.success('已加载到工作台')
  handleClose()
}

// 发布
const handlePublish = () => {
  emit('publish', props.historyItem)
}

// 下载图片
const handleDownloadImage = async () => {
  try {
    const currentImage = props.historyItem?.generatedImages?.[selectedImageIndex.value]
    const downloadUrl = getDownloadImageUrl(currentImage)

    if (!downloadUrl) {
      ElMessage.error('当前图片不可下载')
      return
    }

    let response
    let blob
    if (needsProxyDownload(downloadUrl)) {
      blob = await fetchProxyBlob(downloadUrl)
    } else {
      response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      blob = await response.blob()
    }

    const extension = blob.type?.split('/')[1] || 'png'
    triggerBlobDownload(blob, `history-image-${selectedImageIndex.value + 1}-${Date.now()}.${extension}`)

    ElMessage.success('图片下载成功')
  } catch (error) {
    console.error('下载图片失败:', error)
    ElMessage.error('图片下载失败')
  }
}

// 下载视频
const handleDownloadVideo = async () => {
  try {
    const videoUrl = props.historyItem?.videoUrl

    if (!videoUrl) {
      ElMessage.error('当前视频不可下载')
      return
    }

    let response
    let blob
    if (needsProxyDownload(videoUrl)) {
      blob = await fetchProxyBlob(videoUrl)
    } else {
      response = await fetch(videoUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      blob = await response.blob()
    }

    const extension = blob.type?.split('/')[1] || 'mp4'
    triggerBlobDownload(blob, `history-video-${Date.now()}.${extension}`)

    ElMessage.success('视频下载成功')
  } catch (error) {
    console.error('下载视频失败:', error)
    ElMessage.error('视频下载失败')
  }
}

// 保存
const handleSave = () => {
  emit('save', props.historyItem)
}

// 删除历史
const handleDelete = async () => {
  if (!props.historyItem?.id) return

  try {
    await ElMessageBox.confirm(
      '删除后将同步清理关联云端文件，且不可恢复，确认继续？',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await deleteHistory(props.historyItem.id)
    ElMessage.success('历史记录已删除')
    emit('deleted', props.historyItem.id)
    handleClose()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除历史失败:', error)
      ElMessage.error(error.message || '删除失败')
    }
  }
}

// 关闭弹窗
const handleClose = () => {
  dialogVisible.value = false
}
</script>

<style scoped>
.history-detail-dialog :deep(.el-dialog) {
  margin: 0 !important;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.history-detail-dialog :deep(.el-dialog__header) {
  flex-shrink: 0;
  padding: 16px 20px;
}

.history-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

.history-detail-dialog :deep(.el-dialog__footer) {
  flex-shrink: 0;
  padding: 12px 20px;
}

.dialog-content {
  display: flex;
  gap: 20px;
  padding: 16px;
  height: 100%;
  overflow: hidden;
}

/* 预览区 */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  min-height: 0;
}

.preview-video {
  width: 100%;
  height: 100%;
  max-height: 100%;
  border-radius: 12px;
  background: #000;
  object-fit: contain;
}

/* 大图预览 */
.large-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 12px;
  overflow: hidden;
  min-height: 0;
}

.large-preview img {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 图片缩略图网格 */
.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  flex-shrink: 0;
  height: 90px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.image-item:hover {
  border-color: #ff5873;
  transform: scale(1.05);
}

.image-item.selected {
  border-color: #ff5873;
  box-shadow: 0 2px 8px rgba(255, 88, 115, 0.4);
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-index {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

/* 失败占位 */
.preview-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border-radius: 12px;
  padding: 30px;
  max-height: calc(75vh - 100px);
}

.preview-placeholder .placeholder-icon {
  font-size: 64px;
  color: #d1d5db;
  margin-bottom: 12px;
}

.preview-placeholder p {
  color: #9ca3af;
  font-size: 14px;
}

/* 信息区 */
.info-section {
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100%;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 #f1f1f1;
}

.info-section::-webkit-scrollbar {
  width: 6px;
}

.info-section::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.info-section::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.info-section::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 信息行 */
.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.info-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  min-width: 70px;
}

.info-value {
  font-size: 13px;
  color: #111827;
  flex: 1;
}

/* 提示词区域 */
.prompt-section {
  background: #f9fafb;
  padding: 10px;
  border-radius: 8px;
  flex-shrink: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.section-title {
  margin: 0 0 6px 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  flex-shrink: 0;
}

.prompt-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
  word-break: break-word;
  max-height: 80px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 #f1f1f1;
}

.prompt-text::-webkit-scrollbar {
  width: 4px;
}

.prompt-text::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.prompt-text::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 2px;
}

.copy-btn {
  margin-top: 4px;
  flex-shrink: 0;
}

/* 参考图 */
.reference-section {
  background: #f9fafb;
  padding: 10px;
  border-radius: 8px;
  flex-shrink: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reference-image {
  width: 100%;
  max-height: 120px;
  object-fit: contain;
  border-radius: 8px;
  margin-top: 6px;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 2px solid #e5e7eb;
  margin-top: auto;
  flex-shrink: 0;
}

.action-buttons .el-button {
  width: 100%;
}

.action-buttons :deep(.el-button) {
  padding: 8px 12px;
  font-size: 12px;
}

/* 响应式 */
@media (max-width: 1024px) {
  .dialog-content {
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }
  
  .info-section {
    flex: 0 0 auto;
    max-width: 100%;
    overflow-y: visible;
  }
  
  .preview-section {
    max-height: 45vh;
    flex-shrink: 0;
  }
}

@media (max-width: 768px) {
  .dialog-content {
    padding: 16px;
    gap: 16px;
  }
  
  .images-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }
  
  .info-section {
    gap: 10px;
  }
  
  .prompt-text {
    max-height: 80px;
  }
}
</style>

