<template>
  <div class="full-history-gallery">
    <!-- 标签页 -->
    <el-tabs v-model="activeTab" class="history-tabs">
      <el-tab-pane label="历史记录" name="history">
        <!-- 顶部筛选栏 -->
        <div class="gallery-header">
          <div class="header-content">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索历史记录..."
              :prefix-icon="Search"
              clearable
              class="search-input"
              @input="handleSearchChange"
            />
            
            <el-radio-group v-model="filterType" size="default" @change="handleFilterChange">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="image">图片</el-radio-button>
              <el-radio-button label="video">视频</el-radio-button>
            </el-radio-group>
            
            <el-button type="danger" @click="clearAllHistory" :icon="Delete">
              清空历史
            </el-button>
          </div>
        </div>

    <!-- 图片网格 - 无限滚动 -->
    <div 
      class="gallery-grid-container" 
      @scroll="handleScroll"
      ref="scrollContainer"
    >
      <!-- 加载状态 -->
      <div v-if="initialLoading" class="loading-state">
        <LoadingCard 
          title="加载历史记录中..." 
          subtitle="正在获取您的生成历史"
          size="medium"
        />
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="galleryItems.length === 0" class="empty-state">
        <el-icon class="empty-icon"><Document /></el-icon>
        <p class="empty-text">暂无历史记录</p>
        <p class="empty-hint">开始创作您的第一张作品吧！</p>
      </div>
      
      <!-- 瀑布流网格 -->
      <div v-else class="gallery-grid">
        <div
          v-for="(item, index) in galleryItems"
          :key="`${item.historyId}-${item.index}`"
          class="gallery-item"
          @click="handleItemClick(item)"
        >
          <!-- 图片/视频内容 -->
          <div class="item-media">
            <!-- 视频 -->
            <video 
              v-if="item.type === 'video'" 
              :src="item.url" 
              class="media-video"
              muted
              preload="metadata"
              @error="handleMediaError(item)"
            />
            
            <!-- 图片 -->
            <img 
              v-else-if="item.url"
              :src="item.url" 
              :alt="item.prompt"
              class="media-image"
              @error="handleMediaError(item)"
            />
            
            <!-- 失败占位符 -->
            <div v-else class="media-placeholder">
              <img src="/erre.png" alt="加载失败" />
            </div>
            
            <!-- 视频标识 -->
            <div v-if="item.type === 'video'" class="video-badge">
              <el-icon><VideoPlay /></el-icon>
              <span>视频</span>
            </div>
            
            <!-- 失败标识 -->
            <div v-if="item.status === 'failed'" class="failed-badge-corner">
              <el-icon size="12"><CircleClose /></el-icon>
              <span>失败</span>
            </div>
          </div>
          
          <!-- 悬停信息 -->
          <div class="item-info">
            <div class="info-top">
              <span class="mode-label">{{ item.modeText }}</span>
              <span v-if="item.modelName" class="model-label">{{ item.modelName }}</span>
            </div>
            <p class="prompt-text">{{ item.prompt || '无提示词' }}</p>
            <div class="info-bottom">
              <span class="time-text">{{ formatTime(item.createdAt) }}</span>
              <el-button 
                type="danger" 
                size="small" 
                :icon="Delete" 
                circle
                @click.stop="handleDeleteItem(item)"
                class="delete-btn"
              />
            </div>
          </div>
        </div>
      </div>
      
      <!-- 底部加载更多 -->
      <div v-if="loadingMore" class="loading-more">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      
      <!-- 没有更多了 -->
      <div v-if="!hasMore && galleryItems.length > 0" class="no-more">
        <span>已经到底了</span>
      </div>
    </div>
      </el-tab-pane>
      
      <!-- 我的作品标签页 -->
      <el-tab-pane label="我的作品" name="works">
        <MyWorksGallery @select-work="handleWorkSelection" />
      </el-tab-pane>
    </el-tabs>
    
    <!-- 历史记录详情弹窗 -->
    <HistoryDetailDialog 
      v-model="showHistoryDetail"
      :history-item="selectedHistoryItem"
      @use-history="handleUseHistory"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Delete, Document, Loading, VideoPlay, CircleClose } from '@element-plus/icons-vue'
