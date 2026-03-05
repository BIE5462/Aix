<template>
  <el-dialog
    v-model="visible"
    title="提示词管理"
    width="90%"
    :before-close="handleClose"
  >
    <div class="prompt-manager">
      <!-- 搜索和添加按钮 -->
      <div class="manager-header">
        <el-input
          v-model="searchText"
          placeholder="搜索提示词..."
          clearable
          style="width: 300px"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
                 <el-button type="primary" @click="showAddDialog = true">
           <el-icon><Plus /></el-icon>
           添加提示词
         </el-button>
         <div class="storage-info">
           <el-tooltip :content="`存储使用: ${getStorageInfo().sizeText} (${getStorageInfo().count} 个提示词)`" placement="bottom">
             <el-icon><InfoFilled /></el-icon>
           </el-tooltip>
           <span class="storage-text">{{ getStorageInfo().count }} 个提示词</span>
         </div>
      </div>

      <!-- 图像卡片列表 -->
      <div class="prompt-grid">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <LoadingCard 
            title="加载提示词中..." 
            subtitle="正在获取您的个人提示词"
            size="medium"
          />
        </div>
        
        <!-- 空状态 -->
        <div v-else-if="filteredPrompts.length === 0" class="empty-state">
          <el-icon class="empty-icon"><Document /></el-icon>
          <h3>暂无提示词</h3>
          <p>点击上方"添加提示词"按钮创建您的第一个提示词</p>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            立即添加
          </el-button>
        </div>
        
        <!-- 提示词卡片 -->
        <div
          v-else
          v-for="prompt in filteredPrompts"
          :key="prompt.id"
          class="prompt-card"
          @click="selectPrompt(prompt)"
        >
          <div class="card-image">
            <img 
              v-if="prompt.coverImageUrl || prompt.referenceImage" 
              :src="prompt.coverImageUrl || prompt.referenceImage" 
              :alt="prompt.title"
              @error="handleImageError"
            />
            <div v-else class="no-image">
              <el-icon size="48"><Picture /></el-icon>
              <span>暂无图片</span>
            </div>
          </div>
          <div class="card-content">
            <h4 class="card-title">{{ prompt.title }}</h4>
            <p class="card-text">{{ prompt.content }}</p>
            <div v-if="prompt.modelName" class="card-model">
              <el-tag size="small" type="info">{{ prompt.modelName }}</el-tag>
            </div>
          </div>
          <div class="card-actions">
            <el-button
              type="primary"
              size="small"
              @click.stop="selectPrompt(prompt)"
            >
              使用
            </el-button>
            <el-button
              type="warning"
              size="small"
              @click.stop="editPrompt(prompt)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              @click.stop="deletePrompt(prompt.id)"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑提示词对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingPrompt ? '编辑提示词' : '添加提示词'"
      width="600px"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="80px"
      >
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入提示词标题" />
        </el-form-item>
        
        <el-form-item label="内容" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            placeholder="请输入提示词内容"
          />
          <!-- 常用提示词 -->
          <div class="common-prompts">
            <div class="common-prompts-label">常用提示词：</div>
            <div class="common-prompts-buttons">
              <el-button
                size="small"
                type="info"
                plain
                @click="addCommonPrompt('金属框眼镜： Her thin-framed glasses add a touch of sophistication.')"
              >
                金属框眼镜
              </el-button>
              <el-button
                size="small"
                type="info"
                plain
                @click="addCommonPrompt('人物还原：Please fully restore the facial features and hairstyles of the individuals in the uploaded images.')"
              >
                人物还原
              </el-button>
            </div>
          </div>
        </el-form-item>
        
        <el-form-item label="参考图">
          <el-upload
            class="reference-upload"
            :show-file-list="false"
            :before-upload="handleImageUpload"
            accept="image/*"
          >
            <div v-if="form.referenceImage" class="image-preview">
              <img :src="form.referenceImage" alt="参考图" />
              <div class="image-actions">
                <el-button type="danger" size="small" @click="removeImage">
                  删除
                </el-button>
              </div>
            </div>
            <el-button v-else type="primary" plain>
              <el-icon><Upload /></el-icon>
              上传参考图
            </el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="savePrompt">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LoadingCard from './LoadingCard.vue'
