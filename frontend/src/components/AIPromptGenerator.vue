<template>
  <div class="ai-prompt-generator">
    <!-- 配置区域 -->
    <div class="config-section">
      <div class="config-row">
        <label>选择模型：</label>
        <el-select
          v-model="selectedModelId"
          placeholder="请选择AI模型"
          size="default"
          :loading="modelsLoading"
          style="flex: 1"
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

      <div class="config-row">
        <label>生成数量：</label>
        <el-select v-model="generateCount" placeholder="选择生成数量" size="default" style="flex: 1">
          <el-option v-for="n in 10" :key="n" :label="`${n}个`" :value="n" />
        </el-select>
        <el-button @click="handleNewSession" style="margin-left: 8px">
          <el-icon><CirclePlus /></el-icon>
          新建会话
        </el-button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <label>描述你想要的图像：</label>
      <el-input
        v-model="userInput"
        type="textarea"
        :rows="4"
        placeholder="例如：一只可爱的猫咪在花园里玩耍，阳光明媚，鲜花盛开..."
      />
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <el-button
        type="primary"
        :loading="isGenerating"
        :disabled="!canGenerate"
        @click="handleGenerate"
        style="flex: 1"
        class="generate-btn"
      >
        <el-icon v-if="!isGenerating"><MagicStick /></el-icon>
        {{ isGenerating ? '生成中...' : '生成提示词' }}
      </el-button>
      <el-button @click="showHistoryPanel = true">
        <el-icon><Clock /></el-icon>
        查看历史
      </el-button>
    </div>

    <!-- 结果展示区域 -->
    <div v-if="generatedPrompts.length > 0" class="results-section">
      <div class="results-header">
        <h3>生成结果 ({{ generatedPrompts.length }}条)</h3>
        <div class="results-actions">
          <el-button size="small" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </el-button>
        </div>
      </div>

      <!-- 批量操作按钮 -->
      <div class="batch-actions">
        <el-button
          type="primary"
          :disabled="selectedPrompts.length === 0"
          @click="handleFillBatchPrompts"
          style="flex: 1"
        >
          <el-icon><Upload /></el-icon>
          一键填入批量输入表单 ({{ selectedPrompts.length }})
        </el-button>
      </div>

      <div class="prompts-list">
        <div
          v-for="item in generatedPrompts"
          :key="item.index"
          class="prompt-card"
          :class="{ selected: selectedPromptIds.has(item.index) }"
        >
          <div class="prompt-header">
            <el-checkbox
              :model-value="selectedPromptIds.has(item.index)"
              @change="togglePromptSelection(item.index)"
            >
              <span class="prompt-number">{{ item.index }}</span>
            </el-checkbox>
            <el-button
              size="small"
              text
              @click="copyPrompt(item.prompt)"
            >
              <el-icon><DocumentCopy /></el-icon>
              复制
            </el-button>
          </div>
          <div class="prompt-content">{{ item.prompt }}</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <el-icon size="64" color="#909399"><MagicStick /></el-icon>
      <p>输入描述后点击"生成提示词"开始创作</p>
    </div>

    <!-- AI生成历史面板 -->
    <AIPromptHistoryPanel
      v-model:visible="showHistoryPanel"
      @load-prompts="handleLoadHistoryPrompts"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MagicStick,
  Clock,
  DocumentCopy,
  Upload,
  CirclePlus
} from '@element-plus/icons-vue'
import {
  getTextModels,
  generateAIPrompts,
  saveBatchPromptHistory
} from '@/api/aiPromptApi'
import AIPromptHistoryPanel from './AIPromptHistoryPanel.vue'

// 定义事件
const emit = defineEmits(['fill-batch-prompts'])

// 状态
const textModels = ref([])
const modelsLoading = ref(false)
const selectedModelId = ref(null)
const generateCount = ref(10)
const userInput = ref('')
const isGenerating = ref(false)
const generatedPrompts = ref([])
const selectedPromptIds = ref(new Set())
const showHistoryPanel = ref(false)
const currentHistoryId = ref(null)

// 会话管理
const conversationHistory = ref([]) // 会话历史，保存所有的用户输入和AI输出
const isLoadedFromHistory = ref(false) // 是否从历史加载的会话

// 计算属性
const canGenerate = computed(() => {
  return selectedModelId.value && userInput.value.trim().length > 0 && !isGenerating.value
})

const allSelected = computed(() => {
  return generatedPrompts.value.length > 0 &&
    selectedPromptIds.value.size === generatedPrompts.value.length
})

const selectedPrompts = computed(() => {
  return generatedPrompts.value
    .filter(item => selectedPromptIds.value.has(item.index))
    .map(item => item.prompt)
})

