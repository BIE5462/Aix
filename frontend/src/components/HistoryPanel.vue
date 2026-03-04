<template>
  <div class="history-panel">
    <div class="history-header">
      <!-- 分类筛选 -->
      <el-segmented v-model="contentTypeFilter" :options="contentTypeOptions" class="content-filter" />

      <el-button 
        class="clear-history-btn" 
        size="small" 
        @click="clearAllHistory" 
        :icon="Delete"
        text
      >
        清空历史
      </el-button>
    </div>

    <div class="history-list">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-history">
        <LoadingCard
          title="加载历史记录中..."
          subtitle="正在获取您的生成历史"
          size="medium"
        />
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredHistory.length === 0" class="empty-history">
        <el-icon class="empty-icon"><Document /></el-icon>
        <p>暂无{{ contentTypeFilter === 'all' ? '' : contentTypeFilter === 'image' ? '图片' : '视频' }}历史记录</p>
      </div>

      <!-- 历史记录列表 -->
      <div v-else class="history-items">
        <!-- 图片为主的历史记录 -->
        <div class="history-image-grid">
          <div
            v-for="item in filteredHistory"
            :key="item.id"
            class="history-image-card"
            @click="selectHistoryItem(item)"
          >
            <!-- 删除按钮 -->
            <div class="delete-btn" @click.stop="deleteHistoryItem(item.id)">
              <el-icon><Delete /></el-icon>
            </div>

            <!-- 主图片/视频区域 -->
            <div class="image-container">
              <!-- 视频缩略图 -->
              <template v-if="isVideoItem(item)">
                <video
                  v-if="getFirstImage(item)"
                  :src="getFirstImage(item)"
                  class="video-thumbnail"
                  muted
                  @error="handleImageError"
                ></video>
                <div v-else class="no-image-placeholder">
                  <el-icon size="32"><VideoPlay /></el-icon>
                </div>
                <!-- 视频标签 -->
                <div class="video-badge">
                  <el-icon><VideoPlay /></el-icon>
                </div>
              </template>

              <!-- 图片缩略图 -->
              <template v-else>
                <img
                  v-if="getFirstImage(item)"
                  :src="getFirstImage(item)"
                  :alt="item.prompt"
                  @error="handleImageError"
                />
                <div v-else class="no-image-placeholder">
                  <el-icon size="32"><Picture /></el-icon>
                </div>
              </template>
            </div>

            <!-- 底部信息条 -->
            <div class="info-bar">
              <!-- 生图类型 -->
              <div class="mode-badge">
                {{ getModeText(item.mode) }}
              </div>
              <!-- 时间 -->
              <div class="time-info">
                {{ formatTime(item.createdAt) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalCount > pageSize" class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="totalCount"
        layout="prev, pager, next"
        small
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Document, Picture, VideoPlay } from '@element-plus/icons-vue'
import LoadingCard from './LoadingCard.vue'
import { getHistory, deleteHistory, clearHistory } from '../api/imageApi'

// 定义事件
const emit = defineEmits(['select-history'])

// 响应式数据
const currentPage = ref(1)
const pageSize = ref(12) // 增加每页显示数量
const historyList = ref([])
const totalCount = ref(0)
const loading = ref(false)
const historyCache = ref(new Map()) // 历史记录缓存
const MAX_CACHE_SIZE = 50 // 最大缓存条目数
let cacheCleanupTimer = null // 缓存清理定时器

// 内容类型筛选
const contentTypeFilter = ref('all')
const contentTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' }
]

// 监听筛选器变化，重新加载第一页
watch(contentTypeFilter, () => {
  currentPage.value = 1
  historyCache.value.clear() // 清除缓存
  loadHistoryFromServer()
})

// 判断是否为视频项
const isVideoItem = (item) => {
  return item.mode === 'video-generation' ||
         (item.generatedImages && item.generatedImages[0]?.isVideo)
}

// 计算属性 - 直接使用服务器返回的数据（不再前端过滤）
const filteredHistory = computed(() => {
  return historyList.value
})

// 获取模式文本
const getModeText = (mode) => {
  switch (mode) {
    case 'text-to-image':
      return '文生图'
    case 'image-to-image':
      return '图生图'
    case 'video-generation':
      return '视频生成'
    default:
      return '未知模式'
  }
}

