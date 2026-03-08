<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="登录 / 注册"
    width="420px"
    :close-on-click-modal="false"
    class="login-dialog"
  >
    <el-tabs v-model="activeTab" class="login-tabs">
      <!-- 登录标签页 -->
      <el-tab-pane label="登录" name="login">
        <el-form 
          ref="loginFormRef" 
          :model="loginForm" 
          :rules="loginRules" 
          class="auth-form"
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
              class="submit-btn"
              style="width: 100%"
            >
              {{ loading ? '登录中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      
      <!-- 注册标签页 -->
      <el-tab-pane label="注册" name="register">
        <el-form 
          ref="registerFormRef" 
          :model="registerForm" 
          :rules="registerRules" 
          class="auth-form"
        >
          <el-form-item prop="username">
            <el-input
              v-model="registerForm.username"
              placeholder="请输入用户名（3-20字符）"
              size="large"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="password">
            <el-input
              v-model="registerForm.password"
              type="password"
              placeholder="请输入密码（至少6位）"
              size="large"
              :prefix-icon="Lock"
              show-password
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              clearable
              @keyup.enter="handleRegister"
            />
          </el-form-item>
          
          <el-form-item>
            <el-button 
              type="primary" 
              size="large" 
              :loading="registerLoading"
              @click="handleRegister"
              class="submit-btn"
              style="width: 100%"
            >
              {{ registerLoading ? '注册中...' : '注册' }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login, register } from '../api/authApi'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// 定义事件
const emit = defineEmits(['update:modelValue', 'login-success'])

// 响应式数据
const activeTab = ref('login')
const loading = ref(false)
const registerLoading = ref(false)

// 表单引用
const loginFormRef = ref()
const registerFormRef = ref()

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

// 监听弹窗关闭，重置表单
watch(() => props.modelValue, (newVal) => {
  if (!newVal) {
    // 重置表单
    activeTab.value = 'login'
    Object.assign(loginForm, { username: '', password: '' })
    Object.assign(registerForm, { username: '', password: '', confirmPassword: '' })
    
    // 清除验证状态
    setTimeout(() => {
      loginFormRef.value?.clearValidate()
      registerFormRef.value?.clearValidate()
    }, 100)
  }
})

// 处理登录
const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const data = await login({
          username: loginForm.username,
          password: loginForm.password
        })
        
        if (data.success) {
          // 保存token到localStorage
          localStorage.setItem('token', data.data.token)
          localStorage.setItem('user', JSON.stringify(data.data.user))
          
          ElMessage.success('登录成功！')
          emit('login-success', data.data.user)
          emit('update:modelValue', false) // 关闭弹窗
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
        const data = await register({
          username: registerForm.username,
          password: registerForm.password
        })
        
        if (data.success) {
          ElMessage.success('注册成功！正在自动登录...')
          
          // 注册成功后自动登录
          loginForm.username = registerForm.username
          loginForm.password = registerForm.password
          
          // 切换到登录页并自动登录
          activeTab.value = 'login'
          setTimeout(() => {
            handleLogin()
          }, 500)
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
</script>

<style scoped>
.login-dialog {
  border-radius: 12px;
}

:deep(.el-dialog__header) {
  padding: 20px 20px 10px;
  border-bottom: 1px solid #f0f0f0;
}

:deep(.el-dialog__body) {
  padding: 20px;
}

.login-tabs {
  margin-top: 10px;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 500;
  padding: 0 30px;
}

.auth-form {
  margin-top: 20px;
}

.auth-form .el-form-item {
  margin-bottom: 20px;
}

.submit-btn {
  margin-top: 10px;
  height: 42px;
  font-size: 16px;
  font-weight: 500;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-md);
  transition: all var(--transition-smooth);
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 184, 230, 0.3);
}

.submit-btn:hover {
  background: linear-gradient(135deg, rgba(0, 184, 230, 0.9), rgba(237, 176, 29, 0.7));
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 184, 230, 0.4);
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  padding: 8px 12px;
}

:deep(.el-input--large .el-input__wrapper) {
  padding: 10px 15px;
}
</style>

