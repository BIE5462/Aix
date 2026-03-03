<template>
  <div class="my-works-page">
    <el-tabs v-model="activeTab" class="page-tabs">
      <el-tab-pane label="生成历史" name="history">
        <div class="filter-bar">
          <el-radio-group v-model="filterType" size="default" @change="onFilterChange">
            <el-radio-button label="all">全部</el-radio-button>
            <el-radio-button label="image">图片</el-radio-button>
            <el-radio-button label="video">视频</el-radio-button>
          </el-radio-group>
          <el-select v-model="filterModelId" placeholder="全部模型" clearable size="default" class="model-select" @change="onFilterChange">
            <el-option label="全部模型" :value="null" />
            <el-option v-for="m in allModels" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
          <el-input v-model="searchKeyword" placeholder="搜索提示词..." clearable class="search-input" @clear="onFilterChange" @keyup.enter="onFilterChange">
            <template #append>
              <el-button :icon="Search" @click="onFilterChange">搜索</el-button>
            </template>
          </el-input>
        </div>
        <div class="history-scroll" ref="historyScrollRef" @scroll="onHistoryScroll">
          <div v-if="initialLoading" class="loading-wrap">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <p>加载历史记录中...</p>
          </div>
          <template v-else-if="historyList.length > 0">
            <template v-for="(group, groupKey) in dateGroups" :key="groupKey">
              <div class="date-group-title">{{ group.label }}</div>
              <div class="history-cards">
                <div v-for="item in group.items" :key="item.id" class="history-card" @click="openDetail(item)">
                  <div class="card-media">
                    <video v-if="item.mode === 'video-generation' && getVideoUrl(item)" :src="getVideoUrl(item)" class="media-video" muted preload="metadata" />
                    <img v-else-if="getCoverUrl(item)" :src="getCoverUrl(item)" :alt="item.prompt" class="media-image" />
                    <div v-else class="media-placeholder">
                      <el-icon><Picture /></el-icon>
                      <span>无封面</span>
                    </div>
                    <div v-if="item.mode === 'video-generation'" class="video-badge"><el-icon><VideoPlay /></el-icon></div>
                  </div>
                  <div class="card-info">
                    <p class="card-prompt">{{ (item.prompt || '').slice(0, 60) }}{{ (item.prompt || '').length > 60 ? '…' : '' }}</p>
                    <span class="card-model">{{ item.modelName || ('模型 #' + (item.modelId || '')) }}</span>
                  </div>
                </div>
              </div>
            </template>
            <div v-if="loadingMore" class="loading-more"><el-icon class="is-loading"><Loading /></el-icon> 加载更多...</div>
            <div v-else-if="!hasMore && historyList.length > 0" class="no-more">没有更多了</div>
          </template>
          <div v-else class="empty-state">
            <el-icon class="empty-icon"><Document /></el-icon>
            <p class="empty-text">暂无历史记录</p>
            <p class="empty-hint">去工作区生成你的第一张作品吧</p>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="已发布作品" name="published">
        <MyWorksGallery ref="myWorksGalleryRef" @select-work="() => {}" />
      </el-tab-pane>
    </el-tabs>
    <HistoryDetailDialog
      v-model="showDetail"
      :history-item="selectedItem"
      @publish="handlePublish"
      @use-history="handleUseHistory"
      @deleted="handleHistoryDeleted"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, provide, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Loading, Picture, VideoPlay, Document } from '@element-plus/icons-vue'
import HistoryDetailDialog from './HistoryDetailDialog.vue'
import MyWorksGallery from './MyWorksGallery.vue'
import { getHistory } from '../api/imageApi'
import { getVideoHistory } from '../api/videoApi'
import { publishWork } from '../api/worksApi'

const props = defineProps({
  availableModels: { type: Array, default: () => [] },
  videoModels: { type: Array, default: () => [] }
})
const emit = defineEmits(['use-template', 'need-login'])

provide('availableModels', computed(() => props.availableModels))
provide('videoModels', computed(() => props.videoModels))

