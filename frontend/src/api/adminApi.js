import { apiDelete, apiGet, apiPut } from './apiClient'

export const getAdminStats = () => apiGet('/admin/stats')

export const getAdminUsers = ({ page, pageSize }) => apiGet('/admin/users', {
  params: { page, pageSize }
})

export const getAdminRecords = ({ page, pageSize, userId }) => apiGet('/admin/records', {
  params: {
    page,
    pageSize,
    ...(userId ? { userId } : {})
  }
})

export const toggleAdminUserStatus = (userId) => apiPut(`/admin/users/${userId}/toggle-status`)

export const deleteAdminUser = (userId) => apiDelete(`/admin/users/${userId}`)
