const { getPool } = require('../db');
const imageCacheService = require('./imageCacheService');
const ossManager = require('../utils/ossManager');
const videoOSSService = require('./videoOSSService');

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

const collectWorkOssKeys = (work) => {
  const imageKeys = new Set();
  const videoKeys = new Set();

  const coverKey = ossManager.extractOssKey(work.cover_url);
  if (coverKey) {
    if (work.content_type === 'video') {
      videoKeys.add(coverKey);
    } else {
      imageKeys.add(coverKey);
    }
  }

  const { urls, keys } = collectVideoUrlsAndKeys(work.video_data);
  for (const url of urls) {
    const key = ossManager.extractOssKey(url);
    if (key) videoKeys.add(key);
  }
  for (const key of keys) {
    const normalized = ossManager.extractOssKey(key);
    if (normalized) videoKeys.add(normalized);
  }

  return {
    imageKeys: Array.from(imageKeys),
    videoKeys: Array.from(videoKeys)
  };
};

// 公共作品服务
const worksService = {
  /**
   * 发布作品
   * @param {number} userId - 用户ID
   * @param {object} workData - 作品数据
   */
  async publishWork(userId, workData) {
    try {
      const {
        historyId,
        title,
        coverUrl,
        contentType,
        prompt,
        modelId,
        modelName,
        size,
        referenceImages = null,
        videoData = null
      } = workData;

      // 验证必需字段
      if (!coverUrl || !contentType || !prompt) {
        throw new Error('缺少必需字段：coverUrl, contentType, prompt');
      }

      // 插入作品记录
      const [result] = await pool.execute(
        `INSERT INTO public_works
        (user_id, history_id, title, cover_url, content_type, prompt, model_id, model_name, size, reference_images, video_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          historyId || null,
          title || null,
          coverUrl,
          contentType,
          prompt,
          modelId || null,
          modelName || null,
          size || null,
          referenceImages ? JSON.stringify(referenceImages) : null,
          videoData ? JSON.stringify(videoData) : null
        ]
      );

      // 清除公开作品缓存
      await imageCacheService.clearPublicWorksCache();

      return {
        success: true,
        workId: result.insertId,
        message: '作品发布成功'
      };
    } catch (error) {
      console.error('[worksService.publishWork] 发布作品失败:', error);
      throw error;
    }
  },

  /**
   * 获取公共作品列表
   * @param {object} filters - 筛选条件
   * @param {object} pagination - 分页参数
   */
  async getPublicWorks(filters = {}, pagination = {}) {
    try {
      const {
        type = null,        // 'image' | 'video'
        model = null,       // 模型ID
        sort = 'latest'     // 'latest' | 'hot'
      } = filters;

      const {
        page = 1,
        pageSize = 20
      } = pagination;

      // 先从缓存获取
      const cached = await imageCacheService.getPublicWorks(filters, page);
      if (cached) {
        console.log(`从缓存获取公开作品: 页码${page}, 筛选条件`, filters);
        return cached;
      }

      const offset = (page - 1) * pageSize;

      // 构建查询条件
      let query = 'SELECT w.id, w.user_id, w.title, w.cover_url, w.content_type, w.prompt, w.model_id, w.model_name, w.size, w.views_count, w.likes_count, w.created_at, u.username, u.email FROM public_works w LEFT JOIN users u ON w.user_id = u.id WHERE w.is_published = TRUE';

      const params = [];

      // 类型筛选
      if (type && (type === 'image' || type === 'video')) {
        query += ' AND w.content_type = ?';
        params.push(type);
      }

      // 模型筛选
      if (model) {
        query += ' AND w.model_id = ?';
        params.push(model);
      }

      // 排序
      if (sort === 'hot') {
        query += ' ORDER BY w.likes_count DESC, w.views_count DESC, w.created_at DESC';
      } else {
        query += ' ORDER BY w.created_at DESC';
      }

      // 分页
      const limit = parseInt(pageSize) || 20;
      const offsetValue = parseInt(offset) || 0;
      query += ` LIMIT ${limit} OFFSET ${offsetValue}`;

      // 执行查询
      const [works] = await pool.query(query, params);

      // 获取总数
      let countQuery = 'SELECT COUNT(*) as total FROM public_works WHERE is_published = TRUE';
      const countParams = [];

      if (type && (type === 'image' || type === 'video')) {
        countQuery += ' AND content_type = ?';
        countParams.push(type);
      }

      if (model) {
        countQuery += ' AND model_id = ?';
        countParams.push(model);
      }

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0].total;

      // 格式化返回数据
      const formattedWorks = works.map(work => ({
        id: work.id,
        userId: work.user_id,
        username: work.username || '匿名用户',
        title: work.title,
        coverUrl: work.cover_url,
        contentType: work.content_type,
        prompt: work.prompt,
        modelId: work.model_id,
        modelName: work.model_name,
        size: work.size,
        viewsCount: work.views_count,
        likesCount: work.likes_count,
        createdAt: work.created_at
      }));

      const result = {
        success: true,
        data: formattedWorks,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      };

      // 缓存结果（10分钟）
      await imageCacheService.cachePublicWorks(filters, page, result);

      return result;
    } catch (error) {
      console.error('[worksService.getPublicWorks] 获取作品列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取作品详情
   * @param {number} workId - 作品ID
   */
  async getWorkDetail(workId) {
    try {
      const [works] = await pool.execute(
        `SELECT 
          w.*,
          u.username,
          u.email
        FROM public_works w
        LEFT JOIN users u ON w.user_id = u.id
        WHERE w.id = ? AND w.is_published = TRUE`,
        [workId]
      );

      if (works.length === 0) {
        return {
          success: false,
          message: '作品不存在或已下架'
        };
      }

      const work = works[0];

      // 解析JSON字段
      let referenceImages = null;
      let videoData = null;

      if (work.reference_images) {
        try {
          referenceImages = typeof work.reference_images === 'string'
            ? JSON.parse(work.reference_images)
            : work.reference_images;
        } catch (e) {
          console.error('解析 reference_images 失败:', e);
        }
      }

      if (work.video_data) {
        try {
          videoData = typeof work.video_data === 'string'
            ? JSON.parse(work.video_data)
            : work.video_data;
        } catch (e) {
          console.error('解析 video_data 失败:', e);
        }
      }

      return {
        success: true,
        data: {
          id: work.id,
          userId: work.user_id,
          username: work.username || '匿名用户',
          historyId: work.history_id,
          title: work.title,
          coverUrl: work.cover_url,
          contentType: work.content_type,
          prompt: work.prompt,
          modelId: work.model_id,
          modelName: work.model_name,
          size: work.size,
          referenceImages,
          videoData,
          viewsCount: work.views_count,
          likesCount: work.likes_count,
          createdAt: work.created_at,
          updatedAt: work.updated_at
        }
      };
    } catch (error) {
      console.error('[worksService.getWorkDetail] 获取作品详情失败:', error);
      throw error;
    }
  },

  /**
   * 增加浏览数
   * @param {number} workId - 作品ID
   */
  async incrementViews(workId) {
    try {
      await pool.execute(
        'UPDATE public_works SET views_count = views_count + 1 WHERE id = ?',
        [workId]
      );

      return {
        success: true,
        message: '浏览数更新成功'
      };
    } catch (error) {
      console.error('[worksService.incrementViews] 更新浏览数失败:', error);
      throw error;
    }
  },

  /**
   * 取消发布作品（用户自己的作品）- 软删除
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async unpublishWork(userId, workId) {
    try {
      // 验证作品是否属于该用户
      const [works] = await pool.execute(
        'SELECT id, user_id FROM public_works WHERE id = ?',
        [workId]
      );

      if (works.length === 0) {
        return {
          success: false,
          message: '作品不存在'
        };
      }

      if (works[0].user_id !== userId) {
        return {
          success: false,
          message: '无权操作此作品'
        };
      }

      // 软删除：设置 is_published = FALSE
      await pool.execute(
        'UPDATE public_works SET is_published = FALSE WHERE id = ? AND user_id = ?',
        [workId, userId]
      );

      // 清除公开作品缓存
      await imageCacheService.clearPublicWorksCache();

      return {
        success: true,
        message: '作品已下架'
      };
    } catch (error) {
      console.error('[worksService.unpublishWork] 取消发布失败:', error);
      throw error;
    }
  },

  /**
   * 获取用户的所有作品列表（包括已下架的）
   * @param {number} userId - 用户ID
   * @param {object} pagination - 分页参数
   */
  async getUserWorks(userId, pagination = {}) {
    try {
      const { page = 1, pageSize = 20 } = pagination;
      const validPage = Math.max(1, Number(page) || 1);
      const validPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
      const offset = (validPage - 1) * validPageSize;

      // 使用字符串拼接 LIMIT/OFFSET，避免 mysql2 对 prepared statement 的 ER_WRONG_ARGUMENTS 问题
      const [works] = await pool.execute(
        `SELECT 
          id,
          title,
          cover_url,
          content_type,
          prompt,
          model_name,
          views_count,
          likes_count,
          is_published,
          created_at
        FROM public_works
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ${validPageSize} OFFSET ${offset}`,
        [userId]
      );

      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM public_works WHERE user_id = ?',
        [userId]
      );

      return {
        success: true,
        data: works,
        pagination: {
          page: validPage,
          pageSize: validPageSize,
          total: countResult[0].total
        }
      };
    } catch (error) {
      console.error('[worksService.getUserWorks] 获取用户作品失败:', error);
      throw error;
    }
  },

  /**
   * 重新上架作品
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async republishWork(userId, workId) {
    try {
      // 验证作品是否属于该用户
      const [works] = await pool.execute(
        'SELECT id, user_id, is_published FROM public_works WHERE id = ?',
        [workId]
      );

      if (works.length === 0) {
        return {
          success: false,
          message: '作品不存在'
        };
      }

      if (works[0].user_id !== userId) {
        return {
          success: false,
          message: '无权操作此作品'
        };
      }

      if (works[0].is_published) {
        return {
          success: false,
          message: '作品已经是上架状态'
        };
      }

      // 重新上架：设置 is_published = TRUE
      await pool.execute(
        'UPDATE public_works SET is_published = TRUE WHERE id = ? AND user_id = ?',
        [workId, userId]
      );

      // 清除公开作品缓存
      await imageCacheService.clearPublicWorksCache();

      return {
        success: true,
        message: '作品已重新上架'
      };
    } catch (error) {
      console.error('[worksService.republishWork] 重新上架失败:', error);
      throw error;
    }
  },

  /**
   * 永久删除作品（删除数据库和OSS对象）
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async deleteWorkPermanently(userId, workId) {
    try {
      const [works] = await pool.execute(
        'SELECT id, user_id, cover_url, content_type, video_data FROM public_works WHERE id = ?',
        [workId]
      );

      if (works.length === 0) {
        return {
          success: false,
          message: '作品不存在'
        };
      }

      const work = works[0];
      if (work.user_id !== userId) {
        return {
          success: false,
          message: '无权操作此作品'
        };
      }

      const { imageKeys, videoKeys } = collectWorkOssKeys(work);

      if (imageKeys.length > 0) {
        await Promise.all(
          imageKeys.map(async (key) => {
            const ok = await ossManager.deleteImage(key);
            if (!ok) {
              console.warn('永久删除作品时删除图片OSS对象失败:', key);
            }
          })
        );
      }

      if (videoKeys.length > 0) {
        await Promise.all(
          videoKeys.map(async (key) => {
            const ok = await videoOSSService.deleteVideo(key);
            if (!ok) {
              console.warn('永久删除作品时删除视频OSS对象失败:', key);
            }
          })
        );
      }

      await pool.execute(
        'DELETE FROM public_works WHERE id = ? AND user_id = ?',
        [workId, userId]
      );

      await imageCacheService.clearPublicWorksCache();

      return {
        success: true,
        message: '作品已永久删除',
        deletedOss: {
          imageCount: imageKeys.length,
          videoCount: videoKeys.length
        }
      };
    } catch (error) {
      console.error('[worksService.deleteWorkPermanently] 永久删除作品失败:', error);
      throw error;
    }
  },

  /**
   * 点赞作品
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async likeWork(userId, workId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查作品是否存在
      const [works] = await connection.execute(
        'SELECT id FROM public_works WHERE id = ?',
        [workId]
      );

      if (works.length === 0) {
        await connection.rollback();
        return {
          success: false,
          message: '作品不存在'
        };
      }

      // 检查是否已经点赞
      const [existing] = await connection.execute(
        'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?',
        [userId, workId]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return {
          success: false,
          message: '已经点赞过了'
        };
      }

      // 插入点赞记录
      await connection.execute(
        'INSERT INTO work_likes (user_id, work_id, created_at) VALUES (?, ?, ?)',
        [userId, workId, Date.now()]
      );

      // 增加点赞计数
      await connection.execute(
        'UPDATE public_works SET likes_count = likes_count + 1 WHERE id = ?',
        [workId]
      );

      await connection.commit();

      return {
        success: true,
        message: '点赞成功'
      };
    } catch (error) {
      await connection.rollback();
      console.error('[worksService.likeWork] 点赞失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 取消点赞作品
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async unlikeWork(userId, workId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查是否已点赞
      const [existing] = await connection.execute(
        'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?',
        [userId, workId]
      );

      if (existing.length === 0) {
        await connection.rollback();
        return {
          success: false,
          message: '还未点赞'
        };
      }

      // 删除点赞记录
      await connection.execute(
        'DELETE FROM work_likes WHERE user_id = ? AND work_id = ?',
        [userId, workId]
      );

      // 减少点赞计数
      await connection.execute(
        'UPDATE public_works SET likes_count = likes_count - 1 WHERE id = ?',
        [workId]
      );

      await connection.commit();

      return {
        success: true,
        message: '取消点赞成功'
      };
    } catch (error) {
      await connection.rollback();
      console.error('[worksService.unlikeWork] 取消点赞失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 检查用户是否点赞了作品
   * @param {number} userId - 用户ID
   * @param {number} workId - 作品ID
   */
  async checkLikeStatus(userId, workId) {
    try {
      const [likes] = await pool.execute(
        'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?',
        [userId, workId]
      );

      return {
        success: true,
        liked: likes.length > 0
      };
    } catch (error) {
      console.error('[worksService.checkLikeStatus] 检查点赞状态失败:', error);
      throw error;
    }
  }
};

module.exports = worksService;


