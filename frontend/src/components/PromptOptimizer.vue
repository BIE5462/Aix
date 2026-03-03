<template>
  <div class="prompt-optimizer">
    <!-- 顶部标题栏 -->
    <div class="optimizer-header">
      <div class="header-title">
        <el-icon class="header-icon"><MagicStick /></el-icon>
        <h1>提示词优化工作台</h1>
      </div>
      <div class="header-actions">
        <el-select
          v-model="selectedModelId"
          placeholder="选择AI模型"
          :loading="modelsLoading"
          class="model-select"
        >
          <el-option
            v-for="model in textModels"
            :key="model.id"
            :label="model.display_name"
            :value="model.id"
          >
            <span>{{ model.display_name }}</span>
            <el-tag v-if="model.is_default" size="small" type="success" style="margin-left: 8px">默认</el-tag>
          </el-option>
        </el-select>
      </div>
    </div>

    <div class="optimizer-body">
      <!-- 左侧分类面板 -->
      <div class="category-panel">
        <div class="panel-label">优化类型</div>
        <div
          v-for="cat in categories"
          :key="cat.key"
          class="category-item"
          :class="{ active: selectedCategory === cat.key }"
          @click="selectCategory(cat.key)"
        >
          <el-icon class="category-icon">
            <Picture v-if="cat.icon === 'Picture'" />
            <PictureFilled v-else-if="cat.icon === 'PictureFilled'" />
            <Setting v-else-if="cat.icon === 'Setting'" />
            <Edit v-else-if="cat.icon === 'Edit'" />
          </el-icon>
          <div class="category-info">
            <span class="category-name">{{ cat.name }}</span>
            <span class="category-desc">{{ cat.description }}</span>
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="panel-divider" />
        <div class="panel-label">辅助工具</div>
        <div
          class="category-item"
          :class="{ active: selectedCategory === 'batch-generate' }"
          @click="selectCategory('batch-generate')"
        >
          <el-icon class="category-icon"><List /></el-icon>
          <div class="category-info">
            <span class="category-name">批量生成</span>
            <span class="category-desc">AI批量生成多条提示词</span>
          </div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="main-panel">
        <!-- 批量生成模式 -->
        <AIPromptGenerator
          v-if="selectedCategory === 'batch-generate'"
          @fill-batch-prompts="handleFillBatchFromGenerator"
        />

        <!-- 模板优化模式 -->
        <template v-else>
        <!-- 模板选择 -->
        <div class="template-section">
          <div class="section-label">选择优化模板</div>
          <div class="template-grid">
            <div
              v-for="tmpl in filteredTemplates"
              :key="tmpl.id"
              class="template-card"
              :class="{ active: selectedTemplateId === tmpl.id }"
              @click="selectedTemplateId = tmpl.id"
            >
              <div class="template-name">{{ tmpl.name }}</div>
              <div class="template-desc">{{ tmpl.description }}</div>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="input-section">
          <div class="section-label">原始提示词</div>
          <el-input
            v-model="originalPrompt"
            type="textarea"
            :rows="5"
            placeholder="输入你想要优化的提示词..."
            resize="vertical"
            class="prompt-input"
          />
          <div class="input-actions">
            <el-button
              type="primary"
              size="large"
              :loading="isOptimizing"
              :disabled="!canOptimize"
              @click="handleOptimize"
              class="optimize-btn"
            >
              <el-icon v-if="!isOptimizing"><MagicStick /></el-icon>
              {{ isOptimizing ? '优化中...' : '开始优化' }}
            </el-button>
            <el-button
              v-if="versionHistory.length > 0"
              @click="handleReset"
            >
              <el-icon><RefreshLeft /></el-icon>
              重置
            </el-button>
          </div>
        </div>

        <!-- 结果区 -->
        <div v-if="optimizedPrompt" class="result-section">
          <div class="section-label">
            <span>优化结果</span>
            <el-tag size="small" type="info">v{{ currentVersion }}</el-tag>
          </div>
          <div class="result-card">
            <div class="result-content">{{ optimizedPrompt }}</div>
            <div class="result-actions">
              <el-button size="small" @click="copyResult">
                <el-icon><DocumentCopy /></el-icon>
                复制
              </el-button>
              <el-button size="small" type="primary" @click="handleFillWorkspace">
                <el-icon><Upload /></el-icon>
                填入工作区
              </el-button>
            </div>
          </div>

          <!-- 迭代区 -->
          <div class="iterate-section">
            <div class="section-label">迭代优化</div>
            <el-input
              v-model="iterateInput"
              type="textarea"
              :rows="3"
              placeholder="描述你希望如何改进当前结果，例如：增强光线描述、换成中文美学风格..."
              resize="vertical"
              class="iterate-input"
            />
            <el-button
              type="primary"
              :loading="isIterating"
              :disabled="!canIterate"
              @click="handleIterate"
              class="iterate-btn"
            >
              <el-icon v-if="!isIterating"><RefreshRight /></el-icon>
              {{ isIterating ? '迭代中...' : '迭代优化' }}
            </el-button>
          </div>

          <!-- 版本历史 -->
          <div v-if="versionHistory.length > 1" class="version-section">
            <div class="section-label">版本历史</div>
            <div class="version-timeline">
              <div
                v-for="(ver, idx) in versionHistory"
                :key="idx"
                class="version-item"
                :class="{ active: currentVersionIdx === idx }"
                @click="switchVersion(idx)"
              >
                <div class="version-dot" />
                <div class="version-info">
                  <div class="version-tag">
                    v{{ ver.version }}
                    <el-tag size="small" :type="ver.type === 'optimize' ? 'primary' : 'warning'">
                      {{ ver.type === 'optimize' ? '优化' : '迭代' }}
                    </el-tag>
                  </div>
                  <div class="version-preview">{{ ver.prompt.substring(0, 80) }}{{ ver.prompt.length > 80 ? '...' : '' }}</div>
                  <div v-if="ver.iterateInput" class="version-iterate-hint">
                    迭代需求：{{ ver.iterateInput }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!isOptimizing" class="empty-state">
          <el-icon :size="64"><MagicStick /></el-icon>
          <p>选择模板并输入提示词，开始优化</p>
        </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MagicStick,
  Picture,
  PictureFilled,
  Setting,
  Edit,
  DocumentCopy,
  Upload,
  RefreshLeft,
  RefreshRight,
  List
} from '@element-plus/icons-vue'
import {
  getTextModels,
  getOptimizeTemplates,
  optimizePrompt as optimizePromptApi,
  iteratePrompt as iteratePromptApi
} from '@/api/aiPromptApi'
import AIPromptGenerator from './AIPromptGenerator.vue'

