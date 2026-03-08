<template>
  <div class="sidebar">
    <!-- Logo 和品牌名 -->
    <div class="sidebar-header">
      <div class="logo-container">
        <img src="/LOGO.png" alt="千海AI" class="sidebar-logo" />
        <div class="logo-glow"></div>
      </div>
      <h2 class="sidebar-brand">
        <span class="brand-text">千海AI</span>
      </h2>
    </div>
    
    <!-- 导航菜单 -->
    <nav class="sidebar-nav">
      <div 
        class="nav-item"
        :class="{ 'active': activePage === 'home' }"
        @click="$emit('navigate', 'home')"
      >
        <div class="nav-icon-wrapper">
          <el-icon class="nav-icon"><HomeFilled /></el-icon>
        </div>
        <span class="nav-label">首页</span>
        <div class="active-indicator"></div>
      </div>
      
      <div 
        v-if="isLoggedIn"
        class="nav-item"
        :class="{ 'active': activePage === 'workspace' }"
        @click="$emit('navigate', 'workspace')"
      >
        <div class="nav-icon-wrapper">
          <el-icon class="nav-icon"><Brush /></el-icon>
        </div>
        <span class="nav-label">工作区</span>
        <div class="active-indicator"></div>
      </div>

      <div 
        v-if="isLoggedIn"
        class="nav-item"
        :class="{ 'active': activePage === 'prompt-optimizer' }"
        @click="$emit('navigate', 'prompt-optimizer')"
      >
        <div class="nav-icon-wrapper">
          <el-icon class="nav-icon"><MagicStick /></el-icon>
        </div>
        <span class="nav-label">提示词优化</span>
        <div class="active-indicator"></div>
      </div>

      <div 
        v-if="isLoggedIn"
        class="nav-item"
        :class="{ 'active': activePage === 'my-works' }"
        @click="$emit('navigate', 'my-works')"
      >
        <div class="nav-icon-wrapper">
          <el-icon class="nav-icon"><Picture /></el-icon>
        </div>
        <span class="nav-label">我的作品</span>
        <div class="active-indicator"></div>
      </div>
    </nav>
    
    <!-- 占位空间 -->
    <div class="sidebar-spacer"></div>
    
    <!-- 底部区域 -->
    <div class="sidebar-footer">
      <!-- 用户信息 / 登录按钮 -->
      <div v-if="isLoggedIn" class="user-profile-glass">
        <el-dropdown trigger="click" @command="handleUserAction" placement="top-start">
          <div class="user-info-trigger">
            <div class="avatar-ring">
              <el-avatar :size="36" :src="currentUser?.avatar" class="user-avatar">
                {{ currentUser?.username?.charAt(0)?.toUpperCase() }}
              </el-avatar>
            </div>
            <div class="user-details">
              <div class="username">{{ currentUser?.username }}</div>
              <div class="user-credits">
                <el-icon class="credits-icon"><Coin /></el-icon>
                <span class="credits-amount">{{ userCredits }}</span>
              </div>
            </div>
            <el-icon class="more-icon"><MoreFilled /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu class="glass-dropdown">
              <el-dropdown-item v-if="currentUser?.is_admin" command="admin">
                <el-icon><Setting /></el-icon>管理员后台
              </el-dropdown-item>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>个人资料
              </el-dropdown-item>
              <el-dropdown-item command="my-works">
                <el-icon><Brush /></el-icon>我的作品
              </el-dropdown-item>
              <el-dropdown-item command="recharge">
                <el-icon><Coin /></el-icon>充值弹珠
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      
      <div v-else class="login-prompt">
        <GlassButton variant="primary" class="login-btn-full" @click="$emit('login')">
          <el-icon><User /></el-icon>
          登录 / 注册
        </GlassButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { HomeFilled, Brush, MagicStick, Picture, User, SwitchButton, Setting, Coin, MoreFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import GlassButton from './common/GlassButton.vue'
import { getCreditsBalance } from '../api/creditsApi'

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
let creditRefreshTimer = null

// 获取用户积分
const fetchUserCredits = async () => {
  if (!props.isLoggedIn) return

  try {
    const response = await getCreditsBalance()

    if (response.success) {
      userCredits.value = Math.floor(response.data.balance)
    }
  } catch (error) {
    console.error('获取积分失败:', error)
  }
}

watch(() => props.isLoggedIn, (newValue) => {
  if (newValue) {
    fetchUserCredits()
  } else {
    userCredits.value = 0
  }
})

onMounted(() => {
  if (props.isLoggedIn) {
    fetchUserCredits()
  }
  creditRefreshTimer = setInterval(() => {
    if (props.isLoggedIn) {
      fetchUserCredits()
    }
  }, 30000)
})

onUnmounted(() => {
  if (creditRefreshTimer) {
    clearInterval(creditRefreshTimer)
    creditRefreshTimer = null
  }
})

const handleUserAction = (command) => {
  switch (command) {
    case 'admin': emit('show-admin'); break
    case 'profile': ElMessage.info('个人资料功能开发中...'); break
    case 'my-works': ElMessage.info('我的作品功能开发中...'); break
    case 'recharge': emit('recharge'); break
    case 'logout': emit('logout'); break
  }
}
</script>

<style scoped>
.sidebar {
  width: 280px;
  height: calc(100vh - 32px);
  margin: 16px;
  background: rgba(249, 255, 234, 0.85);
  backdrop-filter: var(--glass-blur, blur(20px));
  -webkit-backdrop-filter: var(--glass-blur, blur(20px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-top: 1px solid var(--glass-highlight, rgba(255, 255, 255, 0.15));
  border-left: 1px solid var(--glass-highlight, rgba(255, 255, 255, 0.15));
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  padding: 24px;
  position: relative;
  z-index: 100;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: var(--glass-shadow, 0 8px 32px 0 rgba(0, 0, 0, 0.3));
}

/* Header */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 32px;
  border-bottom: 1px solid rgba(29, 29, 31, 0.08);
}

.logo-container {
  position: relative;
  width: 48px;
  height: 48px;
}

.sidebar-logo {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  position: relative;
  z-index: 2;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.14);
}

.logo-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  background: var(--color-primary);
  filter: blur(20px);
  opacity: 0.5;
  z-index: 1;
  animation: pulse 3s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.2); }
}