import LoadingCard from './LoadingCard.vue'
import MyWorksGallery from './MyWorksGallery.vue'
import HistoryDetailDialog from './HistoryDetailDialog.vue'
import { getHistory, deleteHistory, clearHistory } from '../api/imageApi'
import { getVideoHistory } from '../api/videoApi'

// 定义事件
const emit = defineEmits(['select-history', 'select-work'])

// 标签页状态
const activeTab = ref('history')

// 详情弹窗状态
const showHistoryDetail = ref(false)
const selectedHistoryItem = ref(null)

// 响应式数据
const searchKeyword = ref('')
const filterType = ref('all')
const initialLoading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const scrollContainer = ref(null)

// 分页参数
const currentPage = ref(1)
const pageSize = 30 // 每页30个结果
const totalCount = ref(0) // 总记录数

// 历史记录原始数据
const historyList = ref([])
const videoHistoryList = ref([])

// 画廊展示数据（扁平化的所有图片/视频）
const galleryItems = ref([])

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

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚'
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  }
  // 小于1天
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
  // 小于7天
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`
  }
  
  // 超过7天显示具体日期
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const currentYear = now.getFullYear()
  
  if (year === currentYear) {
    return `${month}/${day}`
  }
  return `${year}/${month}/${day}`
}

// 加载历史记录
const loadHistory = async (append = false) => {
  try {
    if (append) {
      loadingMore.value = true
    } else {
      initialLoading.value = true
      currentPage.value = 1
      galleryItems.value = []
    }
    
    console.log('[全屏历史] 加载数据:', { 
      page: currentPage.value, 
      append, 
      filterType: filterType.value,
      searchKeyword: searchKeyword.value 
    })
    
    // 根据筛选类型调用不同的API
    let imageResponse = { data: [], total: 0 }
    let videoResponse = { data: [], total: 0 }
    
    if (filterType.value === 'video') {
      // 只加载视频
      videoResponse = await getVideoHistory({
        page: currentPage.value,
        pageSize: pageSize,
        searchKeyword: searchKeyword.value
      })
    } else if (filterType.value === 'image') {
      // 只加载图片
      imageResponse = await getHistory({
        page: currentPage.value,
        pageSize: pageSize,
        search: searchKeyword.value,
        mode: 'image'
      })
    } else {
      // 加载全部：需要并发请求并合并
      const [imgResp, vidResp] = await Promise.all([
        getHistory({
          page: currentPage.value,
          pageSize: Math.floor(pageSize / 2), // 各取一半
          search: searchKeyword.value
        }),
        getVideoHistory({
          page: currentPage.value,
          pageSize: Math.floor(pageSize / 2),
          searchKeyword: searchKeyword.value
        })
      ])
      imageResponse = imgResp
      videoResponse = vidResp
    }
    
    console.log('[全屏历史] API返回:', {
      imageCount: imageResponse.data?.length || 0,
      videoCount: videoResponse.data?.length || 0,
      imageTotal: imageResponse.total,
      videoTotal: videoResponse.total
    })
    
    // 合并当前页的历史记录
    const currentPageHistory = [
      ...(imageResponse.data || []).map(item => ({ ...item, isVideo: false })),
      ...(videoResponse.data || []).map(item => ({ ...item, isVideo: true, mode: 'video-generation' }))
    ].sort((a, b) => b.createdAt - a.createdAt)
    
    // 更新总数
    if (filterType.value === 'video') {
      totalCount.value = videoResponse.total || 0
    } else if (filterType.value === 'image') {
      totalCount.value = imageResponse.total || 0
    } else {
      totalCount.value = (imageResponse.total || 0) + (videoResponse.total || 0)
    }
    
    console.log('[全屏历史] 当前页历史记录数:', currentPageHistory.length, '总数:', totalCount.value)
    
    // 扁平化为画廊项目
    const newItems = []
    currentPageHistory.forEach(history => {
      if (history.isVideo) {
        // 视频：添加单个视频项
        if (history.videoUrl) {
          newItems.push({
            historyId: history.id,
            index: 0,
            type: 'video',
            url: history.videoUrl,
            prompt: history.prompt,
            modelName: history.modelName,
            modeText: getModeText(history.mode),
            createdAt: history.createdAt,
            status: history.status || 'completed',
            originalHistory: history
          })
        } else {
          // 无视频URL，显示为失败
          newItems.push({
            historyId: history.id,
            index: 0,
            type: 'video',
            url: null,
            prompt: history.prompt,
            modelName: history.modelName,
            modeText: getModeText(history.mode),
            createdAt: history.createdAt,
            status: 'failed',
            originalHistory: history
          })
        }
      } else {
        // 图片：展开所有图片
        const images = history.generatedImages || []
        if (images.length > 0) {
          images.forEach((img, idx) => {
            newItems.push({
              historyId: history.id,
              index: idx,
              type: 'image',
              url: img.url || img,
              prompt: history.prompt,
              modelName: history.modelName,
              modeText: getModeText(history.mode),
              createdAt: history.createdAt,
              status: history.status || 'completed',
              originalHistory: history
            })
          })
        } else {
          // 无图片，显示为失败
          newItems.push({
            historyId: history.id,
            index: 0,
            type: 'image',
            url: null,
            prompt: history.prompt,
            modelName: history.modelName,
            modeText: getModeText(history.mode),
            createdAt: history.createdAt,
            status: 'failed',
            originalHistory: history
          })
        }
      }
    })
    
    console.log('[全屏历史] 生成画廊项目数:', newItems.length)
    
    if (append) {
      // 追加模式：将新项目追加到现有列表
      galleryItems.value.push(...newItems)
      console.log('[全屏历史] 追加后总项目数:', galleryItems.value.length)
    } else {
      // 替换模式：直接替换
      galleryItems.value = newItems
      console.log('[全屏历史] 替换后总项目数:', galleryItems.value.length)
    }
    
    // 检查是否还有更多数据
    // 计算当前已加载的记录数（不是项目数，因为一个历史记录可能有多个图片）
    const loadedHistoryCount = currentPage.value * pageSize
    hasMore.value = loadedHistoryCount < totalCount.value
    
    console.log('[全屏历史] 是否还有更多:', {
      hasMore: hasMore.value,
      loadedHistoryCount,
      totalCount: totalCount.value,
      currentPage: currentPage.value
    })
    
  } catch (error) {
    console.error('加载历史记录失败:', error)
    ElMessage.error('加载历史记录失败')
  } finally {
    initialLoading.value = false
    loadingMore.value = false
  }
}

// 滚动处理
const handleScroll = async () => {
  if (!scrollContainer.value || loadingMore.value || !hasMore.value) {
    return
  }
  
  const container = scrollContainer.value
  const scrollTop = container.scrollTop
  const scrollHeight = container.scrollHeight
  const clientHeight = container.clientHeight
  
  // 距离底部100px时触发加载
  if (scrollHeight - scrollTop - clientHeight < 100) {
    currentPage.value++
    await loadHistory(true)
  }
}

// 搜索变化
const handleSearchChange = () => {
  currentPage.value = 1
  galleryItems.value = []
  loadHistory(false) // 不使用追加模式
}

// 筛选变化
const handleFilterChange = () => {
  currentPage.value = 1
  galleryItems.value = []
  loadHistory(false) // 不使用追加模式
}

// 点击项目 - 打开详情弹窗
const handleItemClick = (item) => {
  selectedHistoryItem.value = item.originalHistory
  showHistoryDetail.value = true
}

// 从详情弹窗使用历史记录
const handleUseHistory = (historyItem) => {
  emit('select-history', historyItem)
  ElMessage.success('已加载到工作台')
}

// 选择作品
const handleWorkSelection = (work) => {
  emit('select-work', work)
}

// 删除单个项目
const handleDeleteItem = async (item) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条记录吗？',
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    // 删除整个历史任务
    if (item.originalHistory.isVideo) {
      // TODO: 实现视频历史删除API
      ElMessage.info('视频历史删除功能开发中')
    } else {
      await deleteHistory(item.historyId)
      ElMessage.success('删除成功')
      
      // 重新加载：需要加载从第1页到当前页的所有数据
      const targetPage = currentPage.value
      galleryItems.value = []
      currentPage.value = 1
      
      // 加载所有已显示的页
      for (let i = 1; i <= targetPage; i++) {
        currentPage.value = i
        await loadHistory(i > 1) // 第1页替换，后续页追加
      }
      currentPage.value = targetPage
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 清空所有历史
const clearAllHistory = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有历史记录吗？此操作不可恢复！',
      '确认清空',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    await clearHistory()
    ElMessage.success('已清空所有历史记录')
    
    // 清空数据并重新加载
    currentPage.value = 1
    galleryItems.value = []
    historyList.value = []
    videoHistoryList.value = []
    await loadHistory(false) // 不使用追加模式
  } catch (error) {
    if (error !== 'cancel') {
      console.error('清空历史失败:', error)
      ElMessage.error('清空历史失败')
    }
  }
}

// 媒体加载错误
const handleMediaError = (item) => {
  console.error('媒体加载失败:', item.url)
}

// 组件挂载
onMounted(async () => {
  await loadHistory(false) // 初始加载，不使用追加模式
})
</script>

<style scoped>
.full-history-gallery {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

/* 标签页 */
.history-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.history-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.history-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.history-tabs :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 头部 */
.gallery-header {
  padding: 20px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 100%;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

/* 网格容器 */
.gallery-grid-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
}

/* 滚动条样式 */
.gallery-grid-container::-webkit-scrollbar {
  width: 8px;
}

.gallery-grid-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.gallery-grid-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.gallery-grid-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 网格布局 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  width: 100%;
}

/* 画廊项目 */
.gallery-item {
  position: relative;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
}

.gallery-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.gallery-item:hover .item-info {
  opacity: 1;
}

/* 媒体内容 */
.item-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: #f3f4f6;
  overflow: hidden;
}

.media-image,
.media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.media-placeholder img {
  max-width: 60%;
  max-height: 60%;
  opacity: 0.5;
}

/* 视频标识 */
.video-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(10px);
}

.video-badge .el-icon {
  font-size: 16px;
}

/* 失败标识 */
.failed-badge-corner {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(244, 67, 54, 0.95);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 6px rgba(244, 67, 54, 0.4);
  z-index: 5;
}

/* 悬停信息 */
.item-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
  color: white;
  padding: 16px 12px 12px 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-label {
  background: rgba(255, 255, 255, 0.25);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.model-label {
  background: rgba(255, 88, 115, 0.85);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.prompt-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.time-text {
  font-size: 11px;
  opacity: 0.8;
}

.delete-btn {
  opacity: 0.9;
}

.delete-btn:hover {
  opacity: 1;
}

/* 加载状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  width: 100%;
}

.empty-icon {
  font-size: 64px;
  color: #d1d5db;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 18px;
  font-weight: 600;
  color: #6b7280;
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 14px;
  color: #9ca3af;
  margin: 0;
}

/* 加载更多 */
.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #6b7280;
  font-size: 14px;
}

.loading-more .el-icon {
  font-size: 18px;
}

/* 没有更多 */
.no-more {
  text-align: center;
  padding: 24px;
  color: #9ca3af;
  font-size: 13px;
}

/* 响应式 */
@media (min-width: 1920px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
}

@media (max-width: 1400px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 1024px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
  
  .gallery-grid-container {
    padding: 16px;
  }
}

@media (max-width: 768px) {
  .header-content {
    flex-wrap: wrap;
  }
  
  .search-input {
    max-width: 100%;
    order: -1;
    flex-basis: 100%;
  }
  
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  
  .gallery-grid-container {
    padding: 12px;
  }
  
  .gallery-header {
    padding: 16px;
  }
}
</style>

