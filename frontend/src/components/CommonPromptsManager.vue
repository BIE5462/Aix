<template>
  <el-dialog
    v-model="visible"
    width="900px"
    @close="handleClose"
  >
    <div class="common-prompts-manager">
      <!-- 左侧：添加/编辑提示词区域 -->
      <div class="add-section">
        <h4>{{ editingPrompt ? '编辑常用提示词' : '添加常用提示词' }}</h4>
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="80px"
        >
          <el-form-item label="名称" prop="name">
            <el-input 
              v-model="form.name" 
              placeholder="请输入提示词名称，如：金属框眼镜"
              maxlength="20"
              show-word-limit
            />
          </el-form-item>
          
          <el-form-item label="内容" prop="content">
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="4"
              placeholder="请输入提示词内容"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="editingPrompt ? updatePrompt() : addPrompt()" :loading="adding">
              {{ editingPrompt ? '更新' : '添加' }}
            </el-button>
            <el-button @click="resetForm">重置</el-button>
            <el-button v-if="editingPrompt" @click="cancelEdit">取消编辑</el-button>
          </el-form-item>
        </el-form>
      </div>
      
      <!-- 右侧：提示词列表区域 -->
      <div class="list-section">
        <h4>当前常用提示词</h4>
        <div v-if="prompts.length === 0" class="empty-state">
          <el-empty description="暂无常用提示词" />
        </div>
        <div v-else class="prompts-list">
          <div 
            v-for="(prompt, index) in prompts" 
            :key="prompt.id"
            class="prompt-item"
          >
            <div class="prompt-info">
              <div class="prompt-name">{{ prompt.name || '未命名' }}</div>
              <div class="prompt-content">{{ prompt.content }}</div>
              <div class="prompt-meta">
                <span class="prompt-date">创建时间：{{ formatDate(prompt.createdAt) }}</span>
                <span v-if="prompt.updatedAt" class="prompt-updated">更新时间：{{ formatDate(prompt.updatedAt) }}</span>
              </div>
            </div>
            <div class="prompt-actions">
              <el-button 
                size="small" 
                type="primary" 
                plain
                @click="editPrompt(prompt)"
              >
                编辑
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                plain
                @click="deletePrompt(prompt.id)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCommonPrompt, deleteCommonPrompt, getCommonPrompts, updateCommonPrompt } from '../api/promptsApi'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'prompts-updated'])

// 响应式数据
const visible = ref(false)
const prompts = ref([])
const adding = ref(false)
const editingPrompt = ref(null)

// 表单数据
const form = reactive({
  name: '',
  content: ''
})

// 表单验证规则
const rules = {
  name: [
    { required: true, message: '请输入提示词名称', trigger: 'blur' },
    { min: 1, max: 20, message: '名称长度在 1 到 20 个字符', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入提示词内容', trigger: 'blur' },
    { min: 1, max: 200, message: '内容长度在 1 到 200 个字符', trigger: 'blur' }
  ]
}

const formRef = ref()

// 监听modelValue变化
watch(() => props.modelValue, (newVal) => {
  visible.value = newVal
  if (newVal) {
    loadPrompts()
  }
})

// 监听visible变化
watch(visible, (newVal) => {
  emit('update:modelValue', newVal)
})

// 关闭对话框
const handleClose = () => {
  visible.value = false
  resetForm()
}

// 添加提示词
const addPrompt = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    adding.value = true
    
    // 检查名称是否重复
    const existingPrompt = prompts.value.find(p => p.name === form.name)
    if (existingPrompt) {
      ElMessage.error('提示词名称已存在')
      return
    }
    
    const token = localStorage.getItem('token')
    
    if (token) {
      // 已登录，使用API保存
      await addPromptToServer()
    } else {
      // 未登录，使用本地存储
      await addPromptToLocal()
    }
    
    ElMessage.success('添加成功')
    resetForm()
    // 触发更新事件，通知父组件更新状态
    emit('prompts-updated', prompts.value)
  } catch (error) {
    console.error('添加失败:', error)
    ElMessage.error('添加失败')
  } finally {
    adding.value = false
  }
}

