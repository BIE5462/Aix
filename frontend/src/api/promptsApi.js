import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from './apiClient'

export const getUserPrompts = () => apiGet('/prompts')

export const createUserPrompt = (formData) => apiUpload('/prompts', formData)

export const updateUserPrompt = (promptId, formData) => apiUpload(`/prompts/${promptId}`, formData, {
  method: 'put'
})

export const deleteUserPrompt = (promptId) => apiDelete(`/prompts/${promptId}`)

export const getCommonPrompts = () => apiGet('/prompts/common')

export const createCommonPrompt = (payload) => apiPost('/prompts/common', payload)

export const updateCommonPrompt = (promptId, payload) => apiPut(`/prompts/common/${promptId}`, payload)

export const deleteCommonPrompt = (promptId) => apiDelete(`/prompts/common/${promptId}`)

export const getVideoCommonPrompts = () => apiGet('/prompts/video-common')

export const uploadBatchPrompts = (payload) => apiPost('/prompts/batch-upload', payload)
