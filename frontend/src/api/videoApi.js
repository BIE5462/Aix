import apiClient, { extractApiErrorMessage } from './apiClient'

/**
 * 生成视频API调用 - 符合Seedance API规范
 * @param {Object} params - 请求参数
 * @param {string} params.prompt - 提示词
 * @param {string} params.modelId - 模型ID
 * @param {number} params.duration - 视频时长（秒）
 * @param {string} params.resolution - 分辨率 (480p, 720p, 1080p)
 * @param {string} params.ratio - 宽高比 (21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21, keep_ratio, adaptive)
 * @param {boolean} params.watermark - 是否添加水印
 * @param {boolean} params.camerafixed - 是否固定摄像头
 * @param {boolean} params.returnLastFrame - 是否返回尾帧图像
 * @param {number} params.seed - 随机种子（可选）
 * @param {File} params.firstFrame - 首帧图片
 * @param {File} params.lastFrame - 尾帧图片（可选）
 * @returns {Promise} API响应
 */
export const generateVideo = async (params) => {
  try {
    const formData = new FormData()

    // 添加基本参数
    formData.append('prompt', params.prompt)
    // 支持 modelId 或 modelDbId 参数名
    formData.append('modelId', params.modelId || params.modelDbId)

    // 安全地添加参数,避免对 undefined 调用 toString()
    if (params.duration !== undefined && params.duration !== null) {
      formData.append('duration', String(params.duration))
    }
    if (params.resolution) {
      formData.append('resolution', params.resolution)
    }
    if (params.ratio) {
      formData.append('ratio', params.ratio)
    }
    if (params.watermark !== undefined) {
      formData.append('watermark', String(params.watermark))
    }
    if (params.camerafixed !== undefined) {
      formData.append('camerafixed', String(params.camerafixed))
    }
    if (params.returnLastFrame !== undefined || params.return_last_frame !== undefined) {
      formData.append('returnLastFrame', String(params.returnLastFrame || params.return_last_frame))
    }

    if (params.seed !== undefined && params.seed !== null) {
      formData.append('seed', String(params.seed))
    }

    // 添加首帧图片
    if (params.firstFrame) {
      formData.append('firstFrame', params.firstFrame)
    }

    // 添加尾帧图片（可选）
    if (params.lastFrame) {
      formData.append('lastFrame', params.lastFrame)
    }

    console.log('生成视频请求参数:', {
      prompt: params.prompt,
      modelId: params.modelId || params.modelDbId,
      duration: params.duration,
      resolution: params.resolution,
      ratio: params.ratio,
      watermark: params.watermark,
      camerafixed: params.camerafixed,
      returnLastFrame: params.returnLastFrame || params.return_last_frame,
      seed: params.seed,
      hasFirstFrame: !!params.firstFrame,
      hasLastFrame: !!params.lastFrame
    })

    const response = await apiClient.post('/video/generate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    console.log('生成视频响应:', response.data)
    return response.data
  } catch (error) {
    console.error('生成视频API调用失败:', error)
    throw new Error(extractApiErrorMessage(error, '生成视频失败'))
  }
}

/**
 * 查询视频生成结果
 * @param {string} taskId - 任务ID
 * @returns {Promise} API响应
 */
export const getVideoResult = async (taskId) => {
  try {
    const response = await apiClient.get(`/video/result/${taskId}`)
    
    return response.data
  } catch (error) {
    console.error('查询视频生成结果失败:', error)
    throw new Error(extractApiErrorMessage(error, '查询视频生成结果失败'))
  }
}

/**
 * 获取视频生成历史记录
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.searchKeyword - 搜索关键词
 * @returns {Promise} API响应
 */
export const getVideoHistory = async (params = {}) => {
  try {
    const { page = 1, pageSize = 20, searchKeyword = '' } = params
    
    const response = await apiClient.get('/video/history', {
      params: {
        page,
        pageSize,
        searchKeyword
      }
    })
    
    return response.data
  } catch (error) {
    console.error('获取视频生成历史失败:', error)
    throw new Error(extractApiErrorMessage(error, '获取视频生成历史失败'))
  }
}

/**
 * 获取视频生成状态
 * @param {string} taskId - 任务ID
 * @returns {Promise} API响应
 */
export const getVideoGenerationStatus = async (taskId) => {
  try {
    const response = await apiClient.get(`/video/status/${taskId}`)
    
    return response.data
  } catch (error) {
    console.error('获取视频生成状态失败:', error)
    throw new Error(extractApiErrorMessage(error, '获取视频生成状态失败'))
  }
}

/**
 * 获取视频模型列表
 * @returns {Promise} API响应
 */
export const getVideoModels = async () => {
  try {
    const response = await apiClient.get('/video/models')

    return response.data
  } catch (error) {
    console.error('获取视频模型列表失败:', error)
    // 返回空列表而不是默认值，确保从数据库获取
    return {
      success: false,
      models: [],
      error: error.message
    }
  }
}

/**
 * 获取支持的视频模型列表（本地默认）
 * @returns {Array} 模型列表
 */
export const getSupportedVideoModels = () => {
  return [
    {
      id: 'doubao-seedance-1-0-lite-i2v-250428',
      name: '首尾帧视频模型',
      description: '首帧或首尾帧图生视频，根据您输入的首帧图片+尾帧图片（可选）+文本提示词（可选）+参数（可选）生成目标视频',
      provider: '火山豆包',
      maxDuration: 10,
      is_default: true,
      supportedResolutions: [
        { width: 1024, height: 576, label: '1024x576 (16:9)' },
        { width: 1280, height: 720, label: '1280x720 (16:9)' },
        { width: 1920, height: 1080, label: '1920x1080 (16:9)' }
      ]
    },
    {
      id: 'doubao-seedance-1-0-pro-250528',
      name: '文生视频模型',
      description: '根据您输入的文本提示词+参数（可选）生成目标视频',
      provider: '火山豆包',
      maxDuration: 5,
      is_default: false,
      supportedResolutions: [
        { width: 1024, height: 576, label: '1024x576 (16:9)' },
        { width: 1280, height: 720, label: '1280x720 (16:9)' }
      ]
    }
  ]
}