const emit = defineEmits(['fill-workspace', 'fill-batch-prompts'])

// --- 状态 ---
const textModels = ref([])
const modelsLoading = ref(false)
const selectedModelId = ref(null)

const categories = ref([])
const allTemplates = ref([])
const selectedCategory = ref('text2image')
const selectedTemplateId = ref(null)

const originalPrompt = ref('')
const optimizedPrompt = ref('')
const iterateInput = ref('')

const isOptimizing = ref(false)
const isIterating = ref(false)

const versionHistory = ref([])
const currentVersionIdx = ref(0)

// --- 计算属性 ---
const filteredTemplates = computed(() => {
  return allTemplates.value.filter(t => t.category === selectedCategory.value)
})

const currentVersion = computed(() => {
  if (versionHistory.value.length === 0) return 0
  return versionHistory.value[currentVersionIdx.value]?.version || 0
})

const canOptimize = computed(() => {
  return selectedModelId.value && selectedTemplateId.value && originalPrompt.value.trim().length > 0 && !isOptimizing.value
})

const canIterate = computed(() => {
  return selectedModelId.value && optimizedPrompt.value && iterateInput.value.trim().length > 0 && !isIterating.value
})

// --- 方法 ---
const loadTextModels = async () => {
  try {
    modelsLoading.value = true
    const response = await getTextModels()
    textModels.value = response.data || []
    const defaultModel = textModels.value.find(m => m.is_default)
    if (defaultModel) {
      selectedModelId.value = defaultModel.id
    } else if (textModels.value.length > 0) {
      selectedModelId.value = textModels.value[0].id
    }
  } catch (error) {
    console.error('加载文本模型失败:', error)
    ElMessage.error('加载模型列表失败')
  } finally {
    modelsLoading.value = false
  }
}

