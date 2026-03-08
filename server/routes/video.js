const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const videoGenerationService = require('../services/videoGenerationService');
const redisService = require('../services/redisService');
const userDataService = require('../userDataService');
const { historyService } = require('../database');
const videoModelRepository = require('../repositories/videoModelRepository');

const router = express.Router();

// 配置multer用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'), false);
    }
  }
});

/**
 * 生成视频API
 * POST /api/video/generate
 */
router.post('/generate', authenticateToken, upload.fields([
  { name: 'firstFrame', maxCount: 1 },
  { name: 'lastFrame', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('[视频生成] 完整的 req.body:', req.body);
    console.log('[视频生成] req.user 在入口点:', JSON.stringify(req.user, null, 2));

    const {
      prompt,
      modelId,  // 可能是API模型ID字符串或数据库ID
      modelDbId, // 数据库ID(优先使用)
      duration = 5,
      resolution = '720p',
      ratio = '16:9',
      watermark = false,
      camerafixed = false,
      returnLastFrame = false,
      seed = null,
      hd = false,  // Sora2 Pro HD功能
      private: isPrivate = false,  // Sora2 隐私功能
      characterUrl,  // Sora2 角色客串 - 角色视频URL
      characterTimestamps  // Sora2 角色客串 - 时间范围
    } = req.body;

    console.log('[视频生成] 解构后的参数:', {
      prompt: prompt?.substring(0, 20),
      modelId,
      modelDbId,
      duration,
      resolution,
      ratio,
      hd,
      private: isPrivate,
      hasCharacter: !!characterUrl
    });

    const firstFrame = req.files?.firstFrame?.[0];
    const lastFrame = req.files?.lastFrame?.[0];

    if (!prompt) {
      return res.status(400).json({ error: '提示词不能为空' });
    }

    // 如果提供了 modelDbId,查询数据库获取真实的模型配置
    let actualModelId = 'doubao-seedance-1-0-lite-i2v-250428'; // 默认值
    let modelType = 'image-to-video-first'; // 默认类型
    let videoModelDbId = null; // 数据库ID，用于保存历史记录

    console.log('[视频生成] 收到的参数:', { modelId, modelDbId });

    // 优先使用 modelDbId 查询数据库
    const dbIdToQuery = modelDbId || modelId;

    if (dbIdToQuery) {
      const isDbId = !isNaN(dbIdToQuery);

      console.log('[视频生成] 查询参数:', { dbIdToQuery, isDbId });

      if (isDbId) {
        console.log('[视频生成] 查询数据库ID:', dbIdToQuery);

        const model = await videoModelRepository.findActiveById(dbIdToQuery);

        console.log('[视频生成] 数据库查询结果:', model ? [model] : []);

        if (model) {
          videoModelDbId = model.id;
          actualModelId = model.model_id;
          modelType = model.model_type;
          console.log(`[视频生成] 使用数据库ID ${dbIdToQuery} 查询到模型: ${model.name}, db_id: ${videoModelDbId}, model_id: ${actualModelId}, type: ${modelType}`);
        } else {
          console.error('[视频生成] 未找到模型, dbId:', dbIdToQuery);
          return res.status(400).json({ error: '指定的视频模型不存在或未启用' });
        }
      } else {
        actualModelId = dbIdToQuery;
        console.log('[视频生成] 直接使用模型ID字符串:', actualModelId);

        try {
          const model = await videoModelRepository.findActiveByModelId(actualModelId);
          if (model) {
            videoModelDbId = model.id;
            console.log('[视频生成] 通过model_id查询到数据库ID:', videoModelDbId);
          }
        } catch (e) {
          console.warn('[视频生成] 查询数据库ID失败，将使用字符串存储:', e.message);
        }
      }
    }

    console.log('[视频生成] 最终使用的 actualModelId:', actualModelId, 'videoModelDbId:', videoModelDbId, 'modelType:', modelType);

    // 根据模型类型检查首帧图片
    const isImageToVideo = modelType.includes('image-to-video');
    if (isImageToVideo && !firstFrame) {
      return res.status(400).json({ error: '图生视频模式需要上传首帧图片' });
    }

    // 生成任务ID
    const taskId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 缓存任务信息到Redis (使用基本set方法,24小时过期)
    const taskData = {
      status: 'processing',
      prompt,
      modelId: actualModelId,
      duration: parseInt(duration),
      resolution,
      ratio,
      watermark: watermark === 'true' || watermark === true,
      camerafixed: camerafixed === 'true' || camerafixed === true,
      returnLastFrame: returnLastFrame === 'true' || returnLastFrame === true,
      seed: seed ? parseInt(seed) : null,
      hd: hd === 'true' || hd === true,
      private: isPrivate === 'true' || isPrivate === true,
      hasCharacter: !!characterUrl,
      createdAt: new Date().toISOString()
    };

    await redisService.set(`video:task:${taskId}`, taskData, 86400); // 24小时过期

    // 异步生成视频
    generateVideoAsync(taskId, {
      prompt,
      modelId: actualModelId, // API使用的model_id
      videoModelDbId: videoModelDbId, // 数据库ID，用于历史记录
      duration: parseInt(duration),
      resolution,
      ratio,
      watermark: watermark === 'true' || watermark === true,
      camerafixed: camerafixed === 'true' || camerafixed === true,
      returnLastFrame: returnLastFrame === 'true' || returnLastFrame === true,
      seed: seed ? parseInt(seed) : null,
      firstFrame,
      lastFrame,
      hd: hd === 'true' || hd === true,
      private: isPrivate === 'true' || isPrivate === true,
      characterUrl,
      characterTimestamps
    }, req.user);

    res.json({
      taskId,
      status: 'processing',
      message: '视频生成任务已提交，请稍后查询结果'
    });

  } catch (error) {
    console.error('生成视频API错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 异步生成视频函数
 */
const generateVideoAsync = async (taskId, params, user = null) => {
  try {
    // 添加调试日志
    console.log('[视频生成] generateVideoAsync 接收到的 user 参数:', JSON.stringify(user, null, 2));
    console.log('[视频生成] user存在?', !!user);
    console.log('[视频生成] user.userId存在?', user && user.userId);
    console.log('[视频生成] user.id存在?', user && user.id);

    // 更新任务状态
    await redisService.set(`video:task:${taskId}`, {
      status: 'processing',
      ...params,
      createdAt: new Date().toISOString()
    }, 86400);

    // 调用视频生成服务
    const result = await videoGenerationService.generateVideo(params);

    console.log('[视频生成] 生成结果:', result);

    // 保存原始视频URL
    const originalVideoUrl = result.url;
    let ossVideoUrl = null;
    let ossKey = null;
    const ossManager = require('../utils/ossManager');

    // 确定用户ID（登录用户或guest） - 修复：支持userId和id两种字段名
    const effectiveUserId = (user && (user.userId || user.id)) ? (user.userId || user.id).toString() : 'guest';
    console.log('[视频生成] 确定的 effectiveUserId:', effectiveUserId);
    console.log('[视频生成] 视频URL:', originalVideoUrl);

    // 上传参考图到OSS（首帧和尾帧）
    const referenceImages = [];

    // 上传首帧图片到OSS
    if (params.firstFrame && params.firstFrame.buffer) {
      try {
        console.log('[视频生成] 开始上传首帧图片到OSS...');
        const timestamp = Date.now();
        const firstFrameKey = `video-reference/${effectiveUserId}/${timestamp}_first_frame.jpg`;
        const firstFrameOssUrl = await ossManager.uploadBuffer(
          params.firstFrame.buffer,
          firstFrameKey,
          params.firstFrame.mimetype || 'image/jpeg'
        );
        console.log('[视频生成] 首帧图片上传OSS成功:', firstFrameOssUrl);
        referenceImages.push({
          type: 'first',
          url: firstFrameOssUrl,
          ossKey: firstFrameKey
        });
      } catch (error) {
        console.error('[视频生成] 上传首帧图片到OSS失败:', error);
      }
    }

    // 上传尾帧图片到OSS
    if (params.lastFrame && params.lastFrame.buffer) {
      try {
        console.log('[视频生成] 开始上传尾帧图片到OSS...');
        const timestamp = Date.now();
        const lastFrameKey = `video-reference/${effectiveUserId}/${timestamp}_last_frame.jpg`;
        const lastFrameOssUrl = await ossManager.uploadBuffer(
          params.lastFrame.buffer,
          lastFrameKey,
          params.lastFrame.mimetype || 'image/jpeg'
        );
        console.log('[视频生成] 尾帧图片上传OSS成功:', lastFrameOssUrl);
        referenceImages.push({
          type: 'last',
          url: lastFrameOssUrl,
          ossKey: lastFrameKey
        });
      } catch (error) {
        console.error('[视频生成] 上传尾帧图片到OSS失败:', error);
      }
    }

    // 上传视频到OSS
    if (originalVideoUrl) {
      try {
        const config = require('../config');

        // 检查是否已经是自己的OSS链接
        // 正确的OSS URL格式应该是: https://bucket.region.aliyuncs.com/path
        // 例如: https://creatimage.oss-cn-beijing.aliyuncs.com/path
        const isOwnOssUrl = originalVideoUrl &&
          originalVideoUrl.includes(`${config.oss.bucket}.${config.oss.region}.aliyuncs.com`);

        if (isOwnOssUrl) {
          // 已经是自己的OSS链接，不需要转存
          console.log('[视频生成] 视频已经是自己的OSS链接，跳过转存:', originalVideoUrl);
          ossVideoUrl = originalVideoUrl;
        } else {
          console.log('[视频生成] 开始转存视频到OSS...', originalVideoUrl);
          const ossResults = await ossManager.downloadAndUploadImages(
            [originalVideoUrl],
            effectiveUserId,
            'generated-videos'
          );

          if (ossResults && ossResults.length > 0 && ossResults[0].url && !ossResults[0].error) {
            ossVideoUrl = ossResults[0].url;
            ossKey = ossResults[0].key;
            console.log('[视频生成] 视频转存OSS成功:', ossVideoUrl);
          } else {
            console.warn('[视频生成] 视频转存OSS失败，使用原始URL', ossResults);
          }
        }
      } catch (ossError) {
        console.error('[视频生成] 转存视频到OSS失败:', ossError);
        // 转存失败不影响主流程，继续使用原始URL
      }
    }

    // 从分辨率字符串解析宽高 (例如 "1080p" -> 1920x1080)
    let width = result.width;
    let height = result.height;

    if (!width || !height) {
      // 如果result没有宽高，从resolution解析
      const resolutionMap = {
        '480p': { width: 854, height: 480 },
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 }
      };
      const resInfo = resolutionMap[params.resolution] || resolutionMap['1080p'];
      width = resInfo.width;
      height = resInfo.height;
    }

    // 保存到历史记录
    const historyData = {
      prompt: params.prompt,
      mode: 'video-generation',
      size: `${width}x${height}`,
      quantity: 1,
      referenceImage: referenceImages.length > 0 ? referenceImages[0].url : null, // 使用首帧作为主参考图
      referenceImages: referenceImages, // 保存所有参考图（首帧+尾帧）
      generatedImages: [{
        url: ossVideoUrl || originalVideoUrl, // 优先使用OSS URL
        originalUrl: originalVideoUrl, // 保存原始URL
        ossKey: ossKey, // 保存OSS Key
        isVideo: true
      }],
      modelId: params.videoModelDbId || params.modelId, // 优先使用数据库ID，否则使用模型字符串ID
      videoData: {
        duration: result.duration || params.duration,
        fps: result.fps || 24,
        width: width,
        height: height,
        seed: result.seed || params.seed || null,
        ratio: result.ratio || params.ratio,
        resolution: result.resolution || params.resolution
      }
    };

    console.log('[视频生成] 准备保存历史记录, historyData:', JSON.stringify(historyData, null, 2));

    let historyRecord;
    // 修复：支持userId和id两种字段名
    const userId = user && (user.userId || user.id) ? (user.userId || user.id) : null;

    if (userId) {
      // 如果用户已登录，保存到用户历史记录
      console.log('[视频生成] 保存到用户历史, userId:', userId);
      const historyResult = await userDataService.history.addHistory(userId, historyData);
      historyRecord = historyResult.record;
    } else {
      // 如果用户未登录，保存到全局历史记录
      const historyResult = await historyService.addHistory(historyData, null);
      historyRecord = historyResult.record;
    }

    console.log('[视频生成] 历史记录已保存, ID:', historyRecord.id);

    // 更新任务结果
    await redisService.set(`video:task:${taskId}`, {
      status: result.error ? 'failed' : 'completed',
      result,
      historyId: historyRecord.id,
      createdAt: new Date().toISOString()
    }, 86400);

  } catch (error) {
    console.error('异步生成视频失败:', error);

    // 更新任务状态为失败
    await redisService.set(`video:task:${taskId}`, {
      status: 'failed',
      ...params,
      error: error.message,
      createdAt: new Date().toISOString()
    }, 86400);
  }
};

/**
 * 查询视频生成结果
 * GET /api/video/result/:taskId
 */
router.get('/result/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await redisService.get(`video:task:${taskId}`);

    if (!result) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json(result);
  } catch (error) {
    console.error('查询视频生成结果失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取视频生成历史记录
 * GET /api/video/history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, searchKeyword = '' } = req.query;
    
    const result = await userDataService.history.getUserHistory(
      req.user.id, 
      parseInt(page) || 1, 
      parseInt(pageSize) || 20, 
      searchKeyword || '',
      'video-generation'  // 仅查询视频生成记录
    );
    
    const data = Array.isArray(result.data) ? result.data : [];
    
    res.json({
      success: true,
      data,
      total: result.total ?? data.length,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取视频生成历史失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 创建客串角色 (Sora2 Character功能)
 * POST /api/video/characters
 */
router.post('/characters', authenticateToken, async (req, res) => {
  try {
    const { url, timestamps } = req.body;

    if (!url || !timestamps) {
      return res.status(400).json({ error: '视频URL和时间范围不能为空' });
    }

    // 验证时间范围格式
    const timestampParts = timestamps.split(',');
    if (timestampParts.length !== 2) {
      return res.status(400).json({ error: '时间范围格式错误，应为: "start,end"' });
    }

    const start = parseFloat(timestampParts[0]);
    const end = parseFloat(timestampParts[1]);

    if (isNaN(start) || isNaN(end) || start >= end) {
      return res.status(400).json({ error: '时间范围无效' });
    }

    const duration = end - start;
    if (duration < 1 || duration > 3) {
      return res.status(400).json({ error: '时间范围差值必须在1-3秒之间' });
    }

    // 调用服务创建角色
    const character = await videoGenerationService.createCharacter({
      url,
      timestamps
    });

    res.json({
      success: true,
      character
    });

  } catch (error) {
    console.error('创建客串角色失败:', error);
    res.status(500).json({
      success: false,
      error: '创建客串角色失败',
      message: error.message
    });
  }
});

/**
 * 获取视频模型列表
 * GET /api/video/models
 */
router.get('/models', async (req, res) => {
  try {
    const rows = await videoModelRepository.listActiveModels();

    const models = rows.map(row => {
      const isImageToVideo = row.model_type === 'image-to-video-first' || row.model_type === 'image-to-video-both';
      const supportsBothFrames = row.model_type === 'image-to-video-both';

      return {
        id: row.id,
        name: row.name,
        description: `${row.provider} - ${row.model_type}`,
        provider: row.provider,
        model_id: row.model_id,
        maxDuration: 10,
        is_default: rows.indexOf(row) === 0,
        supportedResolutions: [
          { width: 1280, height: 720, label: '720p' },
          { width: 1920, height: 1080, label: '1080p' }
        ],
        mode: isImageToVideo ? 'image-to-video' : 'text-to-video',
        features: {
          supportLastFrame: supportsBothFrames
        },
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        iconUrl: row.icon_url,
        apiUrl: row.api_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    res.json({
      success: true,
      models
    });
  } catch (error) {
    console.error('获取视频模型列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取视频模型列表失败',
      message: error.message
    });
  }
});

module.exports = router;



