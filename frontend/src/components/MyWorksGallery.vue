<template>
  <div class="my-works-gallery">
    <!-- 图片网格 - 无限滚动 -->
    <div 
      class="works-grid-container" 
      @scroll="handleScroll"
      ref="scrollContainer"
    >
      <!-- 加载状态 -->
      <div v-if="initialLoading" class="loading-state">
        <LoadingCard 
          title="加载作品中..." 
          subtitle="正在获取您的作品列表"
          size="medium"
        />
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="worksList.length === 0" class="empty-state">
        <el-icon class="empty-icon"><Picture /></el-icon>
        <p class="empty-text">暂无作品</p>
        <p class="empty-hint">发布您的第一个作品到首页吧！</p>
      </div>
      
      <!-- 作品网格 -->
      <div v-else class="works-grid">
        <div
          v-for="work in worksList"
          :key="work.id"
          class="work-card"
          @click="handleViewDetail(work)"
        >
          <!-- 作品封面 -->
          <div class="work-media">
            <!-- 视频 -->
            <video 
              v-if="work.content_type === 'video'" 
              :src="work.cover_url" 
              class="media-video"
              muted
              preload="metadata"
            />
            
            <!-- 图片 -->
            <img 
              v-else
              :src="work.cover_url" 
              :alt="work.title || work.prompt"
              class="media-image"
            />
            
            <!-- 上架状态徽章 -->
            <div class="publish-status" :class="{ 'published': work.is_published }">
              {{ work.is_published ? '已上架' : '已下架' }}
            </div>
            
            <!-- 视频标识 -->
            <div v-if="work.content_type === 'video'" class="video-badge">
              <el-icon><VideoPlay /></el-icon>
            </div>
          </div>
          
          <!-- 作品信息 -->
          <div class="work-info-overlay">
            <!-- 统计信息 -->
            <div class="stats-row">
              <div class="stat-item">
                <el-icon><View /></el-icon>
                <span>{{ formatCount(work.views_count) }}</span>
              </div>
              <div class="stat-item like-stat" :class="{ 'liked': work.isLiked }">
                <el-icon @click.stop="handleLike(work)">
                  <component :is="work.isLiked ? 'StarFilled' : 'Star'" />
                </el-icon>
                <span>{{ formatCount(work.likes_count) }}</span>
              </div>
            </div>
            
            <!-- 提示词 -->
            <p class="work-prompt">{{ work.prompt }}</p>
            
            <!-- 操作按钮 -->
            <div class="action-buttons">
              <el-button 
                v-if="work.is_published"
                size="small" 
                type="warning" 
                @click.stop="handleUnpublish(work)"
              >
                下架
              </el-button>
              <el-button 
                v-else
                size="small" 
                type="success" 
                @click.stop="handleRepublish(work)"
              >
                上架
              </el-button>
              <el-button 
                size="small" 
                type="primary" 
                @click.stop="handleViewDetail(work)"
              >
                详情
              </el-button>
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
      <div v-if="!hasMore && worksList.length > 0" class="no-more">
        <span>已经到底了</span>
      </div>
    </div>
    
    <!-- 作品详情弹窗 -->
    <WorkDetailDialog 
      v-model="showDetailDialog"
      :work="selectedWork"
      @like="handleLikeFromDialog"
      @publish-change="handlePublishChange"
      @deleted="handleWorkDeleted"
      @refresh="loadWorks"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, VideoPlay, View, Star, StarFilled, Loading } from '@element-plus/icons-vue'
import LoadingCard from './LoadingCard.vue'
import WorkDetailDialog from './WorkDetailDialog.vue'
import { getUserWorks, likeWork, unlikeWork, getLikeStatus, unpublishWork, republishWork } from '../api/worksApi'

// 定义事件
const emit = defineEmits(['select-work'])

// 响应式数据
const initialLoading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const scrollContainer = ref(null)
const showDetailDialog = ref(false)
const selectedWork = ref(null)

// 分页参数
const currentPage = ref(1)
const pageSize = 30

// 作品列表
const worksList = ref([])

// 格式化数字
const formatCount = (count) => {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + 'w'
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k'
  }
  return count
}

// 加载作品列表
const loadWorks = async (append = false) => {
  try {
    if (append) {
      loadingMore.value = true
    } else {
      initialLoading.value = true
      currentPage.value = 1
      worksList.value = []
    }
    
    const response = await getUserWorks({
      page: currentPage.value,
      pageSize
    })
    
    if (response.data.success) {
      const works = response.data.data
      
      // 批量检查点赞状态
      const worksWithLikeStatus = await Promise.all(
        works.map(async (work) => {
          try {
            const likeResponse = await getLikeStatus(work.id)
            return {
              ...work,
              isLiked: likeResponse.data.liked || false
            }
          } catch (error) {
            return {
              ...work,
              isLiked: false
            }
          }
        })
      )
      
      if (append) {
        worksList.value.push(...worksWithLikeStatus)
      } else {
        worksList.value = worksWithLikeStatus
      }
      
      // 检查是否还有更多
      const total = response.data.pagination.total
      hasMore.value = currentPage.value * pageSize < total
    }
    
  } catch (error) {
    console.error('加载作品列表失败:', error)
    ElMessage.error('加载作品列表失败')
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
    await loadWorks(true)
  }
}

