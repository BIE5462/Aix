<template>
  <div class="community-home">
    <!-- 顶部筛选栏 -->
    <div class="filter-bar">
      <div class="filter-section">
        <span class="filter-label">类型:</span>
        <el-radio-group v-model="filters.type" size="small" @change="handleFilterChange">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="image">图片</el-radio-button>
          <el-radio-button label="video">视频</el-radio-button>
        </el-radio-group>
      </div>
      
      <div class="filter-section">
        <span class="filter-label">排序:</span>
        <el-radio-group v-model="filters.sort" size="small" @change="handleFilterChange">
          <el-radio-button label="latest">最新</el-radio-button>
          <el-radio-button label="hot">热门</el-radio-button>
        </el-radio-group>
      </div>
      
      <div class="filter-section" v-if="availableModels.length > 0">
        <span class="filter-label">模型:</span>
        <el-select 
          v-model="filters.model" 
          placeholder="全部模型" 
          size="small" 
          clearable
          @change="handleFilterChange"
          style="width: 180px"
        >
          <el-option label="全部模型" value=""></el-option>
          <el-option 
            v-for="model in availableModels" 
            :key="model" 
            :label="model" 
            :value="model"
          ></el-option>
        </el-select>
      </div>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="loading && works.length === 0" class="loading-container">
      <el-skeleton :rows="6" animated />
    </div>
    
    <!-- 空状态 -->
    <div v-else-if="!loading && works.length === 0" class="empty-state">
      <el-empty description="暂无作品">
        <el-button type="primary" @click="refreshWorks">
          <el-icon style="margin-right: 4px"><Refresh /></el-icon>
          刷新
        </el-button>
      </el-empty>
    </div>
    
    <!-- 瀑布流作品列表 -->
    <div v-else class="works-container">
      <div class="masonry-grid">
        <WorkCard
          v-for="work in works"
          :key="work.id"
          :work="work"
          :is-logged-in="isLoggedIn"
          @click="handleWorkClick(work)"
          @use-template="handleUseTemplate"
        />
      </div>
      
      <!-- 加载更多 -->
      <div v-if="hasMore" class="load-more">
        <el-button 
          v-if="!loadingMore"
          type="primary" 
          plain
          @click="loadMore"
        >
          加载更多
        </el-button>
        <el-skeleton v-else :rows="2" animated />
      </div>
      
      <!-- 没有更多了 -->
      <div v-else-if="works.length > 0" class="no-more">
        <span>没有更多作品了</span>
      </div>
    </div>
    
    <!-- 作品详情弹窗 -->
    <el-dialog
      v-model="showWorkDetail"
      :title="currentWork?.title || '作品详情'"
      width="800px"
      class="work-detail-dialog"
    >
      <div v-if="currentWork" class="work-detail">
        <!-- 作品图片/视频 -->
        <div class="detail-media">
          <img 
            v-if="currentWork.contentType === 'image'"
            :src="currentWork.coverUrl" 
            alt="作品"
            class="detail-image"
          />
          <video
            v-else
            :src="currentWork.coverUrl"
            class="detail-video"
            controls
          ></video>
        </div>
        
        <!-- 作品信息 -->
        <div class="detail-info">
          <div class="detail-user">
            <el-avatar :size="40">
              {{ currentWork.username?.charAt(0)?.toUpperCase() }}
            </el-avatar>
            <div class="user-details">
              <div class="username">{{ currentWork.username }}</div>
              <div class="create-time">{{ formatTime(currentWork.createdAt) }}</div>
            </div>
          </div>
          
          <div class="detail-section">
            <h4>提示词</h4>
            <p class="prompt-text">{{ currentWork.prompt }}</p>
          </div>
          
          <div class="detail-section">
            <h4>生成参数</h4>
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="模型">
                {{ currentWork.modelName || currentWork.modelId || '未知' }}
              </el-descriptions-item>
              <el-descriptions-item label="尺寸">
                {{ currentWork.size || '未知' }}
              </el-descriptions-item>
              <el-descriptions-item label="类型">
                {{ currentWork.contentType === 'image' ? '图片' : '视频' }}
              </el-descriptions-item>
              <el-descriptions-item label="浏览">
                {{ currentWork.viewsCount || 0 }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showWorkDetail = false">关闭</el-button>
        <el-button 
          type="primary" 
          @click="handleUseTemplateFromDetail"
        >
          <el-icon style="margin-right: 4px"><Star /></el-icon>
          一键同款
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Star } from '@element-plus/icons-vue'
import WorkCard from './WorkCard.vue'
import { getPublicWorks, incrementWorkViews } from '../api/worksApi'

// Props
const props = defineProps({
  isLoggedIn: {
    type: Boolean,
    default: false
  }
})

// 定义事件
const emit = defineEmits(['use-template', 'need-login'])

// 响应式数据
const works = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const showWorkDetail = ref(false)
const currentWork = ref(null)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const availableModels = ref([])

// 筛选条件
const filters = reactive({
  type: '',
  model: '',
  sort: 'latest'
})

