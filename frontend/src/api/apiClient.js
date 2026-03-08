import axios from 'axios'
import { clearAllUserCache } from '../utils/cacheUtils'

// API配置
const API_BASE_URL = '/api'
const DEFAULT_TIMEOUT = 15000

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
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

export const extractApiErrorMessage = (error, fallbackMessage = '请求失败') => {
  if (error?.response?.data?.error) return error.response.data.error
  if (error?.response?.data?.message) return error.response.data.message
  if (typeof error?.response?.data === 'string' && error.response.data.trim()) {
    return error.response.data
  }
  if (error?.message) return error.message
  return fallbackMessage
}

export const apiRequest = async (config) => {
  const response = await apiClient.request(config)
  return response.data
}

export const apiGet = (url, config = {}) => apiRequest({
  url,
  method: 'get',
  ...config
})

export const apiPost = (url, data, config = {}) => apiRequest({
  url,
  method: 'post',
  data,
  ...config
})

export const apiPut = (url, data, config = {}) => apiRequest({
  url,
  method: 'put',
  data,
  ...config
})

export const apiDelete = (url, config = {}) => apiRequest({
  url,
  method: 'delete',
  ...config
})

export const apiUpload = (url, formData, config = {}) => apiRequest({
  url,
  method: config.method || 'post',
  data: formData,
  timeout: config.timeout || 30000,
  ...config,
  headers: {
    'Content-Type': 'multipart/form-data',
    ...(config.headers || {})
  }
})

export const apiGetBlob = async (url, config = {}) => {
  const response = await apiClient.get(url, {
    responseType: 'blob',
    timeout: config.timeout || 30000,
    ...config
  })

  return response.data
}

export default apiClient


