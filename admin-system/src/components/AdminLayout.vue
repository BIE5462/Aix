<template>
  <div class="admin-layout">
    <el-container>
      <!-- 侧边栏 -->
      <el-aside width="200px" class="sidebar">
        <div class="logo">
          <h3>AI图像生成</h3>
          <p>后台管理</p>
        </div>
        
        <el-menu
          :default-active="$route.path"
          class="sidebar-menu"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <el-menu-item index="/">
            <el-icon><House /></el-icon>
            <span>仪表盘</span>
          </el-menu-item>
          
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          
          <el-menu-item index="/content">
            <el-icon><Document /></el-icon>
            <span>内容管理</span>
          </el-menu-item>
          
          <el-menu-item index="/models">
            <el-icon><Setting /></el-icon>
            <span>图像模型管理</span>
          </el-menu-item>
          
          <el-menu-item index="/model-pricing">
            <el-icon><Setting /></el-icon>
            <span>模型价格管理</span>
          </el-menu-item>
          
          <el-menu-item index="/video-models">
            <el-icon><VideoCamera /></el-icon>
            <span>视频模型管理</span>
          </el-menu-item>

          <el-menu-item index="/text-models">
            <el-icon><ChatDotRound /></el-icon>
            <span>文字模型管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <!-- 主内容区 -->
      <el-container>
        <!-- 顶部导航 -->
        <el-header class="header">
          <div class="header-left">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentPageTitle }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
          
          <div class="header-right">
            <el-dropdown @command="handleCommand">
              <span class="user-info">
                <el-icon><Avatar /></el-icon>
                {{ user.username }}
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        
        <!-- 主要内容 -->
        <el-main class="main-content">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useAuthStore } from '../utils/auth.js'

export default {
  name: 'AdminLayout',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const authStore = useAuthStore()
    
    const user = computed(() => authStore.user)
    
    const currentPageTitle = computed(() => {
      const titleMap = {
        '/': '仪表盘',
        '/users': '用户管理',
        '/content': '内容管理',
        '/models': '图像模型管理',
        '/model-pricing': '模型价格管理',
        '/video-models': '视频模型管理',
        '/text-models': '文字模型管理'
      }
      return titleMap[route.path] || '未知页面'
    })
    
    const handleCommand = async (command) => {
      if (command === 'logout') {
        try {
          await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          })
          
          authStore.logout()
          ElMessage.success('已退出登录')
          router.push('/login')
        } catch {
          // 用户取消
        }
      }
    }
    
    return {
      user,
      currentPageTitle,
      handleCommand
    }
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: #304156;
  overflow: hidden;
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 1000;
}

.logo {
  padding: 20px;
  text-align: center;
  color: white;
  border-bottom: 1px solid #434a50;
}

.logo h3 {
  margin: 0 0 5px 0;
  font-size: 18px;
}

.logo p {
  margin: 0;
  font-size: 12px;
  color: #bfcbd9;
}

.sidebar-menu {
  border: none;
  height: calc(100vh - 80px);
  overflow-y: auto;
}

.header {
  background-color: white;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  position: fixed;
  top: 0;
  right: 0;
  left: 200px;
  height: 60px;
  z-index: 999;
}

.header-left {
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #606266;
}

.user-info:hover {
  color: #409EFF;
}

.main-content {
  background-color: #f5f5f5;
  padding: 20px;
  margin-left: 200px;
  margin-top: 60px;
  height: calc(100vh - 60px);
  overflow-y: auto;
}

:deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
}

:deep(.el-menu-item.is-active) {
  background-color: #263445 !important;
}
</style>

