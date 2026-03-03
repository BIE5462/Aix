<template>
  <div class="page-container">
    <el-card class="card" shadow="hover">
      <div class="card-header">
        <div class="card-title">模型价格管理</div>
        <div>
          <el-button type="primary" size="small" @click="openCreateDialog">
            新增价格配置
          </el-button>
          <el-button size="small" @click="fetchPricingList">
            刷新
          </el-button>
        </div>
      </div>

      <el-form :inline="true" :model="query" class="filter-form" size="small">
        <el-form-item label="模型类型">
          <el-select v-model="query.model_type" placeholder="全部" clearable style="width: 140px">
            <el-option label="图像模型" value="image" />
            <el-option label="视频模型" value="video" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.is_active" placeholder="全部" clearable style="width: 140px">
            <el-option label="已启用" :value="true" />
            <el-option label="已禁用" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchPricingList">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="pricingList" v-loading="loading" border>
        <el-table-column prop="model_key" label="模型标识" min-width="180" />
        <el-table-column prop="model_name" label="模型名称" min-width="160" />
        <el-table-column prop="model_type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.model_type === 'image' ? 'success' : 'info'">
              {{ row.model_type === 'image' ? '图像' : '视频' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="pricing_type" label="计费方式" width="120">
          <template #default="{ row }">
            <span v-if="row.pricing_type === 'fixed'">固定价格</span>
            <span v-else-if="row.pricing_type === 'per_second'">按秒计费</span>
            <span v-else-if="row.pricing_type === 'per_resolution'">按分辨率计费</span>
            <span v-else>未知</span>
          </template>
        </el-table-column>
        <el-table-column label="价格说明" min-width="220">
          <template #default="{ row }">
            <span v-if="row.pricing_type === 'fixed'">
              {{ row.base_price }} 弹珠/次
            </span>
            <span v-else-if="row.pricing_type === 'per_second'">
              {{ row.price_per_second }} 弹珠/秒（支持：{{ row.supported_durations?.join(' / ') }} 秒）
            </span>
            <span v-else-if="row.pricing_type === 'per_resolution'">
              <span v-for="(value, key) in row.resolution_pricing" :key="key">
                {{ key }} = {{ value }} 弹珠；
              </span>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_active ? 'success' : 'info'">
              {{ row.is_active ? '已启用' : '已禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" text @click="openEditDialog(row)">
              编辑
            </el-button>
            <el-button
              type="warning"
              size="small"
              text
              @click="toggleStatus(row)"
            >
              {{ row.is_active ? '禁用' : '启用' }}
            </el-button>
            <el-popconfirm
              title="确定要删除该价格配置吗？"
              confirm-button-text="确定"
              cancel-button-text="取消"
              @confirm="deletePricing(row)"
            >
              <template #reference>
                <el-button type="danger" size="small" text>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑价格配置' : '新增价格配置'"
      width="600px"
    >
      <el-form
        :model="form"
        :rules="rules"
        ref="formRef"
        label-width="120px"
      >
        <el-form-item label="模型标识" prop="model_key">
          <el-input
            v-model="form.model_key"
            :disabled="isEdit"
            placeholder="建议与 ai_models.name / 视频模型 ID 完全一致"
          />
        </el-form-item>
        <el-form-item label="模型名称" prop="model_name">
          <el-input v-model="form.model_name" placeholder="用于后台展示的名称" />
        </el-form-item>
        <el-form-item label="模型类型" prop="model_type">
          <el-select v-model="form.model_type" placeholder="请选择类型" style="width: 100%">
            <el-option label="图像模型" value="image" />
            <el-option label="视频模型" value="video" />
          </el-select>
        </el-form-item>
        <el-form-item label="计费方式" prop="pricing_type">
          <el-select v-model="form.pricing_type" placeholder="请选择计费方式" style="width: 100%">
            <el-option label="固定价格（按次）" value="fixed" />
            <el-option label="按秒计费" value="per_second" />
            <el-option label="按分辨率计费" value="per_resolution" />
          </el-select>
        </el-form-item>

        <!-- 固定价格 -->
        <el-form-item v-if="form.pricing_type === 'fixed'" label="基础价格" prop="base_price">
          <el-input-number
            v-model="form.base_price"
            :min="0"
            :precision="2"
            :step="1"
            style="width: 100%"
          />
          <span class="form-tip">每次调用消耗的弹珠数</span>
        </el-form-item>

        <!-- 按秒计费 -->
        <el-form-item v-if="form.pricing_type === 'per_second'" label="每秒价格" prop="price_per_second">
          <el-input-number
            v-model="form.price_per_second"
            :min="0"
            :precision="2"
            :step="1"
            style="width: 100%"
          />
          <span class="form-tip">每秒消耗的弹珠数</span>
        </el-form-item>
        <el-form-item v-if="form.pricing_type === 'per_second'" label="支持时长(秒)">
          <el-select
            v-model="supportedDurationsInput"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="例如：5,10,15"
            style="width: 100%"
          >
            <el-option v-for="item in defaultDurations" :key="item" :label="item" :value="String(item)" />
          </el-select>
          <span class="form-tip">可多选或手动输入，单位秒</span>
        </el-form-item>

        <!-- 按分辨率计费（简化为 JSON 文本配置） -->
        <el-form-item v-if="form.pricing_type === 'per_resolution'" label="分辨率价格JSON">
          <el-input
            v-model="resolutionPricingInput"
            type="textarea"
            :rows="4"
            placeholder='例如：{"480p-5s": 5, "720p-5s": 8}'
          />
          <span class="form-tip">请填写合法的 JSON，对应 ModelPricingService 中的 resolution_pricing 结构</span>
        </el-form-item>

        <el-form-item label="状态">
          <el-switch v-model="form.is_active" active-text="启用" inactive-text="禁用" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="可选：用于说明模型用途、计费规则等"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/index.js'

export default {
  name: 'ModelPricingManagement',
  setup() {
    const loading = ref(false)
    const pricingList = ref([])

    const query = reactive({
      model_type: '',
      is_active: ''
    })

    const dialogVisible = ref(false)
    const isEdit = ref(false)
    const formRef = ref()
    const form = reactive({
      model_key: '',
      model_name: '',
      model_type: 'image',
      pricing_type: 'fixed',
      base_price: 2,
      price_per_second: null,
      supported_durations: [],
      resolution_pricing: {},
      is_active: true,
      description: ''
    })

    const supportedDurationsInput = ref([])
    const resolutionPricingInput = ref('')
    const defaultDurations = [5, 10, 15, 30]

    const rules = {
      model_key: [{ required: true, message: '请输入模型标识', trigger: 'blur' }],
      model_name: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
      model_type: [{ required: true, message: '请选择模型类型', trigger: 'change' }],
      pricing_type: [{ required: true, message: '请选择计费方式', trigger: 'change' }],
      base_price: [{
        validator: (rule, value, callback) => {
          if (form.pricing_type === 'fixed' && (value === null || value === undefined)) {
            callback(new Error('请输入基础价格'))
          } else {
            callback()
          }
        },
        trigger: 'blur'
      }],
      price_per_second: [{
        validator: (rule, value, callback) => {
          if (form.pricing_type === 'per_second' && (value === null || value === undefined)) {
            callback(new Error('请输入每秒价格'))
          } else {
            callback()
          }
        },
        trigger: 'blur'
      }]
    }

    const fetchPricingList = async () => {
      try {
        loading.value = true
        const params = {}
        if (query.model_type) params.model_type = query.model_type
        if (query.is_active !== '') params.is_active = String(query.is_active)

        const res = await api.get('/model-pricing', { params })
        if (res.data.success) {
          pricingList.value = res.data.data || []
        } else {
          ElMessage.error(res.data.error || '获取模型价格失败')
        }
      } catch (error) {
        console.error('获取模型价格失败:', error)
        ElMessage.error('获取模型价格失败')
      } finally {
        loading.value = false
      }
    }

    const resetQuery = () => {
      query.model_type = ''
      query.is_active = ''
      fetchPricingList()
    }

    const resetForm = () => {
      form.model_key = ''
      form.model_name = ''
      form.model_type = 'image'
      form.pricing_type = 'fixed'
      form.base_price = 2
      form.price_per_second = null
      form.supported_durations = []
      form.resolution_pricing = {}
      form.is_active = true
      form.description = ''
      supportedDurationsInput.value = []
      resolutionPricingInput.value = ''
    }

    const openCreateDialog = () => {
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }

    const openEditDialog = (row) => {
      isEdit.value = true
      form.model_key = row.model_key
      form.model_name = row.model_name
      form.model_type = row.model_type
      form.pricing_type = row.pricing_type
      form.base_price = row.base_price
      form.price_per_second = row.price_per_second
      form.supported_durations = row.supported_durations || []
      form.resolution_pricing = row.resolution_pricing || {}
      form.is_active = row.is_active
      form.description = row.description || ''

      supportedDurationsInput.value = (row.supported_durations || []).map(d => String(d))
      resolutionPricingInput.value = row.resolution_pricing ? JSON.stringify(row.resolution_pricing, null, 2) : ''

      dialogVisible.value = true
    }

    const handleSubmit = async () => {
      if (!formRef.value) return
      try {
        const valid = await formRef.value.validate()
        if (!valid) return

        // 同步辅助输入到表单字段
        if (form.pricing_type === 'per_second') {
          form.supported_durations = supportedDurationsInput.value
            .map(v => parseInt(v, 10))
            .filter(v => !Number.isNaN(v))
        } else {
          form.supported_durations = null
        }

        if (form.pricing_type === 'per_resolution') {
          if (resolutionPricingInput.value) {
            try {
              form.resolution_pricing = JSON.parse(resolutionPricingInput.value)
            } catch (e) {
              ElMessage.error('分辨率价格JSON格式不正确')
              return
            }
          } else {
            form.resolution_pricing = null
          }
        } else {
          form.resolution_pricing = null
        }

        const payload = {
          model_key: form.model_key,
          model_name: form.model_name,
          model_type: form.model_type,
          pricing_type: form.pricing_type,
          base_price: form.base_price,
          price_per_second: form.price_per_second,
          supported_durations: form.supported_durations,
          resolution_pricing: form.resolution_pricing,
          is_active: form.is_active,
          description: form.description
        }

        const res = await api.post('/model-pricing', payload)
        if (res.data.success) {
          ElMessage.success('保存成功')
          dialogVisible.value = false
          fetchPricingList()
        } else {
          ElMessage.error(res.data.error || '保存失败')
        }
      } catch (error) {
        console.error('保存模型价格失败:', error)
        ElMessage.error(error.response?.data?.error || '保存模型价格失败')
      }
    }

    const toggleStatus = async (row) => {
      try {
        const newStatus = !row.is_active
        const res = await api.put(`/model-pricing/${encodeURIComponent(row.model_key)}/status`, {
          is_active: newStatus
        })
        if (res.data.success) {
          row.is_active = newStatus
          ElMessage.success(`模型已${newStatus ? '启用' : '禁用'}`)
        } else {
          ElMessage.error(res.data.error || '切换状态失败')
        }
      } catch (error) {
        console.error('切换模型状态失败:', error)
        ElMessage.error(error.response?.data?.error || '切换模型状态失败')
      }
    }

    const deletePricing = async (row) => {
      try {
        const res = await api.delete(`/model-pricing/${encodeURIComponent(row.model_key)}`)
        if (res.data.success) {
          ElMessage.success('删除成功')
          fetchPricingList()
        } else {
          ElMessage.error(res.data.error || '删除失败')
        }
      } catch (error) {
        console.error('删除模型价格失败:', error)
        ElMessage.error(error.response?.data?.error || '删除模型价格失败')
      }
    }

    onMounted(() => {
      fetchPricingList()
    })

    return {
      loading,
      pricingList,
      query,
      dialogVisible,
      isEdit,
      form,
      formRef,
      rules,
      defaultDurations,
      supportedDurationsInput,
      resolutionPricingInput,
      fetchPricingList,
      resetQuery,
      openCreateDialog,
      openEditDialog,
      handleSubmit,
      toggleStatus,
      deletePricing
    }
  }
}
</script>

<style scoped>
.page-container {
  padding: 10px;
}

.card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.filter-form {
  margin-bottom: 10px;
}

.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>