// 获取第一张图片/视频URL（用于缩略图显示）
// 优化：自动跳过失败的图片，找到第一张成功生成的图片
const getFirstImage = (item) => {
  // 视频模式
  if (isVideoItem(item)) {
    if (item.generatedImages && item.generatedImages.length > 0) {
      // 遍历所有视频，找到第一个有效的URL
      for (const img of item.generatedImages) {
        if (img && img.url && img.url.trim() !== '') {
          return img.url
        }
      }
    }
    return null
  }

  // 图片模式
  if (item.generatedImages && item.generatedImages.length > 0) {
    // 遍历所有图片，找到第一个有效的URL
    for (const img of item.generatedImages) {
      if (img && img.url && img.url.trim() !== '') {
        return img.url
      }
    }
    // 如果数组中没有找到有效URL，返回null
    return null
  } else if (item.generatedImage && item.generatedImage.trim() !== '') {
    return item.generatedImage
  }
  return null
}

// 获取图片数量
// 优化：只统计成功生成的图片数量
const getImageCount = (item) => {
  // 视频模式返回1（一个视频）
  if (isVideoItem(item)) {
    return 1
  }

  // 图片模式 - 统计有效图片数量
  if (item.generatedImages && item.generatedImages.length > 0) {
    // 过滤出有效的图片
    const validImages = item.generatedImages.filter(img => img && img.url && img.url.trim() !== '')
    return validImages.length
  } else if (item.generatedImage && item.generatedImage.trim() !== '') {
    return 1
  }
  return 0
}

// 获取历史记录角标
const getHistoryBadges = (item) => {
  const badges = []
  
  // 图片模式角标
  {
    // 图片数量角标
    const imageCount = getImageCount(item)
    if (imageCount > 1) {
      badges.push({
        text: `${imageCount}张`,
        type: 'primary'
      })
    }
    
    // 参考图角标
    if (item.mode === 'image-to-image' && item.referenceImage) {
      badges.push({
        text: '参考图',
        type: 'success'
      })
    }
  }
  
  return badges
}

// 处理历史记录下载
const handleHistoryDownload = async (item) => {
  try {
    let downloadUrl = null
    let filename = ''
    
    {
      // 图片下载
      downloadUrl = getFirstImage(item)
      filename = `image-${item.id}-${Date.now()}.png`
    }
    
    if (!downloadUrl) {
      ElMessage.warning('没有可下载的内容')
      return
    }
    
    // 直接使用URL创建下载链接，避免在新窗口打开
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    link.target = '_self' // 确保在当前窗口下载
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    ElMessage.success('下载成功')
  } catch (error) {
    console.error('下载失败:', error)
    ElMessage.error('下载失败')
  }
}

// 处理历史记录预览
const handleHistoryPreview = (item) => {
  const previewUrl = getFirstImage(item)
  if (!previewUrl) {
    ElMessage.warning('没有可预览的内容')
    return
  }
  
  const previewWindow = window.open('', '_blank', 'width=800,height=600')
  
  {
    // 图片预览
    previewWindow.document.write(`
      <html>
        <head>
          <title>图片预览 - ${item.prompt}</title>
          <style>
            body { 
              margin: 0; 
              padding: 20px; 
              background: #f5f5f5; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
            }
            img { 
              max-width: 100%; 
              max-height: 100%; 
              box-shadow: 0 4px 20px rgba(0,0,0,0.1); 
              border-radius: 8px; 
            }
          </style>
        </head>
        <body>
          <img src="${previewUrl}" alt="${item.prompt}" />
        </body>
      </html>
    `)
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) { // 1分钟内
    return '刚刚'
  } else if (diff < 3600000) { // 1小时内
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) { // 1天内
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    return date.toLocaleDateString()
  }
}

// 处理图片加载错误
const handleImageError = (event) => {
  event.target.style.display = 'none'
  event.target.nextElementSibling.style.display = 'flex'
}

// 选择历史记录项
const selectHistoryItem = (item) => {
  emit('select-history', item)
  ElMessage.success('已加载历史记录')
}