const loadTemplates = async () => {
  try {
    const response = await getOptimizeTemplates()
    allTemplates.value = response.data?.templates || []
    categories.value = response.data?.categories || []
    if (categories.value.length > 0) {
      selectedCategory.value = categories.value[0].key
    }
    const firstInCategory = filteredTemplates.value[0]
    if (firstInCategory) {
      selectedTemplateId.value = firstInCategory.id
    }
  } catch (error) {
    console.error('加载模板失败:', error)
    ElMessage.error('加载优化模板失败')
  }
}

const selectCategory = (key) => {
  selectedCategory.value = key
  if (key === 'batch-generate') {
    selectedTemplateId.value = null
    return
  }
  const first = allTemplates.value.find(t => t.category === key)
  if (first) {
    selectedTemplateId.value = first.id
  } else {
    selectedTemplateId.value = null
  }
}

const handleFillBatchFromGenerator = (prompts) => {
  emit('fill-batch-prompts', prompts)
}

const handleOptimize = async () => {
  if (!canOptimize.value) return
  try {
    isOptimizing.value = true
    const response = await optimizePromptApi({
      model_id: selectedModelId.value,
      template_id: selectedTemplateId.value,
      original_prompt: originalPrompt.value.trim()
    })
    const result = response.data?.optimized_prompt
    if (!result) {
      throw new Error('未收到优化结果')
    }
    optimizedPrompt.value = result
    versionHistory.value = [{
      version: 1,
      prompt: result,
      type: 'optimize',
      templateId: selectedTemplateId.value
    }]
    currentVersionIdx.value = 0
    iterateInput.value = ''
    ElMessage.success('优化完成')
  } catch (error) {
    console.error('优化失败:', error)
    ElMessage.error(error.response?.data?.error || error.message || '优化失败')
  } finally {
    isOptimizing.value = false
  }
}

const handleIterate = async () => {
  if (!canIterate.value) return
  try {
    isIterating.value = true
    const currentTemplateId = versionHistory.value[currentVersionIdx.value]?.templateId || selectedTemplateId.value
    const response = await iteratePromptApi({
      model_id: selectedModelId.value,
      template_id: currentTemplateId,
      last_optimized_prompt: optimizedPrompt.value,
      iterate_input: iterateInput.value.trim()
    })
    const result = response.data?.iterated_prompt
    if (!result) {
      throw new Error('未收到迭代结果')
    }
    const newVersion = {
      version: versionHistory.value.length + 1,
      prompt: result,
      type: 'iterate',
      templateId: currentTemplateId,
      iterateInput: iterateInput.value.trim()
    }
    versionHistory.value.push(newVersion)
    currentVersionIdx.value = versionHistory.value.length - 1
    optimizedPrompt.value = result
    iterateInput.value = ''
    ElMessage.success('迭代完成')
  } catch (error) {
    console.error('迭代失败:', error)
    ElMessage.error(error.response?.data?.error || error.message || '迭代失败')
  } finally {
    isIterating.value = false
  }
}

const switchVersion = (idx) => {
  currentVersionIdx.value = idx
  optimizedPrompt.value = versionHistory.value[idx].prompt
}

const copyResult = async () => {
  try {
    await navigator.clipboard.writeText(optimizedPrompt.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const handleFillWorkspace = () => {
  emit('fill-workspace', [optimizedPrompt.value])
  ElMessage.success('已填入工作区')
}

const handleReset = async () => {
  try {
    await ElMessageBox.confirm('确定要重置所有优化结果吗？', '重置确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    optimizedPrompt.value = ''
    iterateInput.value = ''
    versionHistory.value = []
    currentVersionIdx.value = 0
  } catch {
    // cancelled
  }
}

onMounted(() => {
  loadTextModels()
  loadTemplates()
})
</script>

<style scoped>
.prompt-optimizer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  overflow: hidden;
}

/* --- 顶部标题栏 --- */
.optimizer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 28px;
  color: var(--primary-blue);
}

.header-title h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.3px;
}

.model-select {
  width: 220px;
}

/* --- 主体布局 --- */
.optimizer-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* --- 左侧分类面板 --- */
.category-panel {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-light);
  padding: 20px 16px;
  overflow-y: auto;
}

