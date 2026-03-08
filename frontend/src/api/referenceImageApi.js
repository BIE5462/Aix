import apiClient, { apiDelete, apiGet, apiPost, apiUpload, extractApiErrorMessage } from './apiClient'

/**
 * 获取常用参考图列表（包括用户自己的和公共的）
 * @returns {Promise<Object>} 包含参考图列表的响应对象
 */
export const getReferenceImages = async (params = {}) => {
  try {
    const response = await apiClient.get('/reference-images/list', { params })
    return response.data
  } catch (error) {
    console.error('获取参考图列表失败:', error)
    throw new Error(extractApiErrorMessage(error, '获取参考图列表失败'))
  }
}

/**
 * 上传新的参考图
 * @param {File} file - 图片文件
 * @param {string} name - 图片名称
 * @param {string} category - 分类
 * @returns {Promise<Object>} 添加的参考图信息
 */
export const uploadReferenceImage = async (file, name = '', category = 'default') => {
  try {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('name', name || file.name)
    formData.append('category', category)

    console.log('上传参考图请求参数:', {
      fileName: file.name,
      fileSize: file.size,
      name: name || file.name,
      category
    })

    const response = await apiClient.post('/reference-images/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    console.log('上传参考图响应:', response.data)
    return response.data
  } catch (error) {
    console.error('上传参考图失败:', error)
    throw new Error(extractApiErrorMessage(error, '上传参考图失败'))
  }
}

/**
 * 添加常用参考图（兼容旧接口，实际调用新的上传接口）
 * @param {Array<File>} files - 图片文件数组
 * @returns {Promise<Array>} 添加的参考图信息
 */
export const addReferenceImages = async (files) => {
  try {
    const results = []

    // 逐个上传文件
    for (const file of files) {
      const result = await uploadReferenceImage(file)
      results.push(result.image)
    }

    return results
  } catch (error) {
    console.error('添加参考图失败:', error)
    throw error
  }
}

/**
 * 删除单张常用参考图
 * @param {string} imageId - 图片ID
 * @returns {Promise} 删除结果
 */
export const deleteReferenceImage = async (imageId) => {
  try {
    const response = await apiClient.delete(`/reference-images/${imageId}`)
    return response.data
  } catch (error) {
    console.error('删除参考图失败:', error)
    throw new Error(extractApiErrorMessage(error, '删除参考图失败'))
  }
}

/**
 * 批量删除常用参考图
 * @param {Array<string>} imageIds - 图片ID数组
 * @returns {Promise} 删除结果
 */
export const batchDeleteReferenceImages = async (imageIds) => {
  try {
    const response = await apiClient.delete('/reference-images/batch', {
      data: { imageIds }
    })
    return response.data
  } catch (error) {
    console.error('批量删除参考图失败:', error)
    throw new Error(extractApiErrorMessage(error, '批量删除参考图失败'))
  }
}

/**
 * 根据ID获取参考图详情
 * @param {string} imageId - 图片ID
 * @returns {Promise<Object>} 参考图详情
 */
export const getReferenceImageById = async (imageId) => {
  try {
    const response = await apiClient.get(`/reference-images/${imageId}`)
    return response.data
  } catch (error) {
    console.error('获取参考图详情失败:', error)
    throw new Error(extractApiErrorMessage(error, '获取参考图详情失败'))
  }
}

/**
 * 更新参考图信息（如果需要的话）
 * @param {string} imageId - 图片ID
 * @param {Object} updateData - 更新数据
 * @returns {Promise<Object>} 更新后的参考图信息
 */
export const updateReferenceImage = async (imageId, updateData) => {
  try {
    const response = await apiClient.put(`/reference-images/${imageId}`, updateData)
    return response.data
  } catch (error) {
    console.error('更新参考图失败:', error)
    throw new Error(extractApiErrorMessage(error, '更新参考图失败'))
  }
}

/**
 * 获取参考图分类列表
 * @returns {Promise<Object>} 分类列表
 */
export const getReferenceImageCategories = async () => {
  try {
    const response = await apiClient.get('/reference-images/categories')
    return response.data
  } catch (error) {
    console.error('获取分类列表失败:', error)
    throw new Error(extractApiErrorMessage(error, '获取分类列表失败'))
  }
}

export const getReferenceImagesRoot = () => apiGet('/reference-images')

export const uploadReferenceImages = (formData) => apiUpload('/reference-images', formData)

export const createReferenceImageCategory = (payload) => apiPost('/reference-images/categories', payload)

export const deleteReferenceImageCategory = (categoryId) => apiDelete(`/reference-images/categories/${categoryId}`)

export const moveReferenceImagesToCategory = (payload) => apiPost('/reference-images/move-to-category', payload)

export const removeReferenceImagesFromCategory = (payload) => apiPost('/reference-images/remove-from-category', payload)

export const deleteReferenceImagesBatchByIds = (imageIds) => apiDelete('/reference-images/batch', {
  data: { imageIds }
})

/**
 * 检查文件是否已上传（通过本地缓存）
 * @param {File} file - 要检查的文件
 * @returns {Object|null} 如果已存在返回图片信息，否则返回null
 */
export const checkFileUploaded = (file) => {
  const fileKey = `${file.name}_${file.size}_${file.lastModified}`
  const uploadedFiles = JSON.parse(localStorage.getItem('uploaded_reference_images') || '{}')

  if (uploadedFiles[fileKey]) {
    return uploadedFiles[fileKey]
  }
  return null
}

/**
 * 记录已上传的文件到本地缓存
 * @param {File} file - 已上传的文件
 * @param {Object} imageData - 服务器返回的图片数据
 */
export const recordUploadedFile = (file, imageData) => {
  const fileKey = `${file.name}_${file.size}_${file.lastModified}`
  const uploadedFiles = JSON.parse(localStorage.getItem('uploaded_reference_images') || '{}')

  uploadedFiles[fileKey] = {
    id: imageData.id,
    ossUrl: imageData.ossUrl,
    uploadedAt: new Date().toISOString()
  }

  // 只保留最近100个记录
  const keys = Object.keys(uploadedFiles)
  if (keys.length > 100) {
    const sortedKeys = keys.sort((a, b) => {
      return new Date(uploadedFiles[b].uploadedAt) - new Date(uploadedFiles[a].uploadedAt)
    })

    const toDelete = sortedKeys.slice(100)
    toDelete.forEach(key => delete uploadedFiles[key])
  }

  localStorage.setItem('uploaded_reference_images', JSON.stringify(uploadedFiles))
}

