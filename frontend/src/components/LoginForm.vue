<template>
  <div class="login-container">
    <!-- 背景装饰 -->
    <div class="background-decoration">
      <div class="floating-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
        <div class="shape shape-4"></div>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 左侧介绍区域 -->
      <div class="intro-section">
        <div class="logo-container">
          <img src="/LOGO2.png" alt="千海AI" class="logo" />
          <h1 class="brand-name">千海AI</h1>
          <p class="brand-subtitle">AI设计产品</p>
        </div>
        
        <div class="features-intro">
          <h2 class="intro-title">释放创意，创造无限可能</h2>
          <div class="feature-list">
            <div class="feature-item">
              <div class="feature-icon">🎨</div>
              <div class="feature-text">
                <h3>智能模版生成</h3>
                <p>通过不同的模版生成不同的图片，满足您的各种设计需求</p>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon">🚀</div>
              <div class="feature-text">
                <h3>模版市场</h3>
                <p>分享您的模版到模版市场，让更多人使用您的创意</p>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon">💰</div>
              <div class="feature-text">
                <h3>收益分享</h3>
                <p>如果有人用了您的模版，您就可以获得收益</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧登录区域 -->
      <div class="login-section">
        <div class="login-card">
          <div class="login-header">
            <h2>欢迎回来</h2>
            <p>登录您的千海AI账户</p>
          </div>
          
          <el-form 
            ref="loginFormRef" 
            :model="loginForm" 
            :rules="loginRules" 
            class="login-form"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="loginForm.username"
                placeholder="请输入用户名"
                size="large"
                :prefix-icon="User"
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                size="large"
                :prefix-icon="Lock"
                show-password
                clearable
                @keyup.enter="handleLogin"
              />
            </el-form-item>
            
            <el-form-item>
              <el-button 
                type="primary" 
                size="large" 
                :loading="loading"
                @click="handleLogin"
                class="login-btn"
              >
                {{ loading ? '登录中...' : '登录' }}
              </el-button>
            </el-form-item>
          </el-form>
          
          <div class="login-footer">
            <el-button type="text" @click="showRegister = true">
              还没有账号？立即注册
            </el-button>
            <el-button type="text" @click="showForgotPassword = true">
              忘记密码？
            </el-button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 注册对话框 -->
    <el-dialog 
      v-model="showRegister" 
      title="用户注册" 
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form 
        ref="registerFormRef" 
        :model="registerForm" 
        :rules="registerRules" 
        label-width="80px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="请输入用户名"
            clearable
          />
        </el-form-item>
        
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
            clearable
          />
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showRegister = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="registerLoading"
          @click="handleRegister"
        >
          {{ registerLoading ? '注册中...' : '注册' }}
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 找回密码对话框 -->
    <el-dialog 
      v-model="showForgotPassword" 
      title="找回密码" 
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form 
        ref="forgotFormRef" 
        :model="forgotForm" 
        :rules="forgotRules" 
        label-width="80px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="forgotForm.username"
            placeholder="请输入用户名"
            clearable
          />
        </el-form-item>
        
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="forgotForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
            clearable
          />
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="forgotForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showForgotPassword = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="forgotLoading"
          @click="handleForgotPassword"
        >
          {{ forgotLoading ? '重置中...' : '重置密码' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'

// 定义事件
const emit = defineEmits(['login-success'])

// 响应式数据
const loading = ref(false)
const registerLoading = ref(false)
const forgotLoading = ref(false)
const showRegister = ref(false)
const showForgotPassword = ref(false)

// 表单引用
const loginFormRef = ref()
const registerFormRef = ref()
const forgotFormRef = ref()

// 登录表单
const loginForm = reactive({
  username: '',
  password: ''
})

// 注册表单
const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: ''
})

// 找回密码表单
const forgotForm = reactive({
  username: '',
  newPassword: '',
  confirmPassword: ''
})

// 验证规则
const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const forgotRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== forgotForm.newPassword) {
          callback(new Error('两次输入密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 处理登录
const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: loginForm.username,
            password: loginForm.password
          })
        })
        
        const data = await response.json()
        
        if (data.success) {
          // 保存token到localStorage
          localStorage.setItem('token', data.data.token)
          localStorage.setItem('user', JSON.stringify(data.data.user))
          
          ElMessage.success('登录成功！')
          emit('login-success', data.data.user)
        } else {
          ElMessage.error(data.message || '登录失败')
        }
      } catch (error) {
        console.error('登录错误:', error)
        ElMessage.error('登录失败，请稍后重试')
      } finally {
        loading.value = false
      }
    }
  })
}

// 处理注册
const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  await registerFormRef.value.validate(async (valid) => {
    if (valid) {
      registerLoading.value = true
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: registerForm.username,
            password: registerForm.password
          })
        })
        
        const data = await response.json()
        
        if (data.success) {
          ElMessage.success('注册成功！请登录')
          showRegister.value = false
          // 清空注册表单
          Object.assign(registerForm, {
            username: '',
            password: '',
            confirmPassword: ''
          })
        } else {
          ElMessage.error(data.message || '注册失败')
        }
      } catch (error) {
        console.error('注册错误:', error)
        ElMessage.error('注册失败，请稍后重试')
      } finally {
        registerLoading.value = false
      }
    }
  })
}

