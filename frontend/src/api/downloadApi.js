import { apiGetBlob } from './apiClient'

export const fetchProxyBlob = (url) => apiGetBlob('/proxy-image', {
  params: { url }
})

export const triggerBlobDownload = (blob, fileName) => {
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  link.target = '_self'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl)
  }, 100)
}