const activeTab = ref('history')
const filterType = ref('all')
const filterModelId = ref(null)
const searchKeyword = ref('')
const initialLoading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const historyScrollRef = ref(null)
const myWorksGalleryRef = ref(null)
const currentPage = ref(1)
const pageSize = 30
const historyList = ref([])
const showDetail = ref(false)
const selectedItem = ref(null)

const allModels = computed(() => {
  const image = (props.availableModels || []).map(m => ({ id: m.id, name: m.name || m.display_name }))
  const video = (props.videoModels || []).map(m => ({ id: m.id, name: m.name || m.display_name }))
  return [...image, ...video]
})

function getVideoUrl(item) {
  if (item.videoUrl) return item.videoUrl
  const vd = item.videoData
  if (!vd) return ''
  return vd.video_url || vd.url || (typeof vd === 'string' ? vd : '')
}

function getCoverUrl(item) {
  if (item.mode === 'video-generation') return getVideoUrl(item)
  const imgs = item.generatedImages || []
  if (imgs.length === 0) return ''
  const first = imgs[0]
  return typeof first === 'string' ? first : (first && first.url) || ''
}

function normalizeForDialog(raw) {
  return { ...raw, videoUrl: getVideoUrl(raw) || undefined }
}

const dateGroups = computed(() => {
  const list = historyList.value
  if (!list.length) return {}
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const oneDay = 24 * 60 * 60 * 1000
  const g = { today: { label: '今天', items: [] }, yesterday: { label: '昨天', items: [] }, week: { label: '本周', items: [] }, month: { label: '本月', items: [] }, older: { label: '更早', items: [] } }
  for (const item of list) {
    const t = item.createdAt ? new Date(item.createdAt).getTime() : 0
    if (t >= todayStart) g.today.items.push(item)
    else if (t >= todayStart - oneDay) g.yesterday.items.push(item)
    else if (t >= todayStart - 7 * oneDay) g.week.items.push(item)
    else if (t >= todayStart - 30 * oneDay) g.month.items.push(item)
    else g.older.items.push(item)
  }
  return g
})

async function loadData(append) {
  if (append) loadingMore.value = true
  else {
    initialLoading.value = true
    currentPage.value = 1
    historyList.value = []
  }
  try {
    let imageData = []
    let videoData = []
    const page = currentPage.value
    const size = pageSize
    if (filterType.value !== 'video') {
      const res = await getHistory({ page, pageSize: size, search: searchKeyword.value || undefined, mode: filterType.value === 'image' ? 'image' : undefined, modelId: filterModelId.value ?? undefined })
      imageData = res?.data || []
    }
    if (filterType.value !== 'image') {
      const vidRes = await getVideoHistory({ page, pageSize: size, searchKeyword: searchKeyword.value || undefined })
      const raw = vidRes?.data || []
      videoData = raw.map(r => ({ ...r, mode: 'video-generation', videoUrl: getVideoUrl(r) }))
      if (filterModelId.value && videoData.length) videoData = videoData.filter(v => Number(v.modelId) === Number(filterModelId.value))
    }
    const merged = [...imageData.map(normalizeForDialog), ...videoData.map(normalizeForDialog)].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    if (append) historyList.value = [...historyList.value, ...merged]
    else historyList.value = merged
    const totalImage = filterType.value === 'video' ? 0 : ((await getHistory({ page: 1, pageSize: 1, search: searchKeyword.value || undefined, mode: filterType.value === 'image' ? 'image' : undefined, modelId: filterModelId.value ?? undefined }))?.total || 0)
    const totalVideo = filterType.value === 'image' ? 0 : ((await getVideoHistory({ page: 1, pageSize: 1, searchKeyword: searchKeyword.value }))?.data?.length ?? 0)
    const total = filterType.value === 'image' ? totalImage : filterType.value === 'video' ? totalVideo : totalImage + totalVideo
    hasMore.value = historyList.value.length < total
  } catch (e) {
    console.error('加载历史失败:', e)
    ElMessage.error('加载历史记录失败')
  } finally {
    initialLoading.value = false
    loadingMore.value = false
  }
}

function onFilterChange() { loadData(false) }

