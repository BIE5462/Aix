const { getPool } = require('./db');
const ossManager = require('./utils/ossManager');
const videoOSSService = require('./services/videoOSSService');

const pool = getPool();

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const collectImageUrlsFromGenerated = (generatedImages) => {
  const urls = [];
  const list = safeParseJson(generatedImages, []);
  if (!Array.isArray(list)) return urls;

  for (const item of list) {
    if (typeof item === 'string') {
      urls.push(item);
    } else if (item && typeof item === 'object' && typeof item.url === 'string') {
      urls.push(item.url);
    }
  }

  return urls;
};

const collectVideoUrlsAndKeys = (videoData) => {
  const parsed = safeParseJson(videoData, null);
  const urlKeys = new Set(['video_url', 'videoUrl', 'url', 'playUrl', 'downloadUrl']);
  const keyKeys = new Set(['ossKey', 'key', 'videoKey', 'video_key']);
  const urls = new Set();
  const keys = new Set();

  const walk = (node) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node === 'string') {
      if (node.startsWith('http://') || node.startsWith('https://')) {
        urls.add(node);
      }
      return;
    }

    if (typeof node !== 'object') return;

    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && keyKeys.has(k) && v.trim()) {
        keys.add(v.trim());
      }
      if (typeof v === 'string' && urlKeys.has(k)) {
        urls.add(v);
      }
      if (typeof v === 'object') {
        walk(v);
      }
    }
  };

  walk(parsed);
  return { urls: Array.from(urls), keys: Array.from(keys) };
};

const collectHistoryOssKeys = (record) => {
  const imageKeySet = new Set();
  const videoKeySet = new Set();

  const generatedUrls = collectImageUrlsFromGenerated(record.generated_images);
  for (const url of generatedUrls) {
    const key = ossManager.extractOssKey(url);
    if (key) imageKeySet.add(key);
  }

  const { urls: videoUrls, keys: videoKeys } = collectVideoUrlsAndKeys(record.video_data);
  for (const url of videoUrls) {
    const key = ossManager.extractOssKey(url);
    if (key) videoKeySet.add(key);
  }
  for (const key of videoKeys) {
    const normalized = ossManager.extractOssKey(key);
    if (normalized) videoKeySet.add(normalized);
  }

  return {
    imageKeys: Array.from(imageKeySet),
    videoKeys: Array.from(videoKeySet)
  };
};