// 处理找回密码
const handleForgotPassword = async () => {
  if (!forgotFormRef.value) return
  
  await forgotFormRef.value.validate(async (valid) => {
    if (valid) {
      forgotLoading.value = true
      try {
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: forgotForm.username,
            newPassword: forgotForm.newPassword
          })
        })
        
        const data = await response.json()
        
        if (data.success) {
          ElMessage.success('密码重置成功！请使用新密码登录')
          showForgotPassword.value = false
          // 清空找回密码表单
          Object.assign(forgotForm, {
            username: '',
            newPassword: '',
            confirmPassword: ''
          })
        } else {
          ElMessage.error(data.message || '密码重置失败')
        }
      } catch (error) {
        console.error('找回密码错误:', error)
        ElMessage.error('密码重置失败，请稍后重试')
      } finally {
        forgotLoading.value = false
      }
    }
  })
}
</script>

<style scoped>
.login-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #00B8E6;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.background-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.floating-shapes {
  position: relative;
  width: 100%;
  height: 100%;
}

.shape {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  animation: float 6s ease-in-out infinite;
}

.shape-1 {
  width: 80px;
  height: 80px;
  top: 20%;
  left: 10%;
  animation-delay: 0s;
}

.shape-2 {
  width: 120px;
  height: 120px;
  top: 60%;
  right: 15%;
  animation-delay: 2s;
}

.shape-3 {
  width: 60px;
  height: 60px;
  top: 80%;
  left: 20%;
  animation-delay: 4s;
}

.shape-4 {
  width: 100px;
  height: 100px;
  top: 10%;
  right: 30%;
  animation-delay: 1s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-20px) rotate(180deg);
  }
}

.main-content {
  display: flex;
  width: 90%;
  max-width: 1200px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  overflow: hidden;
  min-height: 600px;
}

.intro-section {
  flex: 1;
  padding: 60px 40px;
  background: linear-gradient(135deg, #f8f9ff 0%, #e8f0ff 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
}

.intro-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="%23667eea" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="%23764ba2" opacity="0.1"/><circle cx="50" cy="10" r="0.5" fill="%23667eea" opacity="0.1"/><circle cx="10" cy="60" r="0.5" fill="%23764ba2" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
  opacity: 0.3;
}

.logo-container {
  text-align: center;
  margin-bottom: 40px;
  position: relative;
  z-index: 1;
}

.logo {
  width: 80px;
  height: 80px;
  margin-bottom: 20px;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(249, 230, 166, 0.3);
}

.brand-name {
  font-size: 36px;
  font-weight: 700;
  color: #333;
  margin: 0 0 8px 0;
  background: #00B8E6;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-subtitle {
  font-size: 16px;
  color: #666;
  margin: 0;
  font-weight: 500;
}

.features-intro {
  position: relative;
  z-index: 1;
}

.intro-title {
  font-size: 28px;
  font-weight: 600;
  color: #333;
  margin: 0 0 30px 0;
  text-align: center;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 15px;
  border: 1px solid rgba(249, 230, 166, 0.1);
  transition: all 0.3s ease;
}

.feature-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(249, 230, 166, 0.15);
  background: rgba(255, 255, 255, 0.9);
}

.feature-icon {
  font-size: 24px;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #00B8E6;
  border-radius: 12px;
  flex-shrink: 0;
}

.feature-text h3 {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px 0;
}

.feature-text p {
  font-size: 14px;
  color: #666;
  margin: 0;
  line-height: 1.5;
}

.login-section {
  flex: 0 0 400px;
  padding: 60px 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  width: 100%;
  max-width: 360px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: #333;
  margin: 0 0 8px 0;
}

.login-header p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.login-form {
  margin-bottom: 20px;
}

.login-form .el-form-item {
  margin-bottom: 20px;
}

.login-form .el-input {
  height: 50px;
}

.login-form .el-input__wrapper {
  border-radius: 12px;
  border: 2px solid #e1e5e9;
  transition: all 0.3s ease;
}

.login-form .el-input__wrapper:hover {
  border-color: #00B8E6;
}

.login-form .el-input__wrapper.is-focus {
  border-color: #00B8E6;
  box-shadow: 0 0 0 3px rgba(249, 230, 166, 0.1);
}

.login-btn {
  width: 100%;
  height: 50px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  background: #00B8E6;
  border: none;
  transition: all 0.3s ease;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(249, 230, 166, 0.4);
}

.login-btn:active {
  transform: translateY(0);
}

.login-footer {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.login-footer .el-button {
  color: #00B8E6;
  font-weight: 500;
  font-size: 14px;
  padding: 8px 12px;
  transition: all 0.3s ease;
}

.login-footer .el-button:hover {
  color: #0098C3;
  background: rgba(249, 230, 166, 0.1);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
    width: 95%;
    margin: 20px;
  }
  
  .intro-section {
    padding: 40px 30px;
    order: 2;
  }
  
  .login-section {
    flex: none;
    padding: 40px 30px;
    order: 1;
  }
  
  .brand-name {
    font-size: 28px;
  }
  
  .intro-title {
    font-size: 24px;
  }
  
  .feature-list {
    gap: 20px;
  }
  
  .feature-item {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .main-content {
    margin: 10px;
    border-radius: 15px;
  }
  
  .intro-section,
  .login-section {
    padding: 30px 20px;
  }
  
  .logo {
    width: 60px;
    height: 60px;
  }
  
  .brand-name {
    font-size: 24px;
  }
  
  .intro-title {
    font-size: 20px;
  }
  
  .feature-item {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
  
  .feature-icon {
    align-self: center;
  }
}
</style>