import { uploadToOSS } from '@/api/ossApi'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'select-prompt', 'prompts-updated'])

// 响应式数据
const visible = ref(false)
const searchText = ref('')
const showAddDialog = ref(false)
const editingPrompt = ref(null)
const formRef = ref()
const loading = ref(false)

// 表单数据
const form = reactive({
  title: '',
  content: '',
  referenceImage: ''
})

// 表单验证规则
const rules = {
  title: [
    { required: true, message: '请输入提示词标题', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入提示词内容', trigger: 'blur' }
  ]
}

// 提示词列表
const prompts = ref([])

// 计算属性
const filteredPrompts = computed(() => {
  if (!searchText.value) {
    return prompts.value
  }
  return prompts.value.filter(prompt => 
    prompt.title.toLowerCase().includes(searchText.value.toLowerCase()) ||
    prompt.content.toLowerCase().includes(searchText.value.toLowerCase())
  )
})

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
}

// 选择提示词
const selectPrompt = (prompt) => {
  emit('select-prompt', prompt)
  visible.value = false
}

// 编辑提示词
const editPrompt = (prompt) => {
  editingPrompt.value = prompt
  form.title = prompt.title
  form.content = prompt.content
  form.referenceImage = prompt.referenceImage || ''
  showAddDialog.value = true
}

// 添加常用提示词
const addCommonPrompt = (commonPrompt) => {
  if (form.content.trim()) {
    form.content = commonPrompt + ', ' + form.content
  } else {
    form.content = commonPrompt
  }
}