// 是否还有更多
const hasMore = computed(() => {
  return works.value.length < total.value
})

// 加载作品列表
const loadWorks = async (isLoadMore = false) => {
  try {
    if (isLoadMore) {
      loadingMore.value = true
    } else {
      loading.value = true
    }
    
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      ...filters
    }
    
    const response = await getPublicWorks(params)
    
    if (response.data.success) {
      const newWorks = response.data.data || []
      
      if (isLoadMore) {
        works.value = [...works.value, ...newWorks]
      } else {
        works.value = newWorks
      }
      
      total.value = response.data.pagination?.total || 0
      
      // 提取可用的模型列表
      extractAvailableModels(works.value)
    } else {
      ElMessage.error('加载作品失败')
    }
  } catch (error) {
    console.error('加载作品错误:', error)
    ElMessage.error('加载作品失败，请稍后重试')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// 提取可用的模型列表
const extractAvailableModels = (worksList) => {
  const modelSet = new Set()
  worksList.forEach(work => {
    if (work.modelName) {
      modelSet.add(work.modelName)
    } else if (work.modelId) {
      modelSet.add(work.modelId)
    }
  })
  availableModels.value = Array.from(modelSet)
}

// 处理筛选变化
const handleFilterChange = () => {
  currentPage.value = 1
  loadWorks()
}

// 加载更多
const loadMore = () => {
  currentPage.value++
  loadWorks(true)
}

// 刷新作品
const refreshWorks = () => {
  currentPage.value = 1
  loadWorks()
}

// 处理作品点击
const handleWorkClick = async (work) => {
  currentWork.value = work
  showWorkDetail.value = true
  
  // 增加浏览数（异步，不阻塞）
  try {
    await incrementWorkViews(work.id)
  } catch (error) {
    console.error('增加浏览数失败:', error)
  }
}

// 处理一键同款
const handleUseTemplate = ({ work, needLogin }) => {
  if (needLogin) {
    emit('need-login')
  } else {
    console.log('[一键同款] 作品数据:', work)
    console.log('[一键同款] 传递参数:', {
      prompt: work.prompt,
      modelId: work.model_id || work.modelId,
      modelName: work.model_name || work.modelName,
      size: work.size,
      contentType: work.content_type || work.contentType,
      historyId: work.history_id || work.historyId,
      workId: work.id
    })

    emit('use-template', {
      source: 'community-work',
      id: work.id,
      workId: work.id,
      historyId: work.history_id || work.historyId || null,
      prompt: work.prompt,
      modelId: work.model_id || work.modelId,
      modelName: work.model_name || work.modelName,
      size: work.size,
      contentType: work.content_type || work.contentType
    })
  }
}

// 从详情页使用一键同款
const handleUseTemplateFromDetail = () => {
  if (!props.isLoggedIn) {
    ElMessage.warning('请先登录后使用一键同款功能')
    emit('need-login')
  } else {
    showWorkDetail.value = false
    handleUseTemplate({ work: currentWork.value, needLogin: false })
  }
}

// 格式化时间
const formatTime = (dateString) => {
  if (!dateString) return ''
  
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  
  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return Math.floor(diff / minute) + ' 分钟前'
  } else if (diff < day) {
    return Math.floor(diff / hour) + ' 小时前'
  } else if (diff < 7 * day) {
    return Math.floor(diff / day) + ' 天前'
  } else {
    return date.toLocaleDateString('zh-CN')
  }
}

// 挂载时加载数据
onMounted(() => {
  loadWorks()
})
</script>

<style scoped>
.community-home {
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  background: transparent;
  padding: 20px;
}

/* 筛选栏 */
.filter-bar {
  background: var(--glass-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  margin-bottom: 20px;
  box-shadow: var(--glass-shadow);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  gap: 30px;
  flex-wrap: wrap;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
}

/* 加载状态 */
.loading-container {
  background: var(--glass-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-lg);
  padding: 30px;
  box-shadow: var(--glass-shadow);
  border: 1px solid var(--glass-border);
}

/* 空状态 */
.empty-state {
  background: var(--glass-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-lg);
  padding: 60px 20px;
  text-align: center;
  box-shadow: var(--glass-shadow);
  border: 1px solid var(--glass-border);
}

/* 作品容器 */
.works-container {
  width: 100%;
}

/* 瀑布流布局 */
.masonry-grid {
  columns: 4;
  column-gap: 16px;
}

@media (max-width: 1600px) {
  .masonry-grid {
    columns: 3;
  }
}

@media (max-width: 1200px) {
  .masonry-grid {
    columns: 2;
  }
}

@media (max-width: 768px) {
  .masonry-grid {
    columns: 1;
  }
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: 30px 0;
}

.no-more {
  text-align: center;
  padding: 30px 0;
  color: var(--text-muted);
  font-size: 14px;
}

/* 作品详情弹窗 */
.work-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-media {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
}

.detail-image,
.detail-video {
  width: 100%;
  height: auto;
  display: block;
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-details {
  flex: 1;
}

.username {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.create-time {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 10px 0;
}

.prompt-text {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

