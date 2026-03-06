import axios from 'axios'
import { clearAllUserCache } from '../utils/cacheUtils'

// API配置
const API_BASE_URL = '/api'

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器，添加认证头
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器，处理认证错误
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // 认证失败，清除所有用户缓存并跳转到登录页
      clearAllUserCache()
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default apiClient