// 删除提示词
const deletePrompt = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除这个提示词吗？', '确认删除', {
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
      console.error('删除提示词失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 从服务器删除提示词
const deletePromptFromServer = async (id) => {
  const token = localStorage.getItem('token')
  
  const response = await fetch(`/api/prompts/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '删除失败')
  }
  
  // 重新加载提示词列表
  await loadPrompts()
}

// 从本地存储删除提示词（降级方案）
const deletePromptFromLocal = async (id) => {
  const index = prompts.value.findIndex(prompt => prompt.id === id)
  if (index > -1) {
    prompts.value.splice(index, 1)
    savePromptsToLocal()
  }
}

// 压缩图片
const compressImage = (file, maxWidth = 800, quality = 0.8) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      // 计算压缩后的尺寸
      let { width, height } = img
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      
      canvas.width = width
      canvas.height = height
      
      // 绘制压缩后的图片
      ctx.drawImage(img, 0, 0, width, height)
      
      // 转换为base64
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve(compressedDataUrl)
    }
    
    img.src = URL.createObjectURL(file)
  })
}

// 处理图片上传
const handleImageUpload = async (file) => {
  try {
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) { // 5MB
      ElMessage.warning('图片文件过大，将进行压缩处理')
    }
    
    // 显示上传进度
    const loadingMessage = ElMessage({
      message: '正在上传图片到云端...',
      type: 'info',
      duration: 0, // 不自动关闭
      showClose: false
    })
    
    try {
      // 先压缩图片
      const compressedImage = await compressImage(file)
      
      // 将压缩后的图片转换为File对象用于OSS上传
      const compressedFile = await dataURLToFile(compressedImage, file.name)
      
      // 上传到OSS
      const ossUrl = await uploadToOSS(compressedFile)
      
      // 使用OSS URL而不是base64
      form.referenceImage = ossUrl
      
      loadingMessage.close()
      ElMessage.success('图片上传成功')
    } catch (uploadError) {
      loadingMessage.close()
      console.error('OSS上传失败:', uploadError)
      
      // 直接显示错误信息，不使用本地存储
      ElMessage.error(`图片上传失败: ${uploadError.message}`)
      return // 停止处理，不设置图片
    }
  } catch (error) {
    console.error('图片处理失败:', error)
    ElMessage.error('图片处理失败')
  }
  return false // 阻止自动上传
}

// 将dataURL转换为File对象
const dataURLToFile = (dataURL, filename) => {
  return new Promise((resolve) => {
    const arr = dataURL.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    const file = new File([u8arr], filename, { type: mime })
    resolve(file)
  })
}

// 删除图片
const removeImage = () => {
  form.referenceImage = ''
}

// 处理图片加载错误
const handleImageError = (event) => {
  if (!event || !event.target) {
    console.warn('[PromptManager] 图片加载错误：无效的事件对象')
    return
  }

  try {
    // 隐藏加载失败的图片
    event.target.style.display = 'none'

    // 显示占位符（如果存在）
    if (event.target.nextElementSibling) {
      event.target.nextElementSibling.style.display = 'flex'
    } else {
      console.warn('[PromptManager] 图片加载错误：未找到占位符元素')
    }
  } catch (error) {
    console.error('[PromptManager] 处理图片错误失败:', error)
  }
}

// 保存提示词
const savePrompt = async () => {
  try {
    await formRef.value.validate()
    
    const token = localStorage.getItem('token')
    
    if (token) {
      // 已登录，使用API保存
      await savePromptToServer()
    } else {
      // 未登录，使用本地存储
      await savePromptToLocal()
    }
    
    showAddDialog.value = false
    resetForm()
    ElMessage.success(editingPrompt.value ? '更新成功' : '保存成功')
  } catch (error) {
    console.error('保存提示词失败:', error)
    ElMessage.error('保存失败')
  }
}

// 保存提示词到服务器
const savePromptToServer = async () => {
  const token = localStorage.getItem('token')
  const formData = new FormData()

  formData.append('title', form.title)
  formData.append('content', form.content)

  console.log('[PromptManager] 保存提示词:', {
    mode: editingPrompt.value ? '编辑' : '新增',
    id: editingPrompt.value?.id,
    title: form.title,
    content: form.content,
    hasImage: !!form.referenceImage
  })

  // 添加模型ID
  const selectedModelId = localStorage.getItem('selectedModelId')
  if (selectedModelId) {
    formData.append('modelId', selectedModelId)
  }

  // 🔧 修复：保留原有的其他字段（编辑模式）
  if (editingPrompt.value) {
    // 保留原有的标签、常用提示词选择等字段
    if (editingPrompt.value.tags) {
      formData.append('tags', editingPrompt.value.tags)
    }
    if (editingPrompt.value.selected_common_prompts) {
      formData.append('selectedCommonPrompts', editingPrompt.value.selected_common_prompts)
    }
    if (editingPrompt.value.selected_reference_images) {
      formData.append('selectedReferenceImages', editingPrompt.value.selected_reference_images)
    }
    if (editingPrompt.value.generation_mode) {
      formData.append('generationMode', editingPrompt.value.generation_mode)
    }
    if (editingPrompt.value.image_size) {
      formData.append('imageSize', editingPrompt.value.image_size)
    }
    if (editingPrompt.value.generate_quantity) {
      formData.append('generateQuantity', editingPrompt.value.generate_quantity)
    }
  }

  // 如果有图片，添加到FormData
  if (form.referenceImage) {
    if (form.referenceImage.startsWith('data:')) {
      // 如果是base64图片，转换为File对象
      const file = await dataURLToFile(form.referenceImage, 'reference.jpg')
      formData.append('referenceImage', file)
    } else if (form.referenceImage.startsWith('http')) {
      // 如果是OSS URL，直接传递URL
      formData.append('referenceImageUrl', form.referenceImage)
    }
  }

  let url = '/api/prompts'
  let method = 'POST'

  if (editingPrompt.value) {
    // 编辑模式
    url = `/api/prompts/${editingPrompt.value.id}`
    method = 'PUT'
  }

  const response = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '保存失败')
  }

  const result = await response.json()
  console.log('[PromptManager] 保存成功:', result)

  // 重新加载提示词列表
  await loadPrompts()

  // 🔧 修复：触发更新事件，通知父组件刷新
  emit('prompts-updated')
}

// 保存提示词到本地存储（降级方案）
const savePromptToLocal = async () => {
  if (editingPrompt.value) {
    // 编辑模式
    const index = prompts.value.findIndex(prompt => prompt.id === editingPrompt.value.id)
    if (index > -1) {
      prompts.value[index] = {
        ...prompts.value[index],
        title: form.title,
        content: form.content,
        referenceImage: form.referenceImage,
        updatedAt: Date.now()
      }
    }
  } else {
    // 新增模式
    const newPrompt = {
      id: Date.now().toString(),
      title: form.title,
      content: form.content,
      referenceImage: form.referenceImage,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    prompts.value.unshift(newPrompt)
  }
  
  savePromptsToLocal()
}

// 重置表单
const resetForm = () => {
  form.title = ''
  form.content = ''
  form.referenceImage = ''
  editingPrompt.value = null
}

// 从服务器加载提示词
const loadPrompts = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      // 未登录时使用本地存储
      loadPromptsFromLocal()
      return
    }

    const response = await fetch('/api/prompts', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        prompts.value = result.data.map(prompt => ({
          id: prompt.id.toString(),
          title: prompt.title,
          content: prompt.content,
          referenceImage: prompt.reference_image_url || '',
          coverImageUrl: prompt.cover_image_url || '',
          createdAt: new Date(prompt.created_at).getTime(),
          updatedAt: new Date(prompt.updated_at).getTime()
        }))
      } else {
        throw new Error(result.message || '加载失败')
      }
    } else {
      throw new Error('网络请求失败')
    }
  } catch (error) {
    console.error('从服务器加载提示词失败:', error)
    // 降级到本地存储
    loadPromptsFromLocal()
  } finally {
    loading.value = false
  }
}

// 从本地存储加载提示词（降级方案）
const loadPromptsFromLocal = () => {
  try {
    const stored = localStorage.getItem('promptManager')
    if (stored) {
      prompts.value = JSON.parse(stored)
    } else {
      // 初始化一些示例提示词
      prompts.value = [
        {
          id: '1',
          title: '可爱猫咪',
          content: '一只可爱的猫咪，柔软的毛发，大眼睛，阳光下微笑，高清，细节丰富',
          referenceImage: '',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000
        },
        {
          id: '2',
          title: '梦幻森林',
          content: '梦幻的森林场景，阳光透过树叶洒下，雾气缭绕，神秘而美丽，超现实主义风格',
          referenceImage: '',
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now() - 172800000
        },
        {
          id: '3',
          title: '未来城市',
          content: '未来主义城市景观，高楼大厦，霓虹灯闪烁，赛博朋克风格，科技感十足',
          referenceImage: '',
          createdAt: Date.now() - 259200000,
          updatedAt: Date.now() - 259200000
        }
      ]
      savePromptsToLocal()
    }
  } catch (error) {
    console.error('加载本地提示词失败:', error)
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
    // 检查存储空间
    if (!checkStorageSpace()) {
      // 尝试清理旧数据
      if (!cleanupOldData()) {
        throw new Error('存储空间不足且无法清理旧数据')
      }
    }
    
    const dataToSave = JSON.stringify(prompts.value)
    
    // 检查数据大小（由于图片已上传到OSS，限制可以放宽）
    const dataSize = new Blob([dataToSave]).size
    const maxSize = 8 * 1024 * 1024 // 8MB限制（提高限制）
    
    if (dataSize > maxSize) {
      // 如果数据仍然太大，尝试进一步清理
      if (!cleanupOldData()) {
        throw new Error('数据过大，请删除一些提示词')
      }
      // 重新尝试保存
      const newDataToSave = JSON.stringify(prompts.value)
      localStorage.setItem('promptManager', newDataToSave)
    } else {
      localStorage.setItem('promptManager', dataToSave)
    }
    
    // 触发提示词更新事件
    emit('prompts-updated')
  } catch (error) {
    console.error('保存提示词失败:', error)
    ElMessage.error(`保存失败: ${error.message}`)
    throw error
  }
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取存储使用情况
const getStorageInfo = () => {
  try {
    const data = localStorage.getItem('promptManager')
    if (!data) return { size: 0, count: 0 }
    
    const size = new Blob([data]).size
    const prompts = JSON.parse(data)
    return {
      size: size,
      count: prompts.length,
      sizeText: formatFileSize(size)
    }
  } catch (error) {
    return { size: 0, count: 0, sizeText: '0 B' }
  }
}

// 检查存储空间
const checkStorageSpace = () => {
  try {
    const testKey = 'storage_test'
    const testData = 'x'.repeat(1024) // 1KB测试数据
    localStorage.setItem(testKey, testData)
    localStorage.removeItem(testKey)
    return true
  } catch (error) {
    return false
  }
}

// 清理旧数据
const cleanupOldData = () => {
  try {
    // 按创建时间排序，删除最旧的数据
    const sortedPrompts = [...prompts.value].sort((a, b) => a.createdAt - b.createdAt)
    const maxItems = 100 // 最多保留100个提示词（提高限制）

    if (sortedPrompts.length > maxItems) {
      const toDelete = sortedPrompts.slice(0, sortedPrompts.length - maxItems)
      prompts.value = sortedPrompts.slice(-maxItems)

      ElMessage.warning(`存储空间不足，已自动删除 ${toDelete.length} 个旧提示词`)
      return true
    }
    return false
  } catch (error) {
    console.error('清理数据失败:', error)
    return false
  }
}
</script>

<style scoped>
.prompt-manager {
  height: 600px;
  display: flex;
  flex-direction: column;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
  gap: 16px;
}

.storage-info {
  display: flex;
  align-items: center;
  color: #909399;
  font-size: 14px;
  gap: 8px;
}

.storage-info .el-icon {
  font-size: 16px;
  cursor: pointer;
}

.storage-info:hover {
  color: #409eff;
}

.storage-text {
  font-size: 12px;
  color: #909399;
}

.prompt-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  overflow-y: auto;
  padding: 10px 0;
}

.prompt-card {
  background: var(--glass-level-2-bg);
  border: var(--glass-level-1-border);
  border-radius: 12px;
  overflow: visible;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.prompt-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-color: #409eff;
}

.card-image {
  width: 100%;
  height: 300px; /* 2:3比例：200px * 1.5 = 300px */
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.prompt-card:hover .card-image img {
  transform: scale(1.05);
}

.no-image {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.no-image span {
  margin-top: 8px;
  font-size: 14px;
}

.card-content {
  padding: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.card-text {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-model {
  margin-bottom: 16px;
}

.card-model .el-tag {
  font-size: 12px;
}

.card-actions {
  padding: 0 16px 16px 16px;
  display: flex;
  gap: 8px;
}

.card-actions .el-button {
  flex: 1;
  font-size: 12px;
  min-height: 32px;
  padding: 6px 12px;
}

.common-prompts {
  margin-top: 12px;
}

.common-prompts-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.common-prompts-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.common-prompts-buttons .el-button {
  font-size: 12px;
  padding: 4px 8px;
  height: auto;
}

.reference-upload {
  width: 100%;
}

.image-preview {
  position: relative;
  width: 200px;
  height: 150px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
}

/* 滚动条样式 */
.prompt-grid::-webkit-scrollbar {
  width: 6px;
}

.prompt-grid::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.prompt-grid::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.prompt-grid::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 加载状态 */
.loading-state {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

/* 空状态 */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  text-align: center;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  color: #c0c4cc;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-main);
}

.empty-state p {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: #999;
  max-width: 300px;
  line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .prompt-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .manager-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .manager-header .el-input {
    width: 100% !important;
  }
}
</style>
