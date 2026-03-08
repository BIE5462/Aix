import { apiGet, apiPost } from './apiClient'

export const getCreditsBalance = () => apiGet('/credits/balance')

export const createRechargeOrder = (payload) => apiPost('/credits/recharge/create', payload)