// 加载文本模型列表
const loadTextModels = async () => {
  try {
    modelsLoading.value = true
    const response = await getTextModels()
    textModels.value = response.data || []

    // 自动选择默认模型
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

// 生成提示词
const handleGenerate = async () => {
  if (!canGenerate.value) return

  try {
    isGenerating.value = true

    const currentInput = userInput.value.trim()

    const response = await generateAIPrompts({
      model_id: selectedModelId.value,
      user_input: currentInput,
      count: generateCount.value,
      conversation_history: conversationHistory.value
    })

    generatedPrompts.value = response.data.prompts || []
    currentHistoryId.value = response.data.history_id

    // 将当前对话添加到会话历史
    conversationHistory.value.push(
      { role: 'user', content: currentInput },
      { role: 'assistant', content: JSON.stringify({ prompts: generatedPrompts.value }) }
    )

    // 默认全选
    selectedPromptIds.value = new Set(generatedPrompts.value.map(p => p.index))

    ElMessage.success(`成功生成 ${generatedPrompts.value.length} 个提示词`)
  } catch (error) {
    console.error('生成提示词失败:', error)
    const errorMsg = error.response?.data?.error || '生成失败，请稍后重试'
    ElMessage.error(errorMsg)
  } finally {
    isGenerating.value = false
  }
}

// 复制提示词
const copyPrompt = async (prompt) => {
  try {
    await navigator.clipboard.writeText(prompt)
    ElMessage.success('已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

// 切换提示词选择
const togglePromptSelection = (index) => {
  if (selectedPromptIds.value.has(index)) {
    selectedPromptIds.value.delete(index)
  } else {
    selectedPromptIds.value.add(index)
  }
  // 触发响应式更新
  selectedPromptIds.value = new Set(selectedPromptIds.value)
}

// 全选/取消全选
const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedPromptIds.value.clear()
  } else {
    selectedPromptIds.value = new Set(generatedPrompts.value.map(p => p.index))
  }
}

// 一键填入批量输入表单（同时自动保存历史）
const handleFillBatchPrompts = async () => {
  if (selectedPrompts.value.length === 0) {
    ElMessage.warning('请至少选择一个提示词')
    return
  }

  if (selectedPrompts.value.length > 10) {
    ElMessage.warning('最多只能选择10个提示词')
    return
  }

  try {
    // 先保存到批量输入历史
    const now = new Date()
    const name = `AI生成 - ${now.toLocaleString('zh-CN')}`

    await saveBatchPromptHistory({
      name,
      prompts: selectedPrompts.value,
      source_type: 'ai_generated',
      source_id: currentHistoryId.value
    })

    // 然后填入批量输入表单
    emit('fill-batch-prompts', selectedPrompts.value)
    ElMessage.success(`已填入 ${selectedPrompts.value.length} 个提示词到批量输入表单，并保存到历史记录`)
  } catch (error) {
    console.error('操作失败:', error)
    // 即使保存失败也填入表单
    emit('fill-batch-prompts', selectedPrompts.value)
    ElMessage.warning(`已填入表单，但保存历史失败`)
  }
}

// 从历史记录加载提示词
const handleLoadHistoryPrompts = (prompts, historyId) => {
  generatedPrompts.value = prompts
  currentHistoryId.value = historyId
  selectedPromptIds.value = new Set(prompts.map(p => p.index))

  // 标记为从历史加载
  isLoadedFromHistory.value = true

  // 重建会话历史：将加载的提示词作为assistant的回复
  conversationHistory.value = [
    { role: 'assistant', content: JSON.stringify({ prompts }) }
  ]

  ElMessage.success('已加载历史会话，可以继续对话')
}

// 新建会话
const handleNewSession = async () => {
  if (conversationHistory.value.length === 0 && generatedPrompts.value.length === 0) {
    ElMessage.info('当前已是新会话')
    return
  }

  try {
    await ElMessageBox.confirm(
      '新建会话将清空当前对话历史，是否继续？',
      '新建会话',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 清空所有状态
    conversationHistory.value = []
    generatedPrompts.value = []
    selectedPromptIds.value = new Set()
    currentHistoryId.value = null
    userInput.value = ''
    isLoadedFromHistory.value = false

    ElMessage.success('已创建新会话')
  } catch (error) {
    // 用户取消，不做任何操作
  }
}

// 初始化
onMounted(() => {
  loadTextModels()
})
</script>

<style scoped>
.ai-prompt-generator {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
  max-height: 100%; /* 确保不超过父容器 */
  overflow: hidden; /* 改为 hidden，让子元素处理滚动 */
  box-sizing: border-box;
  position: relative; /* 添加定位上下文 */
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0; /* 不收缩 */
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-row label {
  min-width: 80px;
  font-weight: 500;
  color: #606266;
  flex-shrink: 0;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0; /* 不收缩 */
}

.input-section label {
  font-weight: 500;
  color: #606266;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0; /* 不收缩 */
}

.generate-btn {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  transition: all 0.3s ease;
}

.generate-btn:hover {
  background-color: #f97316;
  border-color: #f97316;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(251, 146, 60, 0.3);
}

.generate-btn.is-disabled {
  background-color: rgba(251, 146, 60, 0.5);
  border-color: rgba(251, 146, 60, 0.5);
  opacity: 0.6;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.results-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
}

.results-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.batch-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.prompts-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
}

/* 自定义滚动条样式 */
.prompts-list::-webkit-scrollbar {
  width: 6px;
}

.prompts-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.prompts-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.prompts-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.prompt-card {
  border: var(--glass-level-1-border);
  border-radius: 8px;
  padding: 12px;
  background: var(--glass-level-2-bg);
  transition: all 0.3s;
  margin-bottom: 8px; /* 卡片之间的间距 */
}

.prompt-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.prompt-card.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.prompt-number {
  font-weight: 600;
  color: #409eff;
  margin-left: 4px;
}

.prompt-content {
  color: #606266;
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: break-word;
  padding-left: 24px;
  white-space: pre-wrap; /* 保留换行和空格 */
  font-size: 14px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #909399;
  flex: 1;
}

.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}
</style>