.sidebar-brand {
  margin: 0;
  display: flex;
  align-items: center;
  line-height: 1;
}

.brand-text {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--color-primary);
}

/* Nav */
.sidebar-nav {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
  cursor: pointer;
  transition: all var(--transition-bounce);
  color: var(--text-muted);
  position: relative;
  overflow: hidden;
}

.nav-item:hover {
  background: rgba(251, 146, 60, 0.12);
  color: var(--text-main);
  transform: translateX(4px);
}

.nav-item.active {
  background: rgba(251, 146, 60, 0.18);
  color: var(--color-primary);
}

.active-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 0;
  background: var(--color-primary);
  border-radius: 0 4px 4px 0;
  transition: height var(--transition-base);
  box-shadow: 0 0 10px rgba(251, 146, 60, 0.4);
}

.nav-item.active .active-indicator {
  height: 60%;
}

.nav-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: transform var(--transition-bounce);
}

.nav-item:hover .nav-icon-wrapper {
  transform: scale(1.1);
}

.nav-item.active .nav-icon-wrapper {
  color: var(--color-primary);
  filter: drop-shadow(0 0 8px rgba(251, 146, 60, 0.45));
}

.nav-label {
  font-weight: 600;
  font-size: 15px;
}

/* Footer */
.sidebar-spacer {
  flex: 1;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 24px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.user-profile-glass {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.72);
  transition: all var(--transition-base);
}

.user-profile-glass:hover {
  background: var(--glass-level-2-bg);
  border-color: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.user-info-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
}

.avatar-ring {
  padding: 2px;
  border-radius: 50%;
  border: 1px solid rgba(251, 146, 60, 0.6);
  box-shadow: 0 0 10px rgba(251, 146, 60, 0.25);
}

.user-details {
  flex: 1;
  min-width: 0;
}

.username {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-credits {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-cyber-pink);
}

.login-btn-full {
  width: 100%;
  justify-content: center;
}

/* Mobile Responsive */
@media (max-width: 1024px) {
  .sidebar {
    width: 80px;
    padding: 16px 12px;
  }
  
  .sidebar-header {
    justify-content: center;
    padding-bottom: 24px;
  }
  
  .sidebar-brand, .nav-label, .user-details, .more-icon {
    display: none;
  }
  
  .nav-item {
    justify-content: center;
    padding: 12px;
  }
  
  .active-indicator {
    display: none;
  }
  
  .user-info-trigger {
    padding: 0;
    justify-content: center;
  }
  
  .user-profile-glass {
    background: transparent;
    border: none;
  }
  
  .avatar-ring {
    margin: 0;
  }
}
</style>