.panel-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
  padding-left: 12px;
}

.panel-divider {
  height: 1px;
  background: var(--border-light);
  margin: 16px 0 12px;
}

.category-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  margin-bottom: 4px;
  border: 1px solid transparent;
}

.category-item:hover {
  background: var(--bg-hover);
}

.category-item.active {
  background: var(--primary-blue-bg);
  border-color: var(--primary-blue-light);
}

.category-item.active .category-icon {
  color: var(--primary-blue);
}

.category-item.active .category-name {
  color: var(--primary-blue);
  font-weight: 600;
}

.category-icon {
  font-size: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-top: 2px;
}

.category-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.category-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.category-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

/* --- 右侧主内容区 --- */
.main-panel {
  flex: 1;
  min-width: 0;
  padding: 24px 32px;
  overflow-y: auto;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* --- 模板选择 --- */
.template-section {
  margin-bottom: 24px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.template-card {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  cursor: pointer;
  transition: all var(--transition-base);
}

.template-card:hover {
  border-color: var(--primary-blue-light);
  box-shadow: var(--shadow-sm);
}

.template-card.active {
  border-color: var(--primary-blue);
  background: var(--primary-blue-bg);
  box-shadow: 0 0 0 1px var(--primary-blue);
}

.template-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.template-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* --- 输入区 --- */
.input-section {
  margin-bottom: 24px;
}

.prompt-input :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.7;
  border-radius: var(--radius-md);
}

.input-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.optimize-btn {
  min-width: 160px;
}

/* --- 结果区 --- */
.result-section {
  margin-top: 8px;
}

.result-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-sm);
}

.result-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 16px;
}

.result-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

/* --- 迭代区 --- */
.iterate-section {
  margin-bottom: 24px;
}

.iterate-input :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.6;
  border-radius: var(--radius-md);
}

.iterate-btn {
  margin-top: 12px;
}

/* --- 版本历史 --- */
.version-section {
  margin-bottom: 24px;
}

.version-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  padding-left: 20px;
}

.version-timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--border-light);
}

.version-item {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
}

.version-item:hover {
  background: var(--bg-hover);
}

.version-item.active {
  background: var(--primary-blue-bg);
}

.version-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border-medium);
  flex-shrink: 0;
  margin-top: 4px;
  position: relative;
  z-index: 1;
}

.version-item.active .version-dot {
  background: var(--primary-blue);
  box-shadow: 0 0 0 3px var(--primary-blue-bg);
}

.version-info {
  flex: 1;
  min-width: 0;
}

.version-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.version-preview {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-iterate-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-style: italic;
}

/* --- 空状态 --- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
}

.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}

/* --- 响应式 --- */
@media (max-width: 1200px) {
  .optimizer-header {
    padding: 16px 20px;
  }

  .category-panel {
    width: 200px;
    padding: 16px 12px;
  }

  .main-panel {
    padding: 20px;
  }

  .template-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}

@media (max-width: 768px) {
  .optimizer-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 16px;
  }

  .header-title h1 {
    font-size: 18px;
  }

  .model-select {
    width: 100%;
  }

  .optimizer-body {
    flex-direction: column;
  }

  .category-panel {
    width: 100%;
    flex-direction: row;
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-light);
    padding: 12px;
    gap: 8px;
  }

  .panel-label {
    display: none;
  }

  .panel-divider {
    display: none;
  }

  .category-item {
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 10px 16px;
    min-width: 100px;
  }

  .category-desc {
    display: none;
  }

  .main-panel {
    padding: 16px;
  }

  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
