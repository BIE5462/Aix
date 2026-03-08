import { apiGet, apiPost } from './apiClient'

export const login = (payload) => apiPost('/auth/login', payload)

export const register = (payload) => apiPost('/auth/register', payload)

export const forgotPassword = (payload) => apiPost('/auth/forgot-password', payload)

export const logout = () => apiPost('/auth/logout')

export const getCurrentUser = () => apiGet('/auth/me')