// 添加提示词到服务器
const addPromptToServer = async () => {
  await createCommonPrompt({
    name: form.name.trim(),
    content: form.content.trim()
  })
  
  // 重新加载提示词列表
  await loadPrompts()
  // 触发更新事件，通知父组件更新状态
  emit('prompts-updated', prompts.value)
}

// 添加提示词到本地存储（降级方案）
const addPromptToLocal = async () => {
  const newPrompt = {
    id: Date.now().toString(),
    name: form.name.trim(),
    content: form.content.trim(),
    createdAt: Date.now()
  }
  
  prompts.value.unshift(newPrompt)
  savePromptsToLocal()
}

// 编辑提示词
const editPrompt = (prompt) => {
  editingPrompt.value = prompt
  form.name = prompt.name || ''
  form.content = prompt.content || ''
  
  // 确保表单验证状态重置
  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

// 更新提示词
const updatePrompt = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    // 检查名称是否重复（排除当前编辑的）
    const existingPrompt = prompts.value.find(p => p.name === form.name && p.id !== editingPrompt.value.id)
    if (existingPrompt) {
      ElMessage.error('提示词名称已存在')
      return
    }
    
    const token = localStorage.getItem('token')
    
    if (token) {
      // 已登录，使用API更新
      await updatePromptToServer()
    } else {
      // 未登录，使用本地存储
      await updatePromptToLocal()
    }
    
    ElMessage.success('更新成功')
    resetForm()
    // 触发更新事件，通知父组件更新状态
    emit('prompts-updated', prompts.value)
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error('更新失败')
  }
}

// 更新提示词到服务器
const updatePromptToServer = async () => {
  await updateCommonPrompt(editingPrompt.value.id, {
    name: form.name.trim(),
    content: form.content.trim()
  })
  
  // 重新加载提示词列表
  await loadPrompts()
  // 触发更新事件，通知父组件更新状态
  emit('prompts-updated', prompts.value)
}

// 更新提示词到本地存储（降级方案）
const updatePromptToLocal = async () => {
  const index = prompts.value.findIndex(p => p.id === editingPrompt.value.id)
  if (index > -1) {
    prompts.value[index] = {
      ...prompts.value[index],
      name: form.name.trim(),
      content: form.content.trim(),
      updatedAt: Date.now()
    }
    
    savePromptsToLocal()
  }
}

// 删除提示词
const deletePrompt = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除这个常用提示词吗？', '确认删除', {
      type: 'warning'
    })
    
    const token = localStorage.getItem('token')
    
    if (token) {
      // 已登录，使用API删除
      await deletePromptFromServer(id)
    } else {
      // 未登录，使用本地存储
      await deletePromptFromLocal(id)
    }
    
    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 从服务器删除提示词
const deletePromptFromServer = async (id) => {
  await deleteCommonPrompt(id)
  
  // 重新加载提示词列表
  await loadPrompts()
  
  // 触发更新事件，通知父组件更新状态
  emit('prompts-updated', prompts.value)
}

// 从本地存储删除提示词（降级方案）
const deletePromptFromLocal = async (id) => {
  const index = prompts.value.findIndex(prompt => prompt.id === id)
  if (index > -1) {
    prompts.value.splice(index, 1)
    savePromptsToLocal()
    
    // 触发更新事件，通知父组件更新状态
    emit('prompts-updated', prompts.value)
  }
}

// 取消编辑
const cancelEdit = () => {
  editingPrompt.value = null
  resetForm()
}

// 重置表单
const resetForm = () => {
  form.name = ''
  form.content = ''
  editingPrompt.value = null
  if (formRef.value) {
    formRef.value.resetFields()
  }
}

// 从服务器加载常用提示词
const loadPrompts = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      // 未登录时使用本地存储
      loadPromptsFromLocal()
      return
    }

    const result = await getCommonPrompts()
    if (result.success) {
      prompts.value = result.data.map(prompt => ({
        id: prompt.id.toString(),
        name: prompt.title || prompt.name,
        content: prompt.content,
        createdAt: new Date(prompt.created_at).getTime()
      }))
    } else {
      throw new Error(result.message || '加载失败')
    }
  } catch (error) {
    console.error('从服务器加载常用提示词失败:', error)
    // 降级到本地存储
    loadPromptsFromLocal()
  }
}

