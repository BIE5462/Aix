<template>
  <div class="sidebar">
    <!-- Logo 和品牌名 -->
    <div class="sidebar-header">
      <img src="/LOGO.png" alt="千海AI" class="sidebar-logo" />
      <h2 class="sidebar-brand">千海AI</h2>
    </div>
    
    <!-- 导航菜单 -->
    <nav class="sidebar-nav">
      <div 
        class="nav-item"
        :class="{ 'active': activePage === 'home' }"
        @click="$emit('navigate', 'home')"
      >
        <el-icon class="nav-icon"><HomeFilled /></el-icon>
        <span class="nav-label">首页</span>
      </div>
      
      <div 
        v-if="isLoggedIn"
        class="nav-item"
        :class="{ 'active': activePage === 'workspace' }"
        @click="$emit('navigate', 'workspace')"
      >
        <el-icon class="nav-icon"><Brush /></el-icon>
        <span class="nav-label">我的工作区</span>
      </div>
      
    </nav>
    
    <!-- 占位空间，将底部内容推到底部 -->
    <div class="sidebar-spacer"></div>
    
    <!-- 底部区域 -->
    <div class="sidebar-footer">
      <!-- 用户信息 / 登录按钮 -->
      <div v-if="isLoggedIn" class="user-card">
        <el-dropdown trigger="click" @command="handleUserAction">
          <div class="user-info">
            <el-avatar :size="36" :src="currentUser?.avatar">
              {{ currentUser?.username?.charAt(0)?.toUpperCase() }}
            </el-avatar>
            <div class="user-details">
              <div class="username">{{ currentUser?.username }}</div>
              <div class="user-credits">
                <el-icon class="credits-icon"><Coin /></el-icon>
                <span class="credits-amount">{{ userCredits }}</span>
                <span class="credits-unit">弹珠</span>
              </div>
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="currentUser?.is_admin" command="admin">
                <el-icon><Setting /></el-icon>
                管理员后台
              </el-dropdown-item>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>
                个人资料
              </el-dropdown-item>
              <el-dropdown-item command="my-works">
                <el-icon><Brush /></el-icon>
                我的作品
              </el-dropdown-item>
              <el-dropdown-item command="recharge">
                <el-icon><Coin /></el-icon>
                充值弹珠
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      
      <div v-else class="login-prompt">
        <el-button 
          type="primary" 
          size="large" 
          @click="$emit('login')"
          class="login-btn"
        >
        <el-icon style="margin-right: 4px"><User /></el-icon>
        登录 / 注册
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { HomeFilled, Brush, User, SwitchButton, Setting, Coin } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

// Props
const props = defineProps({
  isLoggedIn: {
    type: Boolean,
    default: false
  },
  currentUser: {
    type: Object,
    default: null
  },
  activePage: {
    type: String,
    default: 'home'
  }
})

// 定义事件
const emit = defineEmits(['navigate', 'login', 'logout', 'show-admin', 'recharge'])

// 用户积分
const userCredits = ref(0)

// 定时器引用
let creditRefreshTimer = null

// 获取用户积分
const fetchUserCredits = async () => {
  if (!props.isLoggedIn) return

  try {
    const token = localStorage.getItem('token')
    const response = await axios.get('http://localhost:8088/api/credits/balance', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.data.success) {
      userCredits.value = Math.floor(response.data.data.balance) // 向下取整显示
    }
  } catch (error) {
    console.error('获取积分失败:', error)
  }
}

// 监听登录状态变化
watch(() => props.isLoggedIn, (newValue) => {
  if (newValue) {
    fetchUserCredits()
  } else {
    userCredits.value = 0
  }
})

// 组件挂载时获取积分
onMounted(() => {
  if (props.isLoggedIn) {
    fetchUserCredits()
  }

  // 每30秒刷新一次积分
  creditRefreshTimer = setInterval(() => {
    if (props.isLoggedIn) {
      fetchUserCredits()
    }
  }, 30000)
})

// 组件卸载时清理定时器
onUnmounted(() => {
  if (creditRefreshTimer) {
    clearInterval(creditRefreshTimer)
    creditRefreshTimer = null
  }
})

// 处理用户操作
const handleUserAction = (command) => {
  switch (command) {
    case 'admin':
      emit('show-admin')
      break
    case 'profile':
      ElMessage.info('个人资料功能开发中...')
      break
    case 'my-works':
      ElMessage.info('我的作品功能开发中...')
      break
    case 'recharge':
      emit('recharge')
      break
    case 'logout':
      emit('logout')
      break
  }
}
</script>

