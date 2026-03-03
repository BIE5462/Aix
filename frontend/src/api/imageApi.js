import axios from 'axios'
import { clearAllUserCache } from '../utils/cacheUtils'

// API配置
const API_BASE_URL = 'http://localhost:8088/api'

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

/**
 * 生成图片API调用（通过后端服务）
 * @param {Object} params - 请求参数
 * @param {string} params.prompt - 提示词
 * @param {string} params.size - 图片尺寸
 * @param {number} params.quantity - 生成数量
 * @param {string} params.mode - 生成模式
 * @param {File} params.image - 参考图片（图生图模式）
 * @returns {Promise} API响应
 */
export const generateImages = async (params) => {
  try {
    const formData = new FormData()
    formData.append('prompt', params.prompt)
    formData.append('size', params.size)
    formData.append('quantity', params.quantity.toString())
    formData.append('mode', params.mode)
    
    // 添加模型ID参数
    if (params.modelId) {
      formData.append('modelId', params.modelId.toString())
    }
    
    // 支持单张图片（向后兼容）
    if (params.image) {
      formData.append('image', params.image)
    }
    
    // 支持多张图片
    if (params.images && params.images.length > 0) {
      params.images.forEach((image, index) => {
        formData.append(`images`, image)
      })
    }

    // 传递分辨率参数（Gemini 模型专用）
    if (params.imageSize) {
      formData.append('imageSize', params.imageSize)
    }

    console.log('生成图片请求参数:', {
      prompt: params.prompt,
      size: params.size,
      quantity: params.quantity,
      mode: params.mode,
      modelId: params.modelId,
      hasImage: !!params.image,
      imagesCount: params.images ? params.images.length : 0
    })

    const response = await apiClient.post('/generate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    console.log('生成图片响应:', response.data)
    return response.data
  } catch (error) {
    console.error('生成图片API调用失败:', error)
    throw new Error(error.response?.data?.error || '生成图片失败')
  }
}

/**
 * 图生图API调用
 * @param {Object} params - 请求参数
 * @param {string} params.prompt - 提示词
 * @param {Array} params.image_urls - 参考图片URL数组
 * @param {string} params.size - 图片尺寸
 * @param {string} params.response_format - 响应格式，默认为'url'
 * @returns {Promise} API响应
 */
export const generateImageToImage = async (params) => {
  try {
    const requestData = {
      model: 'nano-banana',
      prompt: params.prompt,
      image_urls: params.image_urls,
      size: params.size,
      response_format: params.response_format || 'url'
    }

    console.log('图生图请求参数:', requestData)

    const response = await apiClient.post('/v1/images/generations', requestData)
    
    console.log('图生图响应:', response.data)
    return response.data
  } catch (error) {
    console.error('图生图API调用失败:', error)
    throw new Error(error.response?.data?.error?.message || '图生图生成失败')
  }
}

/**
 * 查询生成结果
 * @param {string} taskId - 任务ID
 * @returns {Promise} API响应
 */
export const getGenerationResult = async (taskId) => {
  try {
    const response = await apiClient.get(`/generate/${taskId}`)
    return response.data
  } catch (error) {
    console.error('查询生成结果失败:', error)
    throw new Error(error.response?.data?.error || '查询生成结果失败')
  }
}

/**
 * 获取历史记录
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.search - 搜索关键词
 * @returns {Promise} API响应
 */
export const getHistory = async (params = {}) => {
  try {
    const response = await apiClient.get('/history', { params })
    return response.data
  } catch (error) {
    console.error('获取历史记录失败:', error)
    throw new Error(error.response?.data?.error || '获取历史记录失败')
  }
}

/**
 * 删除历史记录
 * @param {string} id - 记录ID
 * @returns {Promise} API响应
 */
export const deleteHistory = async (id) => {
  try {
    const response = await apiClient.delete(`/history/${id}`)
    return response.data
  } catch (error) {
    console.error('删除历史记录失败:', error)
    throw new Error(error.response?.data?.error || '删除历史记录失败')
  }
}

/**
 * 清空历史记录
 * @returns {Promise} API响应
 */
export const clearHistory = async () => {
  try {
    const response = await apiClient.delete('/history')
    return response.data
  } catch (error) {
    console.error('清空历史记录失败:', error)
    throw new Error(error.response?.data?.error || '清空历史记录失败')
  }
}

/**
 * 获取可用的AI模型列表
 * @returns {Promise} API响应
 */
export const getAvailableModels = async () => {
  try {
    const response = await apiClient.get('/user/models')
    return response.data
  } catch (error) {
    console.error('获取模型列表失败:', error)
    throw new Error(error.response?.data?.message || '获取模型列表失败')
  }
}