// 从本地存储加载常用提示词（降级方案）
const loadPromptsFromLocal = () => {
  try {
    const stored = localStorage.getItem('commonPrompts')
    if (stored) {
      prompts.value = JSON.parse(stored)
    } else {
      // 初始化默认提示词
      prompts.value = [
        {
          id: '1',
          name: '金属框眼镜',
          content: 'Her thin-framed glasses add a touch of sophistication.',
          createdAt: Date.now() - 86400000
        },
        {
          id: '2',
          name: '人物还原',
          content: 'Please fully restore the facial features and hairstyles of the individuals in the uploaded images.',
          createdAt: Date.now() - 172800000
        },
        {
          id: '3',
          name: '马尾辫绿色丝带',
          content: 'Her dark hair is pulled back in a low ponytail and tied with a silky dark green scarf with a subtle floral or leaf pattern, tied in a soft bow.',
          createdAt: Date.now() - 259200000
        }
      ]
      savePromptsToLocal()
    }
  } catch (error) {
    console.error('加载本地常用提示词失败:', error)
    prompts.value = []
  }
}

// 保存提示词到服务器或本地存储
const savePrompts = async () => {
  const token = localStorage.getItem('token')
  if (!token) {
    // 未登录时使用本地存储
    savePromptsToLocal()
    return
  }

  // 已登录时，提示词会自动通过API保存，这里不需要额外操作
  emit('prompts-updated')
}

// 保存提示词到本地存储（降级方案）
const savePromptsToLocal = () => {
  try {
    localStorage.setItem('commonPrompts', JSON.stringify(prompts.value))
  } catch (error) {
    console.error('保存常用提示词失败:', error)
  }
}

// 格式化日期
const formatDate = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 暴露方法给父组件
defineExpose({
  loadPrompts
})
</script>

<style scoped>
.common-prompts-manager {
  display: flex;
  flex-direction: row;
  height: 60vh;
  max-height: 60vh;
  gap: 20px;
}

/* 左侧：添加/编辑区域 - 固定宽度 */
.add-section {
  flex: 0 0 350px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  overflow-y: auto;
}

.add-section h4 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
  height: 24px; /* 与右侧标题高度对齐 */
  line-height: 24px;
}

/* 右侧：列表区域 - 可滚动 */
.list-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 重要：允许flex子元素收缩 */
  padding: 16px; /* 与左侧区域保持一致的padding */
}

.list-section h4 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
  height: 24px; /* 与左侧标题高度对齐 */
  line-height: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.prompts-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px; /* 为滚动条留出空间 */
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

.prompt-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  margin-bottom: 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.prompt-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.prompt-info {
  flex: 1;
  margin-right: 16px;
}

.prompt-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  font-size: 15px;
  line-height: 1.4;
}

.prompt-content {
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  margin-bottom: 8px;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.prompt-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-date,
.prompt-updated {
  font-size: 11px;
  color: #909399;
  line-height: 1.3;
}

.prompt-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.prompt-actions .el-button {
  padding: 6px 12px;
  font-size: 12px;
  min-width: 60px;
}

/* 表单样式优化 */
:deep(.el-form-item__label) {
  font-weight: 500;
  color: #606266;
}

:deep(.el-textarea__inner) {
  resize: vertical;
  min-height: 100px;
}

:deep(.el-input__inner) {
  border-radius: 6px;
}

:deep(.el-textarea__inner) {
  border-radius: 6px;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .common-prompts-manager {
    flex-direction: column;
    height: 70vh;
  }
  
  .add-section {
    flex: 0 0 auto;
    margin-bottom: 20px;
  }
  
  .list-section {
    flex: 1;
  }
}

@media (max-width: 768px) {
  .prompt-item {
    flex-direction: column;
    align-items: stretch;
  }
  
  .prompt-info {
    margin-right: 0;
    margin-bottom: 12px;
  }
  
  .prompt-actions {
    flex-direction: row;
    justify-content: flex-end;
  }
}
</style>