// 删除历史记录项
const deleteHistoryItem = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除这条历史记录吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })

    // 显示加载提示
    const loadingMessage = ElMessage({
      message: '正在删除...',
      type: 'info',
      duration: 0
    })

    try {
      // 删除数据库记录
      await deleteHistory(id)

      // 立即从本地列表中移除该项，实现即时反馈
      historyList.value = historyList.value.filter(item => item.id !== id)
      totalCount.value = Math.max(0, totalCount.value - 1)

      // 清除所有缓存，确保下次加载时获取最新数据
      historyCache.value.clear()

      // 关闭加载提示
      loadingMessage.close()

      // 如果当前页没有数据了，且不是第一页，则跳转到上一页
      if (historyList.value.length === 0 && currentPage.value > 1) {
        currentPage.value -= 1
      }

      // 重新加载当前页数据
      await loadHistoryFromServer()

      ElMessage.success('删除成功')
    } catch (err) {
      loadingMessage.close()
      throw err
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除历史记录失败:', error)
      ElMessage.error('删除失败: ' + (error.message || '未知错误'))
    }
  }
}

// 清空所有历史记录
const clearAllHistory = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有历史记录吗？此操作不可恢复！', '确认清空', {
      type: 'warning'
    })
    
    await clearHistory()
    await loadHistoryFromServer()
    ElMessage.success('清空成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('清空历史记录失败:', error)
      ElMessage.error('清空失败: ' + (error.message || '未知错误'))
    }
  }
}

// 清理过期和超量缓存
const cleanupCache = () => {
  const now = Date.now()
  const CACHE_TTL = 5 * 60 * 1000 // 5分钟过期

  // 1. 删除过期缓存
  for (const [key, value] of historyCache.value.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      historyCache.value.delete(key)
    }
  }

  // 2. 如果缓存仍然超过最大限制，删除最旧的条目
  if (historyCache.value.size > MAX_CACHE_SIZE) {
    const entries = Array.from(historyCache.value.entries())
    // 按时间戳排序，最旧的在前
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    // 删除最旧的条目，直到缓存大小符合限制
    const toDelete = entries.slice(0, historyCache.value.size - MAX_CACHE_SIZE)
    toDelete.forEach(([key]) => historyCache.value.delete(key))
    console.log(`[缓存清理] 删除了${toDelete.length}个最旧的缓存条目`)
  }
}

// 从服务器加载历史记录
const loadHistoryFromServer = async () => {
  try {
    // 生成缓存键（包含过滤条件）
    const cacheKey = `${currentPage.value}-${pageSize.value}-${contentTypeFilter.value}`

    // 检查缓存
    if (historyCache.value.has(cacheKey)) {
      const cachedData = historyCache.value.get(cacheKey)
      historyList.value = cachedData.data
      totalCount.value = cachedData.total
      return
    }

    loading.value = true

    // 构建查询参数，包含模式筛选
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      search: ''
    }

    // 添加模式筛选
    if (contentTypeFilter.value === 'video') {
      params.mode = 'video-generation'
    } else if (contentTypeFilter.value === 'image') {
      params.mode = 'image' // 后端会处理为图片模式
    }

    const result = await getHistory(params)

    historyList.value = result.data || []
    totalCount.value = result.total || 0

    // 缓存结果
    historyCache.value.set(cacheKey, {
      data: historyList.value,
      total: totalCount.value,
      timestamp: Date.now()
    })

    // 清理过期缓存（超过5分钟的）并限制缓存大小
    cleanupCache()

  } catch (error) {
    console.error('加载历史记录失败:', error)
    ElMessage.error('加载历史记录失败: ' + (error.message || '未知错误'))
    historyList.value = []
  } finally {
    loading.value = false
  }
}

// 添加历史记录(供外部调用)
const addHistoryItem = async (item) => {
  console.log('[HistoryPanel] 收到新历史记录,准备刷新列表')

  // 立即清除缓存
  historyCache.value.clear()

  // 添加短暂延迟,确保服务器端已保存数据
  await new Promise(resolve => setTimeout(resolve, 500))

  // 重置到第一页
  currentPage.value = 1

  // 强制重新加载
  await loadHistoryFromServer()

  console.log('[HistoryPanel] 历史记录列表已刷新')
}

// 监听分页变化
const handlePageChange = () => {
  loadHistoryFromServer()
}

// 组件挂载时加载历史记录
onMounted(() => {
  loadHistoryFromServer()

  // 每2分钟定期清理缓存
  cacheCleanupTimer = setInterval(() => {
    cleanupCache()
  }, 2 * 60 * 1000)
})

