import apiClient from './apiClient'

/**
 * 获取公共作品列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.type - 作品类型 'image' | 'video'
 * @param {string} params.model - 模型ID
 * @param {string} params.sort - 排序方式 'latest' | 'hot'
 * @returns {Promise}
 */
export const getPublicWorks = (params) => {
  return apiClient.get('/works', { params })
}

/**
 * 获取作品详情
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const getWorkDetail = (workId) => {
  return apiClient.get(`/works/${workId}`)
}

/**
 * 发布作品
 * @param {Object} workData - 作品数据
 * @param {number} workData.historyId - 关联的历史记录ID
 * @param {string} workData.title - 作品标题
 * @param {string} workData.coverUrl - 封面图URL
 * @param {string} workData.contentType - 内容类型 'image' | 'video'
 * @param {string} workData.prompt - 提示词
 * @param {string} workData.modelId - 模型ID
 * @param {string} workData.modelName - 模型名称
 * @param {string} workData.size - 尺寸
 * @param {Array} workData.referenceImages - 参考图数组
 * @param {Object} workData.videoData - 视频数据
 * @returns {Promise}
 */
export const publishWork = (workData) => {
  return apiClient.post('/works', workData)
}

/**
 * 取消发布作品
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const unpublishWork = (workId) => {
  return apiClient.delete(`/works/${workId}`)
}

/**
 * 永久删除作品
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const deleteWorkPermanently = (workId) => {
  return apiClient.delete(`/works/${workId}/permanent`)
}

/**
 * 增加作品浏览数
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const incrementWorkViews = (workId) => {
  return apiClient.post(`/works/${workId}/view`)
}

/**
 * 获取用户的所有作品列表（包括已下架的）
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @returns {Promise}
 */
export const getUserWorks = (params) => {
  return apiClient.get('/works/user/my', { params })
}

/**
 * 重新上架作品
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const republishWork = (workId) => {
  return apiClient.put(`/works/${workId}/publish`)
}

/**
 * 点赞作品
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const likeWork = (workId) => {
  return apiClient.post(`/works/${workId}/like`)
}

/**
 * 取消点赞作品
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const unlikeWork = (workId) => {
  return apiClient.delete(`/works/${workId}/like`)
}

/**
 * 查询点赞状态
 * @param {number} workId - 作品ID
 * @returns {Promise}
 */
export const getLikeStatus = (workId) => {
  return apiClient.get(`/works/${workId}/like-status`)
}