function onHistoryScroll() {
  const el = historyScrollRef.value
  if (!el || loadingMore.value || !hasMore.value) return
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight - scrollTop - clientHeight < 200) { currentPage.value++; loadData(true) }
}

function openDetail(item) {
  selectedItem.value = item
  showDetail.value = true
}

async function handlePublish(historyItem, selectedImageIndex) {
  if (!localStorage.getItem('token')) { emit('need-login'); return }
  let coverUrl = ''
  const contentType = historyItem.mode === 'video-generation' ? 'video' : 'image'
  if (contentType === 'video') coverUrl = getVideoUrl(historyItem) || ''
  else {
    const imgs = historyItem.generatedImages || []
    const idx = Math.min(selectedImageIndex || 0, imgs.length - 1)
    const img = imgs[idx]
    coverUrl = img ? (typeof img === 'string' ? img : img?.url) : ''
  }
  if (!coverUrl) { ElMessage.warning('无法获取封面，请稍后重试'); return }
  const workData = { historyId: historyItem.id, title: (historyItem.prompt || '作品').slice(0, 100), coverUrl, contentType, prompt: historyItem.prompt || '', modelId: historyItem.modelId ?? null, modelName: historyItem.modelName || null, size: historyItem.size || null, referenceImages: historyItem.selectedReferenceImages || null, videoData: historyItem.videoData || null }
  try {
    const res = await publishWork(workData)
    const data = res?.data ?? res
    if (data?.success !== false) {
      ElMessage.success(data?.message || '已发布到社区首页')
      showDetail.value = false
      activeTab.value = 'published'
      nextTick(() => { myWorksGalleryRef.value?.refreshWorks?.() })
    } else ElMessage.error(data?.error || data?.message || '发布失败')
  } catch (err) {
    console.error('发布失败:', err)
    ElMessage.error(err.response?.data?.error || err.message || '发布失败')
  }
}

function handleUseHistory(historyItem) {
  emit('use-template', historyItem)
  showDetail.value = false
}

function handleHistoryDeleted(historyId) {
  historyList.value = historyList.value.filter(item => Number(item.id) !== Number(historyId))
  if (selectedItem.value && Number(selectedItem.value.id) === Number(historyId)) {
    selectedItem.value = null
    showDetail.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'published' && myWorksGalleryRef.value) nextTick(() => myWorksGalleryRef.value?.refreshWorks?.())
})

onMounted(() => loadData(false))
</script>

<style scoped>
.my-works-page { width: 100%; height: 100vh; display: flex; flex-direction: column; background: var(--bg-primary, #f5f6f8); }
.page-tabs { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-tabs :deep(.el-tabs__content) { flex: 1; overflow: hidden; }
.page-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.filter-bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: var(--bg-card, #fff); border-bottom: 1px solid var(--border-light, #eee); flex-shrink: 0; }
.model-select { width: 160px; }
.search-input { width: 220px; }
.history-scroll { flex: 1; overflow-y: auto; padding: 16px 20px; }
.loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; color: var(--text-tertiary, #999); }
.loading-wrap p { margin-top: 12px; }
.date-group-title { font-size: 13px; font-weight: 600; color: var(--text-secondary, #666); margin: 16px 0 10px; padding-bottom: 6px; }
.date-group-title:first-child { margin-top: 0; }
.history-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.history-card { background: var(--bg-card, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.history-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.1); }
.card-media { position: relative; aspect-ratio: 1; background: var(--bg-primary, #f0f0f0); overflow: hidden; }
.media-video, .media-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.media-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary, #999); font-size: 12px; }
.media-placeholder .el-icon { font-size: 32px; margin-bottom: 4px; }
.video-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; }
.card-info { padding: 10px 12px; }
.card-prompt { font-size: 13px; color: var(--text-primary, #333); margin: 0 0 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-model { font-size: 12px; color: var(--text-tertiary, #999); }
.loading-more, .no-more { text-align: center; padding: 16px; color: var(--text-tertiary, #999); font-size: 13px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-tertiary, #999); }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 16px; font-weight: 500; margin: 0 0 6px; color: var(--text-secondary, #666); }
.empty-hint { font-size: 13px; margin: 0; }
</style>
