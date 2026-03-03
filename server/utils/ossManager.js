const OSS = require('ali-oss');
const config = require('../config');
const path = require('path');
const axios = require('axios');

class OSSManager {
  constructor() {
    this.client = new OSS({
      region: config.oss.region,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      bucket: config.oss.bucket,
      endpoint: config.oss.endpoint,
      timeout: 600000, // 增加超时时间到600秒（10分钟）
      requestTimeout: 600000 // 请求超时时间也设置为600秒（10分钟）
    });
  }

  /**
   * 上传图片到OSS
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} fileName - 文件名
   * @param {string} userId - 用户ID
   * @returns {Promise<{url: string, key: string}>}
   */
  async uploadImage(fileBuffer, fileName, userId) {
    try {
      // 生成唯一的文件名
      const timestamp = Date.now();
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      const uniqueFileName = `prompts/${userId}/${timestamp}_${baseName}${ext}`;

      // 上传到OSS
      const result = await this.client.put(uniqueFileName, fileBuffer);
      
      return {
        url: result.url,
        key: uniqueFileName
      };
    } catch (error) {
      console.error('OSS上传失败:', error);
      throw new Error(`图片上传失败: ${error.message}`);
    }
  }

  /**
   * 上传Buffer到OSS
   * @param {Buffer} buffer - 文件缓冲区
   * @param {string} key - OSS文件key
   * @param {string} mimeType - 文件MIME类型
   * @returns {Promise<string>} OSS URL
   */
  async uploadBuffer(buffer, key, mimeType) {
    try {
      const result = await this.client.put(key, buffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000'
        }
      });
      return result.url;
    } catch (error) {
      console.error('OSS上传失败:', error);
      throw new Error(`文件上传失败: ${error.message}`);
    }
  }

  /**
   * 删除OSS中的图片
   * @param {string} key - OSS文件key
   * @returns {Promise<boolean>}
   */
  async deleteImage(key) {
    try {
      if (!key) return true;
      
      await this.client.delete(key);
      return true;
    } catch (error) {
      console.error('OSS删除失败:', error);
      // 删除失败不抛出错误，避免影响主流程
      return false;
    }
  }

  /**
   * 判断是否为当前项目的OSS链接
   * @param {string} url - 完整URL
   * @returns {boolean}
   */
  isOwnOssUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;

    try {
      const parsed = new URL(url);
      const host = parsed.host || '';
      const bucketHost = `${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
      return host.includes(bucketHost);
    } catch (error) {
      return false;
    }
  }

  /**
   * 从OSS URL提取key；如果入参本身就是key则原样返回
   * @param {string} urlOrKey - URL或key
   * @returns {string|null}
   */
  extractOssKey(urlOrKey) {
    if (!urlOrKey || typeof urlOrKey !== 'string') return null;

    const value = urlOrKey.trim();
    if (!value) return null;

    // 非 URL，按 key 处理
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return value;
    }

    if (!this.isOwnOssUrl(value)) return null;

    try {
      const parsed = new URL(value);
      const key = (parsed.pathname || '').replace(/^\/+/, '');
      return key || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 生成预签名URL（用于前端直传）
   * @param {string} fileName - 文件名
   * @param {string} userId - 用户ID
   * @param {number} expires - 过期时间（秒）
   * @returns {Promise<{url: string, key: string, fields: object}>}
   */
  async generatePresignedUrl(fileName, userId, expires = 3600) {
    try {
      const timestamp = Date.now();
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      const uniqueFileName = `prompts/${userId}/${timestamp}_${baseName}${ext}`;

      const url = this.client.signatureUrl(uniqueFileName, {
        expires: expires,
        method: 'PUT'
      });

      return {
        url: url,
        key: uniqueFileName,
        fields: {
          key: uniqueFileName,
          'Content-Type': 'image/jpeg'
        }
      };
    } catch (error) {
      console.error('生成预签名URL失败:', error);
      throw new Error(`生成上传链接失败: ${error.message}`);
    }
  }

  /**
   * 下载并转存外部图片到OSS
   * @param {string} imageUrl - 外部图片URL
   * @param {string} userId - 用户ID
   * @param {string} prefix - 文件前缀，默认为'generated-images'
   * @returns {Promise<{url: string, key: string, originalUrl: string}>}
   */
  async downloadAndUploadImage(imageUrl, userId, prefix = 'generated-images') {
    try {
      console.log(`开始下载并转存文件: ${imageUrl}`);

      // 下载图片/视频 (增加重试机制)
      let imageBuffer = null;
      let fileSizeMB = 0; // 声明在外层作用域
      let downloadError = null;
      const maxDownloadRetries = 3;

      for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
        try {
          console.log(`下载尝试 ${attempt}/${maxDownloadRetries}...`);

          // 创建axios实例，配置超长超时策略（支持海外慢速下载）
          const axiosInstance = axios.create({
            timeout: 600000, // 600秒（10分钟）超时，支持海外慢速链接
            maxRedirects: 10,
            maxContentLength: 500 * 1024 * 1024,
            maxBodyLength: 500 * 1024 * 1024,
            // 关键：禁用HTTP代理，直接连接
            proxy: false,
            // 启用HTTP Keep-Alive
            httpAgent: new (require('http').Agent)({
              keepAlive: true,
              keepAliveMsecs: 60000, // 增加到60秒
              maxSockets: 50,
              maxFreeSockets: 10,
              timeout: 600000, // 10分钟
              scheduling: 'lifo' // 后进先出，优先使用最近的连接
            }),
            httpsAgent: new (require('https').Agent)({
              keepAlive: true,
              keepAliveMsecs: 60000, // 增加到60秒
              maxSockets: 50,
              maxFreeSockets: 10,
              timeout: 600000, // 10分钟
              rejectUnauthorized: false, // 允许自签名证书
              scheduling: 'lifo' // 后进先出，优先使用最近的连接
            })
          });

          const response = await axiosInstance.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Pragma': 'no-cache'
            },
            // 添加进度监控，防止连接挂起，更频繁地输出进度
            onDownloadProgress: (progressEvent) => {
              const loaded = progressEvent.loaded || 0;
              const total = progressEvent.total || 0;
              const loadedMB = (loaded / 1024 / 1024).toFixed(2);

              if (total > 0) {
                const percentCompleted = Math.round((loaded * 100) / total);
                // 每10%输出一次进度（海外慢速下载需要更多反馈）
                if (percentCompleted % 10 === 0) {
                  const totalMB = (total / 1024 / 1024).toFixed(2);
                  console.log(`下载进度: ${percentCompleted}% (${loadedMB}MB / ${totalMB}MB)`);
                }
              } else {
                // 没有总大小信息时，每5MB输出一次
                if (loaded % (5 * 1024 * 1024) < 100000) {
                  console.log(`已下载: ${loadedMB}MB`);
                }
              }
            },
            // 设置验证状态码的范围
            validateStatus: (status) => status >= 200 && status < 300
          });

          if (!response.data) {
            throw new Error('下载文件失败：响应数据为空');
          }

          imageBuffer = Buffer.from(response.data);
          fileSizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
          console.log(`文件下载成功，大小: ${fileSizeMB}MB (${imageBuffer.length} bytes)`);
          break; // 下载成功，跳出循环

        } catch (error) {
          downloadError = error;
          console.warn(`下载失败 (尝试 ${attempt}/${maxDownloadRetries}):`, error.message);

          if (attempt < maxDownloadRetries) {
            // 针对海外慢速链接，使用适度的重试间隔
            // 避免因超时而浪费太长时间
            let delay;

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
              // 超时错误说明连接慢，快速重试（可能是临时网络波动）
              delay = 3000; // 固定3秒
              console.log(`检测到超时，等待 ${delay}ms 后快速重试...`);
            } else if (error.message && error.message.includes('aborted')) {
              // 流中止错误，需要清理连接后重试
              console.log('检测到流中止错误，清理连接后重试...');
              delay = 5000; // 5秒恢复时间
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // 其他错误，使用较短的指数退避
              delay = Math.min(5000 * attempt, 15000); // 5秒、10秒、15秒
              console.log(`等待 ${delay}ms 后重试下载...`);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // 检查下载是否成功
      if (!imageBuffer) {
        throw new Error(`下载失败（已重试${maxDownloadRetries}次）: ${downloadError?.message || '未知错误'}`);
      }

      // 从URL或Content-Type检测图片/视频格式
      let imageFormat = 'webp'; // 默认使用webp
      let mimeType = 'image/webp';
      let isVideo = false;

      try {
        // 从URL扩展名检测格式
        const urlParts = imageUrl.split('.');
        const urlExtension = urlParts[urlParts.length - 1].toLowerCase().split('?')[0];

        // 支持图片格式
        if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(urlExtension)) {
          imageFormat = urlExtension === 'jpg' ? 'jpeg' : urlExtension;
          mimeType = `image/${imageFormat}`;
        }
        // 支持视频格式
        else if (['mp4', 'webm', 'mov', 'avi', 'flv', 'm4v'].includes(urlExtension)) {
          imageFormat = urlExtension;
          mimeType = `video/${urlExtension}`;
          isVideo = true;
        }

        console.log(`检测到${isVideo ? '视频' : '图片'}格式: ${imageFormat}, MIME类型: ${mimeType}`);
      } catch (error) {
        console.log('无法检测文件格式，使用默认WebP格式');
      }

      // 生成文件名（保持原始格式）
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const fileName = `${prefix}/${userId}/${timestamp}_${randomStr}.${imageFormat}`;

      // 直接上传原始图片到OSS（添加重试机制）
      let uploadSuccess = false;
      let lastError = null;
      const maxRetries = 5; // 增加到5次重试

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`OSS上传尝试 ${attempt}/${maxRetries}...`);

          const result = await this.client.put(fileName, imageBuffer, {
            headers: {
              'Content-Type': mimeType,
              'Cache-Control': 'public, max-age=31536000' // 1年缓存
            },
            timeout: 180000 // OSS上传超时设为3分钟
          });

          console.log(`${isVideo ? '视频' : '图片'}转存成功: ${result.url}, 大小: ${fileSizeMB}MB`);
          uploadSuccess = true;

          return {
            url: result.url,
            key: fileName,
            originalUrl: imageUrl,
            size: imageBuffer.length
          };
        } catch (error) {
          lastError = error;
          console.warn(`OSS上传失败 (尝试 ${attempt}/${maxRetries}):`, error.message);

          if (attempt < maxRetries) {
            // 根据错误类型调整重试策略
            if (error.code === 'ECONNRESET' || error.code === 'ResponseError' || error.name === 'ConnectionTimeoutError') {
              // 连接相关错误，使用更长的等待时间
              const delay = 3000 * attempt; // 3秒、6秒、9秒、12秒
              console.log(`连接错误，等待 ${delay}ms 后重试...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else if (error.code === 'RequestError' || error.message.includes('timeout')) {
              // 超时错误，快速重试
              const delay = 1000 * attempt;
              console.log(`超时错误，等待 ${delay}ms 后重试...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // 其他错误，使用标准指数退避
              const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
              console.log(`等待 ${delay}ms 后重试...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      }

      // 所有重试都失败
      throw new Error(`OSS上传失败（已重试${maxRetries}次）: ${lastError.message}`);
    } catch (error) {
      console.error('下载并转存文件失败:', error);
      throw new Error(`文件转存失败: ${error.message}`);
    }
  }

  /**
   * 批量下载并转存图片
   * @param {Array} imageUrls - 图片URL数组
   * @param {string} userId - 用户ID
   * @param {string} prefix - 文件前缀
   * @returns {Promise<Array>}
   */
  async downloadAndUploadImages(imageUrls, userId, prefix = 'generated-images') {
    const results = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const imageUrl = imageUrls[i];
        console.log(`转存第 ${i + 1}/${imageUrls.length} 个文件: ${imageUrl}`);
        
        const result = await this.downloadAndUploadImage(imageUrl, userId, prefix);
        results.push({
          ...result,
          index: i + 1,
          timestamp: Date.now()
        });
        
        // 添加延迟避免并发过多
        if (i < imageUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`转存第 ${i + 1} 个文件失败:`, error);
        // 继续处理其他图片，不中断整个流程
        results.push({
          url: imageUrls[i], // 保留原始URL作为备用
          key: null,
          originalUrl: imageUrls[i],
          index: i + 1,
          timestamp: Date.now(),
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 压缩图片
   * @param {Buffer} imageBuffer - 原始图片缓冲区
   * @param {number} maxWidth - 最大宽度
   * @param {number} quality - 压缩质量 (0-1)
   * @returns {Promise<{buffer: Buffer, format: string, mimeType: string}>}
   */
  async compressImage(imageBuffer, maxWidth = 800, quality = 0.8) {
    try {
      const sharp = require('sharp');
      
      const metadata = await sharp(imageBuffer).metadata();
      let width = metadata.width;
      let height = metadata.height;
      const originalFormat = metadata.format;
      
      console.log(`图片格式检测: ${originalFormat}, 尺寸: ${width}x${height}`);

      // 如果图片宽度超过最大宽度，按比例缩放
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      let compressedBuffer;
      let outputFormat = originalFormat;
      let mimeType;

      // 根据原始格式选择压缩方式
      switch (originalFormat) {
        case 'png':
          console.log('使用PNG格式压缩');
          compressedBuffer = await sharp(imageBuffer)
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .png({ 
              quality: Math.round(quality * 100),
              compressionLevel: 9,
              adaptiveFiltering: true
            })
            .toBuffer();
          outputFormat = 'png';
          mimeType = 'image/png';
          break;
        case 'webp':
          console.log('使用WebP格式压缩');
          compressedBuffer = await sharp(imageBuffer)
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: Math.round(quality * 100) })
            .toBuffer();
          outputFormat = 'webp';
          mimeType = 'image/webp';
          break;
        case 'gif':
          console.log('保持GIF格式不变');
          // GIF保持原样，不进行压缩
          compressedBuffer = imageBuffer;
          outputFormat = 'gif';
          mimeType = 'image/gif';
          break;
        case 'jpeg':
        case 'jpg':
          console.log('使用JPEG格式压缩');
          compressedBuffer = await sharp(imageBuffer)
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ 
              quality: Math.round(quality * 100),
              progressive: true,
              mozjpeg: true
            })
            .toBuffer();
          outputFormat = 'jpeg';
          mimeType = 'image/jpeg';
          break;
        default:
          console.log(`未知格式 ${originalFormat}，尝试保持原格式或使用PNG`);
          // 对于未知格式，尝试保持原格式，如果失败则使用PNG
          try {
            // 尝试不转换格式，直接调整尺寸
            compressedBuffer = await sharp(imageBuffer)
              .resize(width, height, { fit: 'inside', withoutEnlargement: true })
              .toBuffer();
            mimeType = `image/${originalFormat}`;
            console.log(`成功保持原格式: ${originalFormat}`);
          } catch (formatError) {
            console.log(`保持原格式失败，转换为PNG: ${formatError.message}`);
            // 如果保持原格式失败，转换为PNG而不是JPEG
            compressedBuffer = await sharp(imageBuffer)
              .resize(width, height, { fit: 'inside', withoutEnlargement: true })
              .png({ 
                quality: Math.round(quality * 100),
                compressionLevel: 9,
                adaptiveFiltering: true
              })
              .toBuffer();
            outputFormat = 'png';
            mimeType = 'image/png';
          }
          break;
      }

      return {
        buffer: compressedBuffer,
        format: outputFormat,
        mimeType: mimeType
      };
    } catch (error) {
      console.error('图片压缩失败:', error);
      // 压缩失败返回原图，尝试检测原始格式
      try {
        const sharp = require('sharp');
        const metadata = await sharp(imageBuffer).metadata();
        const originalFormat = metadata.format || 'unknown';
        console.log(`压缩失败，返回原图，格式: ${originalFormat}`);
        return {
          buffer: imageBuffer,
          format: originalFormat,
          mimeType: `image/${originalFormat}`
        };
      } catch (detectionError) {
        console.error('格式检测也失败:', detectionError);
        return {
          buffer: imageBuffer,
          format: 'unknown',
          mimeType: 'application/octet-stream'
        };
      }
    }
  }
}

module.exports = new OSSManager();
