<template>
  <div class="model-management">
    <!-- 可滚动内容区域 -->
    <div class="scrollable-content">
      <el-card>
        <template #header>
          <div class="card-header">
            <span>AI模型列表</span>
            <el-button type="primary" @click="showAddModelDialog">
              <el-icon><Plus /></el-icon>
              添加模型
            </el-button>
          </div>
        </template>
        
        <el-table
          v-loading="loading"
          :data="models"
          stripe
        >
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="name" label="模型名称" width="150" />
          <el-table-column prop="model_type" label="模型类型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.model_type === 'video' ? 'primary' : 'success'">
                {{ row.model_type === 'video' ? '视频' : '图像' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="base_url" label="API地址" min-width="200" />
          <el-table-column prop="description" label="描述" min-width="200" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'danger'">
                {{ row.is_active ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="默认模型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_default ? 'warning' : 'info'">
                {{ row.is_default ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180" />
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <div class="action-buttons">
                <!-- 第一行：状态和默认设置 -->
                <div class="action-row">
                  <el-button
                    size="small"
                    :type="row.is_active ? 'danger' : 'success'"
                    @click="toggleModelStatus(row)"
                    class="action-btn"
                  >
                    {{ row.is_active ? '禁用' : '启用' }}
                  </el-button>
                  
                  <el-button
                    size="small"
                    :type="row.is_default ? 'info' : 'warning'"
                    @click="setDefaultModel(row)"
                    :disabled="row.is_default"
                    class="action-btn"
                  >
                    {{ row.is_default ? '默认' : '设为默认' }}
                  </el-button>
                </div>
                
                <!-- 第二行：编辑和删除 -->
                <div class="action-row">
                  <el-button 
                    size="small" 
                    @click="editModel(row)"
                    class="action-btn action-btn-primary"
                  >
                    编辑
                  </el-button>
                  
                  <el-button
                    size="small"
                    type="danger"
                    @click="deleteModel(row)"
                    :disabled="row.is_default"
                    class="action-btn action-btn-danger"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
    
    <!-- 添加/编辑模型对话框 -->
    <el-dialog
      v-model="modelDialogVisible"
      :title="isEditModel ? '编辑模型' : '添加模型'"
      width="600px"
    >
      <el-form :model="modelForm" :rules="modelRules" ref="modelFormRef" label-width="100px">
        <el-form-item label="模型名称" prop="name">
          <el-input v-model="modelForm.name" placeholder="请输入模型名称" />
        </el-form-item>
        
        <el-form-item label="模型类型" prop="model_type">
          <el-select v-model="modelForm.model_type" placeholder="请选择模型类型" style="width: 100%">
            <el-option label="图像模型" value="image" />
            <el-option label="视频模型" value="video" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="API密钥" prop="api_key">
          <el-input
            v-model="modelForm.api_key"
            type="password"
            placeholder="请输入API密钥"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="API地址" prop="base_url">
          <el-input v-model="modelForm.base_url" placeholder="请输入API基础URL" />
        </el-form-item>
        
        <el-form-item label="状态">
          <el-switch
            v-model="modelForm.is_active"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
        
        <el-form-item label="设为默认">
          <el-switch
            v-model="modelForm.is_default"
            active-text="是"
            inactive-text="否"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="modelDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveModel">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/index.js'

export default {
  name: 'ModelManagement',
  setup() {
    const loading = ref(false)
    const models = ref([])
    
    const modelDialogVisible = ref(false)
    const isEditModel = ref(false)
    const modelFormRef = ref()
    const modelForm = reactive({
      id: null,
      name: '',
      model_type: 'image',
      api_key: '',
      base_url: '',
      is_active: true,
      is_default: false
    })
    
    const modelRules = {
      name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
      model_type: [{ required: true, message: '请选择模型类型', trigger: 'change' }],
      api_key: [{ required: true, message: '请输入API密钥', trigger: 'blur' }],
      base_url: [{ required: true, message: '请输入API地址', trigger: 'blur' }]
    }
    
    const fetchModels = async () => {
      try {
        loading.value = true
        const response = await api.get('/models')
        
        if (response.data.success) {
          models.value = response.data.models
        } else {
          ElMessage.error('获取模型列表失败')
        }
      } catch (error) {
        console.error('获取模型列表失败:', error)
        ElMessage.error('获取模型列表失败')
      } finally {
        loading.value = false
      }
    }
    
    const showAddModelDialog = () => {
      isEditModel.value = false
      modelForm.id = null
      modelForm.name = ''
      modelForm.model_type = 'image'
      modelForm.api_key = ''
      modelForm.base_url = ''
      modelForm.is_active = true
      modelForm.is_default = false
      modelDialogVisible.value = true
    }
    
    const editModel = (model) => {
      isEditModel.value = true
      modelForm.id = model.id
      modelForm.name = model.name
      modelForm.model_type = model.model_type || 'image'
      modelForm.api_key = model.api_key
      modelForm.base_url = model.base_url
      modelForm.is_active = model.is_active
      modelForm.is_default = model.is_default
      modelDialogVisible.value = true
    }
    
    const saveModel = async () => {
      if (!modelFormRef.value) return
      
      try {
        const valid = await modelFormRef.value.validate()
        if (!valid) return
        
        const url = isEditModel.value ? `/models/${modelForm.id}` : '/models'
        const method = isEditModel.value ? 'put' : 'post'
        
        const modelData = {
          name: modelForm.name,
          model_type: modelForm.model_type,
          api_key: modelForm.api_key,
          base_url: modelForm.base_url,
          is_active: modelForm.is_active,
          is_default: modelForm.is_default
        }
        
        const response = await api[method](url, modelData)
        
        if (response.data.success) {
          ElMessage.success(isEditModel.value ? '模型更新成功' : '模型添加成功')
          modelDialogVisible.value = false
          fetchModels()
        } else {
          ElMessage.error('操作失败')
        }
      } catch (error) {
        console.error('保存模型失败:', error)
        ElMessage.error('操作失败')
      }
    }
    
    const toggleModelStatus = async (model) => {
      try {
        const newStatus = !model.is_active
        const response = await api.put(`/models/${model.id}/status`, {
          is_active: newStatus,
          model_type: model.model_type || 'image'
        })
        
        if (response.data.success) {
          model.is_active = newStatus
          ElMessage.success(`模型已${newStatus ? '启用' : '禁用'}`)
        } else {
          ElMessage.error('操作失败')
        }
      } catch (error) {
        console.error('切换模型状态失败:', error)
        ElMessage.error('操作失败')
      }
    }
    
    const setDefaultModel = async (model) => {
      try {
        await ElMessageBox.confirm(
          `确定要将 "${model.name}" 设为默认模型吗？`,
          '确认设置',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const response = await api.put(`/models/${model.id}/default`, {
          model_type: model.model_type || 'image'
        })
        
        if (response.data.success) {
          ElMessage.success('默认模型设置成功')
          fetchModels()
        } else {
          ElMessage.error('设置失败')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('设置默认模型失败:', error)
          ElMessage.error('设置失败')
        }
      }
    }
    
    const deleteModel = async (model) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除模型 "${model.name}" 吗？此操作不可恢复！`,
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const response = await api.delete(`/models/${model.id}`, {
          data: {
            model_type: model.model_type || 'image'
          }
        })
        
        if (response.data.success) {
          ElMessage.success('模型删除成功')
          fetchModels()
        } else {
          ElMessage.error('删除失败')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除模型失败:', error)
          ElMessage.error('删除失败')
        }
      }
    }
    
    onMounted(() => {
      fetchModels()
    })
    
    return {
      loading,
      models,
      modelDialogVisible,
      isEditModel,
      modelFormRef,
      modelForm,
      modelRules,
      fetchModels,
      showAddModelDialog,
      editModel,
      saveModel,
      toggleModelStatus,
      setDefaultModel,
      deleteModel
    }
  }
}
</script>

<style scoped>
.model-management {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f5f5;
  max-width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

:deep(.el-card) {
  border: none;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  margin: 0 auto;
  width: 100%;
}

:deep(.el-card__body) {
  padding: 20px;
}

:deep(.el-table) {
  font-size: 14px;
}

:deep(.el-button + .el-button) {
  margin-left: 8px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.action-row {
  display: flex;
  gap: 6px;
  justify-content: center;
  width: 100%;
}

.action-btn {
  min-width: 80px;
  height: 28px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.action-btn-primary {
  min-width: 70px;
}

.action-btn-danger {
  min-width: 70px;
}

</style>