// 用户数据服务
const userDataService = {
  // 提示词管理
  prompts: {
    // 获取用户的所有提示词
    async getUserPrompts(userId) {
      try {
        const [prompts] = await pool.execute(
          'SELECT * FROM user_prompts WHERE user_id = ? ORDER BY updated_at DESC',
          [userId]
        );
        
        return {
          success: true,
          prompts: prompts.map(prompt => ({
            id: prompt.id,
            title: prompt.title,
            content: prompt.content,
            referenceImage: prompt.reference_image,
            createdAt: prompt.created_at,
            updatedAt: prompt.updated_at
          }))
        };
      } catch (error) {
        console.error('获取用户提示词失败:', error);
        throw error;
      }
    },
    
    // 添加提示词
    async addPrompt(userId, promptData) {
      try {
        const { title, content, referenceImage } = promptData;
        
        const [result] = await pool.execute(
          'INSERT INTO user_prompts (user_id, title, content, reference_image) VALUES (?, ?, ?, ?)',
          [userId, title, content, referenceImage || '']
        );
        
        return {
          success: true,
          prompt: {
            id: result.insertId,
            title,
            content,
            referenceImage: referenceImage || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        console.error('添加提示词失败:', error);
        throw error;
      }
    },
    
    // 更新提示词
    async updatePrompt(userId, promptId, promptData) {
      try {
        const { title, content, referenceImage } = promptData;
        
        const [result] = await pool.execute(
          'UPDATE user_prompts SET title = ?, content = ?, reference_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
          [title, content, referenceImage || '', promptId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('提示词不存在或无权限修改');
        }
        
        return { success: true };
      } catch (error) {
        console.error('更新提示词失败:', error);
        throw error;
      }
    },
    
    // 删除提示词
    async deletePrompt(userId, promptId) {
      try {
        const [result] = await pool.execute(
          'DELETE FROM user_prompts WHERE id = ? AND user_id = ?',
          [promptId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('提示词不存在或无权限删除');
        }
        
        return { success: true };
      } catch (error) {
        console.error('删除提示词失败:', error);
        throw error;
      }
    }
  },
  
  // 常用提示词管理
  commonPrompts: {
    // 获取用户的常用提示词
    async getUserCommonPrompts(userId) {
      try {
        const [prompts] = await pool.execute(
          'SELECT * FROM user_common_prompts WHERE user_id = ? ORDER BY created_at DESC',
          [userId]
        );
        
        return {
          success: true,
          prompts: prompts.map(prompt => ({
            id: prompt.id,
            name: prompt.name,
            content: prompt.content,
            createdAt: prompt.created_at,
            updatedAt: prompt.updated_at
          }))
        };
      } catch (error) {
        console.error('获取用户常用提示词失败:', error);
        throw error;
      }
    },
    
    // 添加常用提示词
    async addCommonPrompt(userId, promptData) {
      try {
        const { name, content } = promptData;
        
        const [result] = await pool.execute(
          'INSERT INTO user_common_prompts (user_id, name, content) VALUES (?, ?, ?)',
          [userId, name, content]
        );
        
        return {
          success: true,
          prompt: {
            id: result.insertId,
            name,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        console.error('添加常用提示词失败:', error);
        throw error;
      }
    },
    
    // 更新常用提示词
    async updateCommonPrompt(userId, promptId, promptData) {
      try {
        const { name, content } = promptData;
        
        const [result] = await pool.execute(
          'UPDATE user_common_prompts SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
          [name, content, promptId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('常用提示词不存在或无权限修改');
        }
        
        return { success: true };
      } catch (error) {
        console.error('更新常用提示词失败:', error);
        throw error;
      }
    },
    
    // 删除常用提示词
    async deleteCommonPrompt(userId, promptId) {
      try {
        const [result] = await pool.execute(
          'DELETE FROM user_common_prompts WHERE id = ? AND user_id = ?',
          [promptId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('常用提示词不存在或无权限删除');
        }
        
        return { success: true };
      } catch (error) {
        console.error('删除常用提示词失败:', error);
        throw error;
      }
    }
  },
  
  // 参考图管理（支持OSS）
  referenceImages: {
    // 获取用户的参考图
    async getUserReferenceImages(userId) {
      try {
        const [images] = await pool.execute(
          'SELECT * FROM reference_images WHERE user_id = ? AND (is_prompt_reference = 0 OR is_prompt_reference IS NULL) ORDER BY created_at DESC',
          [userId]
        );
        
        return {
          success: true,
          images: images.map(image => ({
            id: image.id,
            filename: image.filename,
            originalName: image.original_name,
            filePath: image.file_path,
            fileSize: image.file_size,
            mimeType: image.mime_type,
            url: image.oss_url || `/uploads/${image.filename}`,
            thumbnailUrl: image.oss_thumbnail_url,
            ossKey: image.oss_key,
            ossThumbnailKey: image.oss_thumbnail_key,
            categoryId: image.category_id, // 添加分类ID字段
            createdAt: image.created_at,
            updatedAt: image.updated_at
          }))
        };
      } catch (error) {
        console.error('获取用户参考图失败:', error);
        throw error;
      }
    },
    
    // 添加参考图（支持OSS）
    async addReferenceImage(userId, imageData, categoryId = null, isPromptReference = 0) {
      try {
        const {
          filename,
          originalName,
          filePath,
          fileSize,
          mimeType,
          ossUrl,
          ossKey,
          ossThumbnailUrl,
          ossThumbnailKey,
          compressedSize
        } = imageData;

        const name = originalName || filename || 'reference_image';
        const url = ossUrl || (filename ? `/uploads/${filename}` : filePath || '');

        const [result] = await pool.execute(
          'INSERT INTO reference_images (user_id, name, url, filename, original_name, file_path, file_size, mime_type, oss_url, oss_key, oss_thumbnail_url, oss_thumbnail_key, compressed_size, is_prompt_reference, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, name, url, filename, originalName, filePath, fileSize, mimeType, ossUrl, ossKey, ossThumbnailUrl, ossThumbnailKey, compressedSize, isPromptReference, categoryId]
        );

        return {
          success: true,
          image: {
            id: result.insertId,
            name,
            filename,
            originalName,
            filePath,
            fileSize,
            mimeType,
            url,
            thumbnailUrl: ossThumbnailUrl,
            ossKey,
            ossThumbnailKey,
            compressedSize,
            categoryId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        console.error('添加参考图失败:', error);
        throw error;
      }
    },
    
    // 删除参考图（支持OSS）
    async deleteReferenceImage(userId, imageId) {
      try {
        // 先获取图片信息，包括OSS key
        const [images] = await pool.execute(
          'SELECT oss_key, oss_thumbnail_key FROM reference_images WHERE id = ? AND user_id = ?',
          [imageId, userId]
        );
        
        if (images.length === 0) {
          throw new Error('参考图不存在或无权限删除');
        }
        
        const image = images[0];
        
        // 删除数据库记录
        const [result] = await pool.execute(
          'DELETE FROM reference_images WHERE id = ? AND user_id = ?',
          [imageId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('参考图删除失败');
        }
        
        return { 
          success: true,
          ossKey: image.oss_key,
          ossThumbnailKey: image.oss_thumbnail_key
        };
      } catch (error) {
        console.error('删除参考图失败:', error);
        throw error;
      }
    },

    // 批量删除参考图（支持OSS）
    async deleteMultipleReferenceImages(userId, imageIds) {
      try {
        // 先获取所有图片的OSS key信息
        const [images] = await pool.execute(
          'SELECT id, oss_key, oss_thumbnail_key FROM reference_images WHERE id IN (?) AND user_id = ?',
          [imageIds, userId]
        );
        
        if (images.length === 0) {
          throw new Error('没有找到可删除的参考图');
        }
        
        // 删除数据库记录
        const [result] = await pool.execute(
          'DELETE FROM reference_images WHERE id IN (?) AND user_id = ?',
          [imageIds, userId]
        );
        
        // 返回OSS key信息供外部删除OSS文件
        const ossKeys = images.map(img => img.oss_key).filter(key => key);
        const ossThumbnailKeys = images.map(img => img.oss_thumbnail_key).filter(key => key);
        
        return {
          success: true,
          deletedCount: result.affectedRows,
          ossKeys,
          ossThumbnailKeys
        };
      } catch (error) {
        console.error('批量删除参考图失败:', error);
        throw error;
      }
    }
  },
  
  // 历史记录管理（扩展现有的historyService）
  history: {
    // 获取用户的历史记录
    async getUserHistory(userId, page = 1, pageSize = 20, searchKeyword = '', modeFilter = null) {
      try {
        // 确保参数是有效的数字
        const validPage = Math.max(1, Number(page) || 1);
        const validPageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
        const offset = (validPage - 1) * validPageSize;

        let query = `SELECT h.*, m.name as model_name, m.description as model_description
                     FROM history_records h
                     LEFT JOIN ai_models m ON h.model_id = m.id
                     WHERE h.user_id = ?`;
        let countQuery = 'SELECT COUNT(*) as total FROM history_records WHERE user_id = ?';
        const params = [userId];
        const countParams = [userId];

        // 添加模式筛选
        if (modeFilter) {
          if (modeFilter === 'image') {
            // 筛选图片模式（text-to-image 或 image-to-image）
            query += ' AND h.mode IN ("text-to-image", "image-to-image")';
            countQuery += ' AND mode IN ("text-to-image", "image-to-image")';
          } else {
            // 筛选特定模式（如 video-generation）
            query += ' AND h.mode = ?';
            countQuery += ' AND mode = ?';
            params.push(modeFilter);
            countParams.push(modeFilter);
          }
        }

        if (searchKeyword) {
          query += ' AND h.prompt LIKE ?';
          countQuery += ' AND prompt LIKE ?';
          params.push(`%${searchKeyword}%`);
          countParams.push(`%${searchKeyword}%`);
        }

        // 直接拼接 LIMIT 和 OFFSET 到查询字符串中，避免参数化查询的问题
        query += ` ORDER BY h.created_at DESC LIMIT ${validPageSize} OFFSET ${offset}`;

        const [records] = await pool.execute(query, params);
        const [countResult] = await pool.execute(countQuery, countParams);
        
        return {
          success: true,
          data: records.map(record => {
            let generatedImages = [];
            let videoData = null;

            try {
              if (record.generated_images) {
                generatedImages = typeof record.generated_images === 'string'
                  ? JSON.parse(record.generated_images)
                  : record.generated_images;
              }
            } catch (error) {
              console.error('解析generated_images失败:', error, record.generated_images);
              generatedImages = [];
            }

            try {
              if (record.video_data) {
                videoData = typeof record.video_data === 'string'
                  ? JSON.parse(record.video_data)
                  : record.video_data;
              }
            } catch (error) {
              console.error('解析video_data失败:', error);
              videoData = null;
            }

            return {
              id: record.id,
              prompt: record.prompt,
              mode: record.mode,
              size: record.size,
              quantity: record.quantity,
              referenceImage: record.reference_image,
              generatedImages: generatedImages,
              videoData: videoData,
              modelId: record.model_id,
              modelName: record.model_name,
              modelDescription: record.model_description,
              // 新增：返回标签、常用提示词和参考图元数据
              tags: record.tags ? (typeof record.tags === 'string' ? JSON.parse(record.tags) : record.tags) : [],
              selectedCommonPrompts: record.selected_common_prompts ? (typeof record.selected_common_prompts === 'string' ? JSON.parse(record.selected_common_prompts) : record.selected_common_prompts) : [],
              selectedReferenceImages: record.selected_reference_images ? (typeof record.selected_reference_images === 'string' ? JSON.parse(record.selected_reference_images) : record.selected_reference_images) : [],
              createdAt: record.created_at,
              updatedAt: record.updated_at
            };
          }),
          total: countResult[0].total,
          pagination: {
            page: validPage,
            pageSize: validPageSize,
            total: countResult[0].total,
            totalPages: Math.ceil(countResult[0].total / validPageSize)
          }
        };
      } catch (error) {
        console.error('获取用户历史记录失败:', error);
        console.error('错误详情:', {
          message: error.message,
          code: error.code,
          errno: error.errno,
          sql: error.sql,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        });
        throw error;
      }
    },
    
    // 添加历史记录
    async addHistory(userId, historyData) {
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { prompt, mode, size, quantity, referenceImage, generatedImages, modelId, videoData, tags, selectedCommonPrompts, selectedReferenceImages } = historyData;

          console.log(`尝试添加历史记录 (第${attempt}次尝试)...`);
          console.log('historyData详情:', {
            userId,
            prompt: prompt?.substring(0, 50),
            mode,
            size,
            quantity,
            referenceImage,
            generatedImages: generatedImages?.length,
            modelId,
            videoData: videoData ? 'exists' : 'null',
            tags: tags?.length || 0,
            selectedCommonPrompts: selectedCommonPrompts?.length || 0,
            selectedReferenceImages: selectedReferenceImages?.length || 0
          });

          // 确保所有参数都不是undefined
          const safeParams = [
            userId,
            prompt || '',
            mode || 'text-to-image',
            size || '1024x1024',
            quantity || 1,
            referenceImage || null,
            JSON.stringify(generatedImages || []),
            modelId || null,
            videoData ? JSON.stringify(videoData) : null,
            selectedCommonPrompts ? JSON.stringify(selectedCommonPrompts) : null,
            selectedReferenceImages ? JSON.stringify(selectedReferenceImages) : null
          ];

          console.log('safeParams检查:', safeParams.map((p, i) => `${i}: ${typeof p === 'undefined' ? 'UNDEFINED!' : typeof p}`));

          const [result] = await pool.execute(
            'INSERT INTO history_records (user_id, prompt, mode, size, quantity, reference_image, generated_images, model_id, video_data, selected_common_prompts, selected_reference_images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            safeParams
          );

          console.log(`历史记录添加成功，ID: ${result.insertId}`);
          
          return {
            success: true,
            record: {
              id: result.insertId,
              prompt,
              mode,
              size,
              quantity,
              referenceImage: referenceImage || '',
              generatedImages,
              modelId: modelId || null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          };
        } catch (error) {
          lastError = error;
          console.error(`添加历史记录失败 (第${attempt}次尝试):`, error.message);
          
          if (attempt < maxRetries) {
            const delay = attempt * 1000; // 递增延迟
            console.log(`${delay}ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      console.error('添加历史记录最终失败:', lastError);
      throw lastError;
    },
    
    // 删除历史记录
    async deleteHistory(userId, recordId) {
      try {
        const [records] = await pool.execute(
          'SELECT generated_images, video_data FROM history_records WHERE id = ? AND user_id = ?',
          [recordId, userId]
        );

        if (records.length === 0) {
          throw new Error('历史记录不存在或无权限删除');
        }

        const { imageKeys, videoKeys } = collectHistoryOssKeys(records[0]);

        if (imageKeys.length > 0) {
          await Promise.all(
            imageKeys.map(async (key) => {
              const ok = await ossManager.deleteImage(key);
              if (!ok) {
                console.warn('删除历史图片OSS对象失败:', key);
              }
            })
          );
        }

        if (videoKeys.length > 0) {
          await Promise.all(
            videoKeys.map(async (key) => {
              const ok = await videoOSSService.deleteVideo(key);
              if (!ok) {
                console.warn('删除历史视频OSS对象失败:', key);
              }
            })
          );
        }

        const [result] = await pool.execute(
          'DELETE FROM history_records WHERE id = ? AND user_id = ?',
          [recordId, userId]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('历史记录不存在或无权限删除');
        }
        
        return { success: true, deletedOss: { imageCount: imageKeys.length, videoCount: videoKeys.length } };
      } catch (error) {
        console.error('删除历史记录失败:', error);
        throw error;
      }
    },

    // 清空历史记录（同时删除OSS对象）
    async clearHistory(userId) {
      try {
        const [records] = await pool.execute(
          'SELECT generated_images, video_data FROM history_records WHERE user_id = ?',
          [userId]
        );

        const imageKeySet = new Set();
        const videoKeySet = new Set();

        for (const record of records) {
          const { imageKeys, videoKeys } = collectHistoryOssKeys(record);
          imageKeys.forEach((key) => imageKeySet.add(key));
          videoKeys.forEach((key) => videoKeySet.add(key));
        }

        if (imageKeySet.size > 0) {
          await Promise.all(
            Array.from(imageKeySet).map(async (key) => {
              const ok = await ossManager.deleteImage(key);
              if (!ok) {
                console.warn('清空历史时删除图片OSS对象失败:', key);
              }
            })
          );
        }

        if (videoKeySet.size > 0) {
          await Promise.all(
            Array.from(videoKeySet).map(async (key) => {
              const ok = await videoOSSService.deleteVideo(key);
              if (!ok) {
                console.warn('清空历史时删除视频OSS对象失败:', key);
              }
            })
          );
        }

        const [result] = await pool.execute(
          'DELETE FROM history_records WHERE user_id = ?',
          [userId]
        );

        return {
          success: true,
          deletedCount: result.affectedRows,
          deletedOss: {
            imageCount: imageKeySet.size,
            videoCount: videoKeySet.size
          }
        };
      } catch (error) {
        console.error('清空历史记录失败:', error);
        throw error;
      }
    }
  }
};

module.exports = userDataService;