<style scoped>
.sidebar {
  width: 280px;
  height: 100vh;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

/* 移动端底部导航栏 */
@media (max-width: 1200px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 64px;
    flex-direction: row;
    align-items: center;
    padding: 0;
    border-right: none;
    border-top: 1px solid var(--glass-border);
    z-index: 1000;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  }

  /* 隐藏 Logo 和品牌 */
  .sidebar-header {
    display: none;
  }

  /* 导航菜单改为横向布局 */
  .sidebar-nav {
    display: flex;
    flex-direction: row;
    margin: 0;
    gap: 0;
    flex: 1;
    justify-content: space-around;
    align-items: center;
    height: 100%;
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    border-radius: 0;
    font-size: 11px;
    height: 100%;
    border: none;
  }

  .nav-item.active {
    border-radius: 0;
  }

  .nav-icon {
    font-size: 24px;
  }

  .nav-label {
    font-size: 11px;
    white-space: nowrap;
  }

  /* 隐藏占位空间 */
  .sidebar-spacer {
    display: none;
  }

  /* 底部区域改为横向布局，与导航菜单在同一行 */
  .sidebar-footer {
    display: flex;
    flex-direction: row;
    margin: 0;
    padding: 0;
    border-top: none;
    gap: 0;
    flex: 1;
    justify-content: space-around;
    align-items: center;
    height: 100%;
  }

  /* 用户信息简化显示 */
  .user-card {
    flex: 1;
    margin: 0;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    background: transparent;
    border: none;
    border-radius: 0;
    height: 100%;
    width: 100%;
  }

  .user-info:hover {
    background: rgba(249, 230, 166, 0.15);
    transform: none;
    box-shadow: none;
  }

  .user-details {
    display: none;
  }

  :deep(.el-avatar) {
    width: 28px !important;
    height: 28px !important;
    font-size: 14px !important;
  }

  /* 登录按钮 */
  .login-prompt {
    flex: 1;
    margin: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-btn {
    width: 100%;
    height: 100%;
    padding: 8px 10px;
    font-size: 11px;
    background: transparent;
    box-shadow: none;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    border-radius: 0;
    border: none;
  }

  .login-btn :deep(.el-icon) {
    font-size: 24px;
    margin-right: 0 !important;
  }

  .login-btn:hover {
    transform: none;
    box-shadow: none;
    background: rgba(249, 230, 166, 0.15);
    color: var(--primary-yellow-dark);
  }
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 60px;
    flex-direction: row;
    align-items: center;
    padding: 0;
    border-right: none;
    border-top: 1px solid var(--glass-border);
    z-index: 1000;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  }

  /* 隐藏 Logo 和品牌 */
  .sidebar-header {
    display: none;
  }

  /* 导航菜单改为横向布局 */
  .sidebar-nav {
    display: flex;
    flex-direction: row;
    margin: 0;
    gap: 0;
    flex: 1;
    justify-content: space-around;
    align-items: center;
    height: 100%;
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2px;
    padding: 6px 4px;
    border-radius: 0;
    font-size: 10px;
    height: 100%;
    border: none;
  }

  .nav-item.active {
    border-radius: 0;
  }

  .nav-icon {
    font-size: 22px;
  }

  .nav-label {
    font-size: 10px;
    white-space: nowrap;
  }

  /* 隐藏占位空间 */
  .sidebar-spacer {
    display: none;
  }

  /* 底部区域改为横向布局，与导航菜单在同一行 */
  .sidebar-footer {
    display: flex;
    flex-direction: row;
    margin: 0;
    padding: 0;
    border-top: none;
    gap: 0;
    flex: 1;
    justify-content: space-around;
    align-items: center;
    height: 100%;
  }

  /* 用户信息简化显示 */
  .user-card {
    flex: 1;
    margin: 0;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2px;
    padding: 6px 4px;
    background: transparent;
    border: none;
    border-radius: 0;
    height: 100%;
    width: 100%;
  }

  .user-info:hover {
    background: rgba(249, 230, 166, 0.15);
    transform: none;
    box-shadow: none;
  }

  .user-details {
    display: none;
  }

  :deep(.el-avatar) {
    width: 24px !important;
    height: 24px !important;
    font-size: 12px !important;
  }

  /* 登录按钮 */
  .login-prompt {
    flex: 1;
    margin: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-btn {
    width: 100%;
    height: 100%;
    padding: 6px 8px;
    font-size: 10px;
    background: transparent;
    box-shadow: none;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2px;
    border-radius: 0;
    border: none;
  }

  .login-btn :deep(.el-icon) {
    font-size: 22px;
    margin-right: 0 !important;
  }

  .login-btn:hover {
    transform: none;
    box-shadow: none;
    background: rgba(249, 230, 166, 0.15);
    color: var(--primary-yellow-dark);
  }
}

/* Logo 和品牌 */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 24px 0;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-logo {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
}

.sidebar-brand {
  font-size: 22px;
  font-weight: 700;
  color: var(--primary-blue);
  margin: 0;
  letter-spacing: 0.5px;
}

/* 导航菜单 */
.sidebar-nav {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-smooth);
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 500;
  border: 1px solid transparent;
}

.nav-item:hover {
  background: var(--primary-blue-bg);
  color: var(--primary-blue);
  border-color: var(--primary-blue-light);
}

.nav-item.active {
  background: var(--primary-blue);
  color: white;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.3);
  border-color: var(--primary-blue);
}

.nav-icon {
  font-size: 20px;
}

.nav-label {
  flex: 1;
}

/* 占位空间 */
.sidebar-spacer {
  flex: 1;
}

/* 底部区域 */
.sidebar-footer {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid var(--glass-border);
}

/* 用户卡片 */
.user-card {
  margin-top: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-smooth);
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid var(--glass-border);
}

.user-info:hover {
  background: var(--primary-blue-bg);
  border-color: var(--primary-blue-light);
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.25);
}

.user-details {
  flex: 1;
  min-width: 0;
}

.username {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-credits {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary-yellow-dark);
  margin-top: 2px;
}

.credits-icon {
  font-size: 14px;
  color: var(--primary-yellow);
}

.credits-amount {
  font-weight: 600;
  color: var(--primary-yellow-dark);
}

.credits-unit {
  color: var(--text-secondary);
  font-size: 11px;
}

/* 登录提示 */
.login-prompt {
  margin-top: 12px;
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  background: var(--primary-blue);
  border: none;
  border-radius: var(--radius-md);
  transition: all var(--transition-smooth);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.25);
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 184, 230, 0.35);
  background: var(--primary-blue-light);
}

/* Element Plus Dropdown 样式调整 */
:deep(.el-dropdown) {
  width: 100%;
}

:deep(.el-avatar) {
  background: var(--primary-blue);
  color: white;
  font-weight: 600;
}
</style>
