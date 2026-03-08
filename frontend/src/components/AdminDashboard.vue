<template>
  <div class="admin-dashboard">
    <!-- 页面头部 -->
    <div class="admin-header">
      <h1>管理员控制台</h1>
      <div class="admin-info">
        <el-tag type="success" size="large">管理员</el-tag>
        <span class="welcome-text">欢迎，{{ currentUser.username }}</span>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon users">
            <el-icon size="24"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-number">{{ stats.totalUsers }}</div>
            <div class="stat-label">总用户数</div>
          </div>
        </div>
      </el-card>

      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon images">
            <el-icon size="24"><Picture /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-number">{{ stats.totalImages }}</div>
            <div class="stat-label">总图片数</div>
          </div>
        </div>
      </el-card>

      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon today">
            <el-icon size="24"><Calendar /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-number">{{ stats.todayImages }}</div>
            <div class="stat-label">今日生成</div>
          </div>
        </div>
      </el-card>

      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon active">
            <el-icon size="24"><Connection /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-number">{{ stats.activeUsers }}</div>
            <div class="stat-label">活跃用户</div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- AI文本模型管理区域 -->
    <el-card class="text-models-management-card">
      <template #header>
        <div class="card-header">
          <h3>AI文本模型管理</h3>
        </div>
      </template>
      <AdminTextModelsManager />
    </el-card>

    <!-- 用户管理区域 -->
    <el-card class="user-management-card">
      <template #header>
        <div class="card-header">
          <h3>用户管理</h3>
          <div class="header-actions">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索用户..."
              style="width: 200px; margin-right: 10px"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" @click="loadUsers">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <!-- 用户列表 -->
      <el-table
        :data="filteredUsers"
        v-loading="usersLoading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column prop="email" label="邮箱" width="200">
          <template #default="{ row }">
            {{ row.email || '未设置' }}
          </template>
        </el-table-column>
        <el-table-column prop="is_admin" label="管理员" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_admin ? 'danger' : 'info'" size="small">
              {{ row.is_admin ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'" size="small">
              {{ row.is_active ? '活跃' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="注册时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button
              v-if="!row.is_admin"
              :type="row.is_active ? 'warning' : 'success'"
              size="small"
              @click="toggleUserStatus(row)"
            >
              {{ row.is_active ? '禁用' : '启用' }}
            </el-button>
            <el-button
              v-if="!row.is_admin"
              type="danger"
              size="small"
              @click="deleteUser(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="totalUsers"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 生成记录区域 -->
    <el-card class="records-card">
      <template #header>
        <div class="card-header">
          <h3>生成记录</h3>
          <div class="header-actions">
            <el-select
              v-model="recordFilter.userId"
              placeholder="选择用户"
              style="width: 150px; margin-right: 10px"
              clearable
            >
              <el-option
                v-for="user in users"
                :key="user.id"
                :label="user.username"
                :value="user.id"
              />
            </el-select>
            <el-button type="primary" @click="loadRecords">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <!-- 记录列表 -->
      <el-table
        :data="records"
        v-loading="recordsLoading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="prompt" label="提示词" min-width="200" show-overflow-tooltip />
        <el-table-column prop="image_count" label="图片数" width="100" />
        <el-table-column prop="created_at" label="生成时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="viewImages(row)"
            >
              查看图片
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 记录分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="recordCurrentPage"
          v-model:page-size="recordPageSize"
          :page-sizes="[10, 20, 50]"
          :total="totalRecords"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleRecordSizeChange"
          @current-change="handleRecordCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Picture, Calendar, Connection, Search, Refresh } from '@element-plus/icons-vue'
import AdminTextModelsManager from './AdminTextModelsManager.vue'
import { deleteAdminUser, getAdminRecords, getAdminStats, getAdminUsers, toggleAdminUserStatus } from '../api/adminApi'

const props = defineProps({
  currentUser: {
    type: Object,
    required: true
  }
})

// 统计数据
const stats = ref({
  totalUsers: 0,
  totalImages: 0,
  todayImages: 0,
  activeUsers: 0,
  adminCount: 0,
  newUsers: 0
})

// 用户管理
const users = ref([])
const usersLoading = ref(false)
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const totalUsers = ref(0)

// 生成记录
const records = ref([])
const recordsLoading = ref(false)
const recordFilter = ref({
  userId: null
})
const recordCurrentPage = ref(1)
const recordPageSize = ref(20)
const totalRecords = ref(0)

// 计算属性
const filteredUsers = computed(() => {
  if (!searchKeyword.value) return users.value
  return users.value.filter(user => 
    user.username.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchKeyword.value.toLowerCase()))
  )
})

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

// 加载统计数据
const loadStats = async () => {
  try {
    const result = await getAdminStats()
    if (result.success) {
      stats.value = result.stats
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
    ElMessage.error('加载统计数据失败')
  }
}

// 加载用户列表
const loadUsers = async () => {
  usersLoading.value = true
  try {
    const result = await getAdminUsers({
      page: currentPage.value,
      pageSize: pageSize.value
    })
    if (result.success) {
      users.value = result.users
      totalUsers.value = result.pagination.total
    }
  } catch (error) {
    console.error('加载用户列表失败:', error)
    ElMessage.error('加载用户列表失败')
  } finally {
    usersLoading.value = false
  }
}

// 加载生成记录
const loadRecords = async () => {
  recordsLoading.value = true
  try {
    const result = await getAdminRecords({
      page: recordCurrentPage.value,
      pageSize: recordPageSize.value,
      userId: recordFilter.value.userId
    })
    if (result.success) {
      records.value = result.records
      totalRecords.value = result.pagination.total
    }
  } catch (error) {
    console.error('加载生成记录失败:', error)
    ElMessage.error('加载生成记录失败')
  } finally {
    recordsLoading.value = false
  }
}

// 切换用户状态
const toggleUserStatus = async (user) => {
  try {
    const action = user.is_active ? '禁用' : '启用'
    await ElMessageBox.confirm(`确定要${action}用户 ${user.username} 吗？`, '确认操作', {
      type: 'warning'
    })

    const result = await toggleAdminUserStatus(user.id)
    if (result.success) {
      ElMessage.success(`用户已${action}`)
      loadUsers()
      loadStats()
    }
  } catch (error) {
    console.error('切换用户状态失败:', error)
    ElMessage.error('操作失败')
  }
}

// 删除用户
const deleteUser = async (user) => {
  try {
    await ElMessageBox.confirm(`确定要删除用户 ${user.username} 吗？此操作不可恢复！`, '确认删除', {
      type: 'error'
    })

    const result = await deleteAdminUser(user.id)
    if (result.success) {
      ElMessage.success('用户已删除')
      loadUsers()
      loadStats()
    }
  } catch (error) {
    console.error('删除用户失败:', error)
    ElMessage.error('删除用户失败')
  }
}

// 查看图片
const viewImages = (record) => {
  // 这里可以实现查看图片的功能
  ElMessage.info('查看图片功能待实现')
}

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = val
  loadUsers()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  loadUsers()
}

const handleRecordSizeChange = (val) => {
  recordPageSize.value = val
  loadRecords()
}

const handleRecordCurrentChange = (val) => {
  recordCurrentPage.value = val
  loadRecords()
}

// 组件挂载时加载数据
onMounted(() => {
  loadStats()
  loadUsers()
  loadRecords()
})
</script>

<style scoped>
.admin-dashboard {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100vh;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.admin-header h1 {
  margin: 0;
  color: #303133;
  font-size: 24px;
}

.admin-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.welcome-text {
  color: #606266;
  font-size: 14px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-icon.users {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-icon.images {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-icon.today {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.stat-icon.active {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.stat-info {
  flex: 1;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.user-management-card,
.records-card {
  margin-bottom: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  color: #303133;
}

.header-actions {
  display: flex;
  align-items: center;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .admin-dashboard {
    padding: 10px;
  }
  
  .admin-header {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .card-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .header-actions {
    justify-content: center;
  }
}
</style>