// 点赞/取消点赞
const handleLike = async (work) => {
  const originalLikedState = work.isLiked
  const originalLikesCount = work.likes_count
  
  // 乐观更新
  work.isLiked = !work.isLiked
  work.likes_count = work.isLiked ? work.likes_count + 1 : work.likes_count - 1
  
  try {
    if (work.isLiked) {
      await likeWork(work.id)
    } else {
      await unlikeWork(work.id)
    }
  } catch (error) {
    // 回滚状态
    work.isLiked = originalLikedState
    work.likes_count = originalLikesCount
    console.error('点赞操作失败:', error)
    ElMessage.error('操作失败')
  }
}

// 从详情弹窗点赞
const handleLikeFromDialog = async (workId, isLiked) => {
  const work = worksList.value.find(w => w.id === workId)
  if (work) {
    work.isLiked = isLiked
    work.likes_count = isLiked ? work.likes_count + 1 : work.likes_count - 1
  }
}

// 下架作品
const handleUnpublish = async (work) => {
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
    
    const response = await unpublishWork(work.id)
    if (response.data.success) {
      work.is_published = false
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
const handleRepublish = async (work) => {
  try {
    const response = await republishWork(work.id)
    if (response.data.success) {
      work.is_published = true
      ElMessage.success('作品已重新上架')
    }
  } catch (error) {
    console.error('上架失败:', error)
    ElMessage.error('上架失败')
  }
}

// 查看详情
const handleViewDetail = (work) => {
  selectedWork.value = work
  showDetailDialog.value = true
}

// 处理发布状态变化
const handlePublishChange = (workId, isPublished) => {
  const work = worksList.value.find(w => w.id === workId)
  if (work) {
    work.is_published = isPublished
  }
}

const handleWorkDeleted = (workId) => {
  worksList.value = worksList.value.filter(w => Number(w.id) !== Number(workId))
  if (selectedWork.value && Number(selectedWork.value.id) === Number(workId)) {
    selectedWork.value = null
    showDetailDialog.value = false
  }
}

// 组件挂载
onMounted(async () => {
  await loadWorks()
})
</script>

<style scoped>
.my-works-gallery {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

/* 网格容器 */
.works-grid-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
}

/* 滚动条样式 */
.works-grid-container::-webkit-scrollbar {
  width: 8px;
}

.works-grid-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.works-grid-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.works-grid-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 网格布局 */
.works-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  width: 100%;
  align-items: start;
}

/* 娴ｆ粌鎼ч崡锛勫 - 玻璃拟态重构 */
.work-card {
  position: relative;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-top: 1px solid var(--glass-highlight);
  border-left: 1px solid var(--glass-highlight);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--glass-shadow);
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
              box-shadow 0.4s ease, 
              background 0.4s ease;
}

.work-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.4), 
              0 0 20px rgba(0, 184, 230, 0.2);
  background: var(--glass-level-2-bg);
}

.work-card:hover .work-info-overlay {
  opacity: 1;
}

/* 娴ｆ粌鎼ф刊鎺嶇秼 */
.work-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: transparent;
  overflow: hidden;
}

.media-image,
.media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.work-card:hover .media-image,
.work-card:hover .media-video {
  transform: scale(1.08);
}

/* 上架状态徽章 */
.publish-status {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(156, 163, 175, 0.95);
  color: white;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.publish-status.published {
  background: rgba(34, 197, 94, 0.95);
}

/* 视频标识 */
.video-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.video-badge .el-icon {
  font-size: 20px;
}

/* 作品信息悬停层 */
.work-info-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  color: white;
  padding: 16px 12px 12px 12px;
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 统计信息行 */
.stats-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.stat-item .el-icon {
  font-size: 18px;
}

.like-stat {
  cursor: pointer;
  transition: all 0.2s ease;
}

.like-stat:hover {
  transform: scale(1.1);
}

.like-stat.liked {
  color: #ff5873;
  animation: likeAnimation 0.3s ease;
}

@keyframes likeAnimation {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* 提示词 */
.work-prompt {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.9;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons .el-button {
  flex: 1;
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
  .works-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
}

@media (max-width: 1400px) {
  .works-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 1024px) {
  .works-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
  
  .works-grid-container {
    padding: 16px;
  }
}

@media (max-width: 768px) {
  .works-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  
  .works-grid-container {
    padding: 12px;
  }
}
</style>




