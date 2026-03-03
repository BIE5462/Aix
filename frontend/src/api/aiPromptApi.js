import apiClient from './apiClient'

/**
 * 获取可用的文本模型列表
 */
export const getTextModels = async () => {
  const response = await apiClient.get('/text-models')
  return response.data
}

/**
 * 生成AI提示词
 * @param {Object} params - 生成参数
 * @param {Number} params.model_id - 模型ID
 * @param {String} params.user_input - 用户输入
 * @param {Number} params.count - 生成数量
 */
export const generateAIPrompts = async (params) => {
  const response = await apiClient.post('/ai-prompts/generate', params)
  return response.data
}

/**
 * 获取AI生成历史记录列表
 * @param {Number} page - 页码
 * @param {Number} pageSize - 每页数量
 */
export const getAIPromptHistory = async (page = 1, pageSize = 20) => {
  const response = await apiClient.get('/ai-prompts/history', {
    params: { page, pageSize }
  })
  return response.data
}

/**
 * 获取单条AI生成历史详情
 * @param {Number} id - 历史记录ID
 */
export const getAIPromptHistoryDetail = async (id) => {
  const response = await apiClient.get(`/ai-prompts/history/${id}`)
  return response.data
}

/**
 * 删除AI生成历史记录
 * @param {Number} id - 历史记录ID
 */
export const deleteAIPromptHistory = async (id) => {
  const response = await apiClient.delete(`/ai-prompts/history/${id}`)
  return response.data
}

/**
 * 获取优化模板列表
 */
export const getOptimizeTemplates = async () => {
  const response = await apiClient.get('/ai-prompts/templates')
  return response.data
}

/**
 * 优化提示词
 * @param {Object} params - { model_id, template_id, original_prompt }
 */
export const optimizePrompt = async (params) => {
  const response = await apiClient.post('/ai-prompts/optimize', params)
  return response.data
}

/**
 * 迭代优化提示词
 * @param {Object} params - { model_id, template_id, last_optimized_prompt, iterate_input }
 */
export const iteratePrompt = async (params) => {
  const response = await apiClient.post('/ai-prompts/iterate', params)
  return response.data
}

/**
 * 保存批量输入历史
 * @param {Object} params - 保存参数
 * @param {String} params.name - 历史记录名称
 * @param {Array} params.prompts - 提示词列表
 * @param {String} params.source_type - 来源类型
 * @param {Number} params.source_id - 来源ID
 */
export const saveBatchPromptHistory = async (params) => {
  const response = await apiClient.post('/batch-prompts/history', params)
  return response.data
}

/**
 * 获取批量输入历史列表
 * @param {Number} page - 页码
 * @param {Number} pageSize - 每页数量
 */
export const getBatchPromptHistory = async (page = 1, pageSize = 20) => {
  const response = await apiClient.get('/batch-prompts/history', {
    params: { page, pageSize }
  })
  return response.data
}

/**
 * 获取批量输入历史详情
 * @param {Number} id - 历史记录ID
 */
export const getBatchPromptHistoryDetail = async (id) => {
  const response = await apiClient.get(`/batch-prompts/history/${id}`)
  return response.data
}

/**
 * 删除批量输入历史
 * @param {Number} id - 历史记录ID
 */
export const deleteBatchPromptHistory = async (id) => {
  const response = await apiClient.delete(`/batch-prompts/history/${id}`)
  return response.data
}

/**
 * 获取所有文本模型（管理员）
 */
export const getAllTextModels = async () => {
  const response = await apiClient.get('/text-models/admin/all')
  return response.data
}

/**
 * 添加文本模型（管理员）
 * @param {Object} modelData - 模型数据
 */
export const addTextModel = async (modelData) => {
  const response = await apiClient.post('/text-models/admin', modelData)
  return response.data
}

/**
 * 更新文本模型（管理员）
 * @param {Number} id - 模型ID
 * @param {Object} modelData - 模型数据
 */
export const updateTextModel = async (id, modelData) => {
  const response = await apiClient.put(`/text-models/admin/${id}`, modelData)
  return response.data
}

/**
 * 删除文本模型（管理员）
 * @param {Number} id - 模型ID
 */
export const deleteTextModel = async (id) => {
  const response = await apiClient.delete(`/text-models/admin/${id}`)
  return response.data
}

/**
 * 设置默认模型（管理员）
 * @param {Number} id - 模型ID
 */
export const setDefaultTextModel = async (id) => {
  const response = await apiClient.put(`/text-models/admin/${id}/set-default`)
  return response.data
}