// 组件卸载时清理资源
onUnmounted(() => {
  // 清除定时器
  if (cacheCleanupTimer) {
    clearInterval(cacheCleanupTimer)
    cacheCleanupTimer = null
  }

  // 清空缓存释放内存
  historyCache.value.clear()
  console.log('[HistoryPanel] 已清理缓存')
})

// 暴露方法给父组件
defineExpose({
  addHistoryItem
})
</script>

<style scoped>
.history-panel {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.history-header {
  display: flex;
  gap: 16px;
  margin: 16px 8px 20px 8px;
  align-items: center;
  padding: 14px 16px;
  background: white;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.content-filter {
  flex: 1;
}

.history-list {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-history,
.empty-history {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #94a3b8;
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  color: #cbd5e1;
}

.empty-history p {
  font-size: 15px;
  font-weight: 500;
}

.history-items {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 确保flex子元素可以正确收缩 */
}

/* 图片为主的历史记录网格 */
.history-image-grid {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px 16px 8px; /* 底部增加内边距 */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  grid-auto-rows: max-content; /* 确保每行根据内容自动调整高度 */
  gap: 12px;
  /* 移除固定的max-height，改用flex布局自动计算 */
}

/* 响应式网格布局 */
@media (max-width: 1400px) {
  .history-image-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }
}

@media (max-width: 1200px) {
  .history-image-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }
}

@media (max-width: 768px) {
  .history-image-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
}

/* 优化滚动条样式 */
.history-image-grid::-webkit-scrollbar {
  width: 8px;
}

.history-image-grid::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
}

.history-image-grid::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  border-radius: 4px;
  transition: background 0.3s ease;
}

.history-image-grid::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
}

/* 图片为主的历史记录卡片 */
.history-image-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  min-height: 140px; /* 确保最小高度 */
}

.history-image-card:hover {
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.2);
}

/* 删除按钮 */
.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  background: rgba(239, 68, 68, 0.95);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
}

.history-image-card:hover .delete-btn {
  opacity: 1;
  transform: scale(1);
}

.delete-btn:hover {
  background: rgba(220, 38, 38, 1);
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.6);
}

.delete-btn .el-icon {
  color: white;
  font-size: 14px;
}

/* 视频徽章位置调整 - 避免与删除按钮重叠 */
.video-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(59, 130, 246, 0.9);
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 18px;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
  z-index: 10;
  transition: all 0.3s ease;
}

.image-container {
  flex: 1;
  width: 100%;
  position: relative;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 100px; /* 确保有最小高度 */
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.history-image-card:hover .image-container img {
  transform: scale(1.1);
  filter: brightness(1.05);
}

.no-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  font-size: 48px;
}

/* 优化图片数量徽章 - 已移除 */

/* 底部信息条 */
.info-bar {
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  flex-shrink: 0; /* 防止信息条被压缩 */
}

.history-image-card:hover .info-bar {
  background: rgba(255, 255, 255, 1);
}

/* 优化模式徽章 */
.mode-badge {
  font-size: 11px;
  font-weight: 700;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
}

/* 移除模型徽章 */

.time-info {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}

/* 优化分页样式 */
.pagination {
  margin: 16px 8px 16px 8px;
  padding: 12px 0;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  background: white;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 内容类型筛选 */
.content-filter {
  flex: 1;
}

/* 优化视频样式 */
.video-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.history-image-card:hover .video-thumbnail {
  transform: scale(1.1);
  filter: brightness(1.05);
}

.history-image-card:hover .video-badge {
  transform: scale(1.05);
}

.video-badge .el-icon {
  font-size: 16px;
}

/* 移除旧的滚动条样式 */
.history-grid::-webkit-scrollbar {
  width: 6px;
}

.history-grid::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.history-grid::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.history-grid::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.clear-history-btn {
  margin-left: auto;
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.08) !important;
  border: 1px solid rgba(239, 68, 68, 0.15) !important;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  border-radius: 8px !important;
  padding: 6px 12px !important;
  height: 28px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.clear-history-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.clear-history-btn:active {
  transform: translateY(0);
  background: rgba(239, 68, 68, 0.2) !important;
}

.clear-history-btn :deep(.el-icon) {
  margin-right: 4px;
}
</style>
