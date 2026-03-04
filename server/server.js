const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { initDatabase, historyService, getConnection } = require('./database');
const migrateDatabase = require('./migrate-db');
const migrateCategories = require('./migrate-categories');
const redisService = require('./redis');
const imageCacheService = require('./services/imageCacheService');
const ossRetryService = require('./services/ossRetryService');
const apiService = require('./apiService');
const authService = require('./authService');
const referenceImageOSS = require('./services/referenceImageOSS');
const userDataService = require('./userDataService');
const creditService = require('./services/creditService');
const modelPricingService = require('./services/modelPricingService');

// 导入新的服务
const ReferenceImageService = require('./services/referenceImageService');

// 导入新的认证路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const promptRoutes = require('./routes/prompts');
const adminRoutes = require('./routes/admin');
const videoRoutes = require('./routes/video');
const referenceImageRoutes = require('./routes/referenceImages');
const worksRoutes = require('./routes/works');
const creditsRoutes = require('./routes/credits');
const textModelsRoutes = require('./routes/textModels');
const aiPromptsRoutes = require('./routes/aiPrompts');
const batchPromptsRoutes = require('./routes/batchPrompts');
const videoModelsRoutes = require('./routes/videoModels');

const app = express();
const PORT = config.server.port;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 认证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }
    
    const result = await authService.verifyToken(token);
    req.user = result.user;
    next();
  } catch (error) {
    return res.status(403).json({ error: '无效的访问令牌' });
  }
};

// 可选认证中间件（允许未登录用户访问）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const result = await authService.verifyToken(token);
      req.user = result.user;
    }
    next();
  } catch (error) {
    // 忽略认证错误，继续处理请求
    next();
  }
};

// 配置multer用于文件上传（使用内存存储，直接上传到OSS）
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // 最多10个文件
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('只支持图片格式: jpeg, jpg, png, gif, webp, bmp'));
    }
  }
});

// 初始化服务
const initServices = async () => {
  try {
    // 初始化数据库
    await initDatabase();

    // 运行数据库迁移
    await migrateDatabase();

    // 运行分类表迁移
    await migrateCategories();

    // 初始化Redis
    await redisService.init();

    // 初始化图片缓存服务
    await imageCacheService.init();

    // 初始化参考图服务
    const connection = getConnection();
    app.locals.referenceImageService = new ReferenceImageService(connection);

    // 启动OSS补偿服务
    await ossRetryService.start();

    console.log('所有服务初始化完成');
  } catch (error) {
    console.error('服务初始化失败:', error);
    process.exit(1);
  }
};

// API路由

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OSS补偿队列状态（管理接口）
app.get('/api/admin/oss-retry-status', async (req, res) => {
  try {
    const status = await ossRetryService.getQueueStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('获取OSS补偿队列状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动触发OSS补偿处理（管理接口）
app.post('/api/admin/oss-retry-process', async (req, res) => {
  try {
    await ossRetryService.processNow();
    res.json({
      success: true,
      message: '已触发OSS补偿处理'
    });
  } catch (error) {
    console.error('手动触发OSS补偿处理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 使用新的认证路由
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/video-models', videoModelsRoutes);
app.use('/api/reference-images', authenticateToken, referenceImageRoutes);
app.use('/api/works', worksRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/text-models', textModelsRoutes);
app.use('/api/ai-prompts', aiPromptsRoutes);
app.use('/api/batch-prompts', batchPromptsRoutes);


// 用户历史记录管理（保留原有的历史记录API）
app.get('/api/user/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, searchKeyword = '' } = req.query;
    const result = await userDataService.history.getUserHistory(
      req.user.id, 
      page, 
      pageSize, 
      searchKeyword
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/user/history', authenticateToken, async (req, res) => {
  try {
    const result = await userDataService.history.addHistory(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/user/history/:id', authenticateToken, async (req, res) => {
  try {
    const result = await userDataService.history.deleteHistory(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 生成图片API
app.post('/api/generate', authenticateToken, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]), async (req, res) => {
  try {
    const { prompt, size, quantity, mode, modelId, imageSize } = req.body;
    const image = req.files?.image?.[0]; // 单张图片（向后兼容）
    const images = req.files?.images || []; // 多张图片

    if (!prompt) {
      return res.status(400).json({ error: '提示词不能为空' });
    }

    if (mode === 'image-to-image' && !image && images.length === 0) {
      return res.status(400).json({ error: '图生图模式需要上传参考图片' });
    }

    const quantityNum = parseInt(quantity) || 1;
    if (quantityNum < 1 || quantityNum > 8) {
      return res.status(400).json({ error: '生成数量必须在1-8之间' });
    }

    // 计算积分消耗
    let requiredCredits = 0;
    let modelKey = 'nano-banana'; // 默认模型key

    // 如果提供了modelId，根据ID查询模型名称作为modelKey
    if (modelId) {
      try {
        const { aiModelService } = require('./database');
        const model = await aiModelService.getModelById(modelId);
        if (model && model.name) {
          modelKey = model.name;
        }
      } catch (error) {
        console.error('查询模型信息失败:', error);
        // 如果查询失败，使用默认modelKey
      }
    }

    try {
      requiredCredits = await modelPricingService.calculatePrice(modelKey, {
        quantity: quantityNum
      });
    } catch (error) {
      console.error('计算价格失败:', error);
      // 不再使用硬编码默认价格，直接返回错误，提示管理员配置模型价格
      return res.status(400).json({
        error: error.message || '当前模型未配置价格，请联系管理员'
      });
    }

    // 检查用户余额
    const hasEnoughBalance = await creditService.checkBalance(req.user.id, requiredCredits);

    if (!hasEnoughBalance) {
      const balance = await creditService.getUserBalance(req.user.id);
      return res.status(402).json({
        error: '积分不足',
        code: 'INSUFFICIENT_CREDITS',
        required: requiredCredits,
        current: balance.balance,
        shortage: requiredCredits - balance.balance
      });
    }

    // 生成任务ID
    const taskId = Date.now().toString();

    // 缓存任务信息
    await redisService.cacheGenerationResult(taskId, {
      status: 'processing',
      prompt,
      mode,
      size,
      quantity: quantityNum,
      modelId,
      requiredCredits,
      createdAt: new Date().toISOString()
    });

    // 异步生成图片（传递所需积分）
    generateImagesAsync(taskId, {
      prompt,
      size,
      quantity: quantityNum,
      mode,
      image,
      images,
      modelId,
      requiredCredits,
      modelKey,
      imageSize
    }, req.user);

    res.json({
      taskId,
      status: 'processing',
      message: '图片生成任务已提交，请稍后查询结果',
      credits_required: requiredCredits
    });

  } catch (error) {
    console.error('生成图片API错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 异步生成图片函数
const generateImagesAsync = async (taskId, params, user = null) => {
  try {
    // 初始化结果数组
    const results = [];
    let successCount = 0;

    // 更新任务状态为处理中
    await redisService.cacheGenerationResult(taskId, {
      status: 'processing',
      ...params,
      results: [],  // 初始为空数组
      successCount: 0,
      totalCount: params.quantity,
      createdAt: new Date().toISOString()
    });

    // 定义回调函数，每张图片生成完成时调用
    const onImageGenerated = async (imageResult, index, total) => {
      results.push(imageResult);

      // 统计成功数量
      if (imageResult.url && !imageResult.error) {
        successCount++;
      }

      // 每次有新图片时更新Redis缓存
      const currentStatus = successCount === 0 && results.length === total ? 'failed' :
                           successCount < total && results.length === total ? 'partial' :
                           results.length < total ? 'processing' : 'completed';

      await redisService.cacheGenerationResult(taskId, {
        status: currentStatus,
        ...params,
        results: results,  // 包含所有已生成的图片
        successCount: successCount,
        totalCount: total,
        progress: Math.round((results.length / total) * 100),  // 添加进度百分比
        createdAt: new Date().toISOString()
      });

      console.log(`图片生成进度: ${results.length}/${total}, 成功: ${successCount}`);
    };

    // 调用API生成图片，传入回调函数
    const finalResults = await apiService.generateMultipleImages(params, user?.id, onImageGenerated);

    // 检查是否有成功的图片生成
    const finalSuccessCount = finalResults.filter(r => r.url && !r.error).length;
    const totalCount = params.quantity;

    // 保存到历史记录并扣除积分
    const historyData = {
      prompt: params.prompt,
      mode: params.mode,
      size: params.size,
      quantity: params.quantity,
      referenceImage: params.image ? `/uploads/${params.image.filename}` : null,
      referenceImages: params.images ? params.images.map(img => `/uploads/${img.filename}`) : [],
      generatedImages: finalResults,
      modelId: params.modelId || null
    };

    let historyRecord;
    let creditsConsumed = 0;
    let transactionId = null;

    if (user) {
      // 如果用户已登录，保存到用户历史记录并扣除积分
      const connection = await getConnection().getConnection();

      try {
        await connection.beginTransaction();

        // 1. 保存历史记录
        const [historyResult] = await connection.execute(
          `INSERT INTO history_records
          (user_id, prompt, mode, size, quantity, reference_image, reference_images, generated_images, model_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            user.id,
            historyData.prompt,
            historyData.mode,
            historyData.size,
            historyData.quantity,
            historyData.referenceImage,
            JSON.stringify(historyData.referenceImages),
            JSON.stringify(historyData.generatedImages),
            historyData.modelId
          ]
        );

        historyRecord = { id: historyResult.insertId };

        // 2. 仅在生成成功时扣除积分
        if (finalSuccessCount > 0) {
          // 根据实际成功数量计算应扣除的积分
          creditsConsumed = Math.ceil((params.requiredCredits / params.quantity) * finalSuccessCount);

          const transaction = await creditService.consumeCredits(
            connection,
            user.id,
            creditsConsumed,
            `生成${finalSuccessCount}张图片 - ${params.modelKey || 'unknown'}`,
            historyRecord.id,
            null // IP地址在这里可以传递，但目前没有
          );

          transactionId = transaction.transaction_id;

          // 3. 更新历史记录，记录积分消耗和交易ID
          await connection.execute(
            'UPDATE history_records SET credits_consumed = ?, transaction_id = ? WHERE id = ?',
            [creditsConsumed, transactionId, historyRecord.id]
          );

          console.log(`用户 ${user.id} 生成${finalSuccessCount}张图片，消耗${creditsConsumed}弹珠`);
        } else {
          console.log(`用户 ${user.id} 图片生成失败，不扣除积分`);
        }

        await connection.commit();

        // 3. 更新补偿队列中的historyRecordId（如果有需要补偿的图片）
        const needsRetryImages = finalResults.filter(r => r.needsOssRetry);
        if (needsRetryImages.length > 0 && historyRecord && historyRecord.id) {
          try {
            await ossRetryService.updateQueueHistoryId(
              needsRetryImages.map(img => img.ossRetryData?.originalUrl),
              historyRecord.id
            );
            console.log(`已更新${needsRetryImages.length}个补偿任务的历史记录ID`);
          } catch (updateError) {
            console.error('更新补偿队列历史记录ID失败:', updateError);
          }
        }

      } catch (error) {
        await connection.rollback();
        console.error('保存历史记录或扣除积分失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    } else {
      // 如果用户未登录，保存到全局历史记录（不扣除积分）
      const result = await historyService.addHistory(historyData, null);
      historyRecord = result.record;
    }

    // 根据生成结果确定最终状态
    let finalStatus = 'completed';
    if (finalSuccessCount === 0) {
      finalStatus = 'failed';
    } else if (finalSuccessCount < totalCount) {
      finalStatus = 'partial'; // 部分成功
    }

    // 最终更新任务结果
    await redisService.cacheGenerationResult(taskId, {
      status: finalStatus,
      ...params,
      results: finalResults,
      successCount: finalSuccessCount,
      totalCount,
      progress: 100,
      historyId: historyRecord.id,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('异步生成图片失败:', error);

    // 更新任务状态为失败
    await redisService.cacheGenerationResult(taskId, {
      status: 'failed',
      ...params,
      results: [],
      error: error.message,
      successCount: 0,
      totalCount: params.quantity,
      progress: 0,
      createdAt: new Date().toISOString()
    });
  }
};

// 查询生成结果
app.get('/api/generate/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await redisService.getGenerationResult(taskId);

    if (!result) {
      return res.status(404).json({ error: '任务不存在或已过期' });
    }

    res.json(result);
  } catch (error) {
    console.error('查询生成结果错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 历史记录API - 需要认证
app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = '', mode = null } = req.query;

    // 使用用户数据服务获取用户的历史记录
    const result = await userDataService.history.getUserHistory(
      req.user.id,
      page,
      pageSize,
      search,
      mode // 传递模式筛选参数
    );

    res.json({
      data: result.data,
      total: result.total,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize
    });
  } catch (error) {
    console.error('获取历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 删除历史记录 - 需要认证
app.delete('/api/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await userDataService.history.deleteHistory(req.user.id, id);
    
    if (success) {
      res.json({ message: '删除成功' });
    } else {
      res.status(404).json({ error: '记录不存在' });
    }
  } catch (error) {
    console.error('删除历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 清空历史记录 - 需要认证
app.delete('/api/history', authenticateToken, async (req, res) => {
  try {
    const result = await userDataService.history.clearHistory(req.user.id);
    res.json({
      success: true,
      message: `已清空${result.deletedCount}条历史记录`,
      deletedOss: result.deletedOss
    });
  } catch (error) {
    console.error('清空历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 参考图相关API

// 获取参考图列表 - 需要认证
app.get('/api/reference-images', authenticateToken, async (req, res) => {
  try {
    const result = await userDataService.referenceImages.getUserReferenceImages(req.user.id);
    res.json(result.images);
  } catch (error) {
    console.error('获取参考图列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 代理OSS图片请求，解决CORS问题
// 注意：这个端点不需要认证，因为img标签无法添加Authorization头
// 但我们限制只能代理特定的OSS域名，确保安全性
app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      console.error('代理图片请求失败: 缺少URL参数');
      return res.status(400).json({ error: '缺少图片URL参数' });
    }

    // 若希望允许任意域名，这里移除域名白名单，仅做简单的协议验证
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        console.error('代理图片请求失败: 不支持的协议', parsed.protocol);
        return res.status(400).json({ error: '不支持的URL协议' });
      }
    } catch (e) {
      console.error('代理图片请求失败: URL解析错误', e.message);
      return res.status(400).json({ error: '无效的图片URL' });
    }

    // 注意：移除域名限制会放大 SSRF 风险，请在生产环境根据需求采取额外防护。

    console.log('代理图片请求:', url);

    // 使用axios替代fetch，添加User-Agent头
    const axios = require('axios');
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    // 设置响应头
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年缓存

    // 转发图片数据
    res.send(response.data);

  } catch (error) {
    console.error('代理图片请求失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应头:', error.response.headers);
    }
    res.status(500).json({ error: '代理图片失败: ' + error.message });
  }
});

// 添加参考图（支持OSS）- 需要认证
app.post('/api/reference-images', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files;
    const { categoryId, is_prompt_reference } = req.body; // 获取分类ID和是否为临时参考图参数
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    // 如果指定了分类ID，验证分类是否存在且属于当前用户
    if (categoryId && categoryId !== '') {
      const connection = await getConnection();
      const [category] = await connection.execute(
        'SELECT id FROM reference_image_categories WHERE id = ? AND user_id = ?',
        [categoryId, req.user.id]
      );
      
      if (category.length === 0) {
        return res.status(404).json({ error: '指定的分类不存在' });
      }
    }

    // 验证文件格式和大小
    const validFiles = [];
    const errors = [];

    for (const file of files) {
      if (!referenceImageOSS.isSupportedImageFormat(file.originalname)) {
        errors.push(`${file.originalname}: 不支持的图片格式`);
        continue;
      }
      
      if (file.size > referenceImageOSS.getMaxFileSize()) {
        errors.push(`${file.originalname}: 文件大小超过10MB限制`);
        continue;
      }
      
      validFiles.push({
        buffer: file.buffer,
        fileName: file.originalname
      });
    }

    if (validFiles.length === 0) {
      return res.status(400).json({ 
        error: '没有有效的图片文件',
        details: errors
      });
    }

    // 上传到OSS
    const uploadResult = await referenceImageOSS.uploadMultipleReferenceImages(
      validFiles, 
      req.user.id,
      {
        compress: true,
        maxWidth: 1200,
        quality: 0.85,
        generateThumbnail: true
      }
    );

    if (!uploadResult.success) {
      return res.status(500).json({ 
        error: '图片上传失败',
        details: uploadResult.errors
      });
    }

    // 保存到数据库
    const results = [];
    for (const result of uploadResult.results) {
      const imageData = {
        filename: result.key.split('/').pop(),
        originalName: result.originalName,
        filePath: result.key,
        fileSize: result.originalSize,
        mimeType: referenceImageOSS.getMimeType(path.extname(result.originalName)),
        ossUrl: result.url,
        ossKey: result.key,
        ossThumbnailUrl: result.thumbnailUrl,
        ossThumbnailKey: result.thumbnailKey,
        compressedSize: result.compressedSize
      };

      const dbResult = await userDataService.referenceImages.addReferenceImage(
        req.user.id,
        imageData,
        categoryId,
        is_prompt_reference === '1' ? 1 : 0  // 传入是否为临时参考图标记
      );
      results.push(dbResult.image);
    }
    
    res.json({
      message: `成功添加${results.length}张参考图`,
      images: results,
      summary: {
        total: files.length,
        success: results.length,
        failed: errors.length + uploadResult.errors.length,
        errors: [...errors, ...uploadResult.errors.map(e => e.error)]
      }
    });
  } catch (error) {
    console.error('添加参考图错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 删除参考图（支持OSS）- 需要认证
app.delete('/api/reference-images/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 删除数据库记录并获取OSS key
    const deleteResult = await userDataService.referenceImages.deleteReferenceImage(req.user.id, id);
    
    // 删除OSS文件
    if (deleteResult.ossKey) {
      try {
        await referenceImageOSS.deleteReferenceImage(deleteResult.ossKey, deleteResult.ossThumbnailKey);
      } catch (ossError) {
        console.warn('OSS文件删除失败，但数据库记录已删除:', ossError.message);
        // OSS删除失败不影响整体删除操作
      }
    }
    
    res.json({ 
      success: true, 
      message: '参考图删除成功' 
    });
  } catch (error) {
    console.error('删除参考图错误:', error);
    if (error.message === '参考图不存在或无权限删除') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || '服务器内部错误' });
    }
  }
});

// 代理下载图片接口 - 避免CORS问题
app.post('/api/download-image', authenticateToken, async (req, res) => {
  try {
    const { imageUrl, filename } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: '请提供图片URL' });
    }
    
    console.log(`代理下载图片: ${imageUrl}`);
    
    // 使用axios下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // 设置响应头
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/png',
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    
    // 如果有文件名，设置下载头
    if (filename) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }
    
    // 将图片流传输给客户端
    response.data.pipe(res);
    
  } catch (error) {
    console.error('代理下载图片失败:', error);
    
    if (error.code === 'ECONNABORTED') {
      res.status(408).json({ error: '下载超时' });
    } else if (error.response) {
      res.status(error.response.status).json({ error: `下载失败: ${error.response.statusText}` });
    } else {
      res.status(500).json({ error: '下载失败: ' + (error.message || '未知错误') });
    }
  }
});

// 批量删除参考图（支持OSS）- 需要认证
app.delete('/api/reference-images/batch', authenticateToken, async (req, res) => {
  try {
    const { imageIds } = req.body;
    
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: '请提供要删除的图片ID列表' });
    }
    
    // 删除数据库记录并获取OSS keys
    const deleteResult = await userDataService.referenceImages.deleteMultipleReferenceImages(req.user.id, imageIds);
    
    // 删除OSS文件
    if (deleteResult.ossKeys.length > 0) {
      const allKeys = [...deleteResult.ossKeys, ...deleteResult.ossThumbnailKeys];
      await referenceImageOSS.deleteMultipleReferenceImages(allKeys);
    }
    
    res.json({ 
      success: true, 
      message: `成功删除${deleteResult.deletedCount}张参考图`,
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    console.error('批量删除参考图错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 参考图分类相关API

// 获取用户的分类列表 - 需要认证
app.get('/api/reference-image-categories', authenticateToken, async (req, res) => {
  try {
    const connection = await getConnection();

    // 排除 user-upload 分类，这是系统内部使用的分类，不应该在常用参考图中显示
    const [categories] = await connection.execute(
      'SELECT id, name, created_at FROM reference_image_categories WHERE user_id = ? AND name != ? ORDER BY created_at DESC',
      [req.user.id, 'user-upload']
    );

    res.json(categories);
  } catch (error) {
    console.error('获取分类列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 创建新分类 - 需要认证
app.post('/api/reference-image-categories', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    // 禁止创建名为 user-upload 的分类，这是系统保留名称
    if (name.trim().toLowerCase() === 'user-upload') {
      return res.status(400).json({ error: 'user-upload 是系统保留分类名称，请使用其他名称' });
    }

    const connection = await getConnection();

    // 检查分类名称是否已存在
    const [existing] = await connection.execute(
      'SELECT id FROM reference_image_categories WHERE user_id = ? AND name = ?',
      [req.user.id, name.trim()]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: '分类名称已存在' });
    }

    // 创建新分类
    const [result] = await connection.execute(
      'INSERT INTO reference_image_categories (user_id, name) VALUES (?, ?)',
      [req.user.id, name.trim()]
    );

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('创建分类错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 删除分类 - 需要认证
app.delete('/api/reference-image-categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const connection = await getConnection();
    
    // 检查分类是否存在且属于当前用户
    const [category] = await connection.execute(
      'SELECT id FROM reference_image_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    
    if (category.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }
    
    // 将分类中的图片移动到默认分类（category_id设为NULL）
    await connection.execute(
      'UPDATE reference_images SET category_id = NULL WHERE category_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    
    // 删除分类
    await connection.execute(
      'DELETE FROM reference_image_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    
    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    console.error('删除分类错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 更新分类名称 - 需要认证
app.put('/api/reference-image-categories/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    // 禁止将分类重命名为 user-upload，这是系统保留名称
    if (name.trim().toLowerCase() === 'user-upload') {
      return res.status(400).json({ error: 'user-upload 是系统保留分类名称，请使用其他名称' });
    }

    const connection = await getConnection();

    // 检查分类是否存在且属于当前用户
    const [category] = await connection.execute(
      'SELECT id FROM reference_image_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (category.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 检查新名称是否已存在
    const [existing] = await connection.execute(
      'SELECT id FROM reference_image_categories WHERE user_id = ? AND name = ? AND id != ?',
      [req.user.id, name.trim(), id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: '分类名称已存在' });
    }

    // 更新分类名称
    await connection.execute(
      'UPDATE reference_image_categories SET name = ? WHERE id = ? AND user_id = ?',
      [name.trim(), id, req.user.id]
    );

    res.json({ success: true, message: '分类更新成功' });
  } catch (error) {
    console.error('更新分类错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 批量移动图片到分类 - 需要认证
app.post('/api/reference-images/move-to-category', authenticateToken, async (req, res) => {
  try {
    const { imageIds, categoryId } = req.body;
    
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: '请选择要移动的图片' });
    }
    
    const connection = await getConnection();
    
    // 如果指定了分类ID，验证分类是否存在且属于当前用户
    if (categoryId !== null && categoryId !== undefined) {
      const [category] = await connection.execute(
        'SELECT id FROM reference_image_categories WHERE id = ? AND user_id = ?',
        [categoryId, req.user.id]
      );
      
      if (category.length === 0) {
        return res.status(404).json({ error: '目标分类不存在' });
      }
    }
    
    // 验证所有图片都属于当前用户，并检查是否已在目标分类中
    const placeholders = imageIds.map(() => '?').join(',');
    const [images] = await connection.execute(
      `SELECT id, category_id FROM reference_images WHERE id IN (${placeholders}) AND user_id = ?`,
      [...imageIds, req.user.id]
    );
    
    if (images.length !== imageIds.length) {
      return res.status(403).json({ error: '部分图片不存在或无权限操作' });
    }
    
    // 过滤掉已经在目标分类中的图片（排重）
    const imagesToUpdate = images.filter(img => img.category_id !== categoryId);
    const duplicateCount = images.length - imagesToUpdate.length;
    
    if (imagesToUpdate.length === 0) {
      return res.json({ 
        success: true, 
        message: duplicateCount > 0 ? `所有图片已在目标分类中，无需重复添加` : '没有图片需要移动',
        affectedRows: 0,
        duplicateCount: duplicateCount
      });
    }
    
    // 批量更新图片的分类
    const updatePlaceholders = imagesToUpdate.map(() => '?').join(',');
    const updateResult = await connection.execute(
      'UPDATE reference_images SET category_id = ? WHERE id IN (' + updatePlaceholders + ') AND user_id = ?',
      [categoryId, ...imagesToUpdate.map(img => img.id), req.user.id]
    );
    
    let message = `成功移动 ${updateResult[0].affectedRows} 张图片`;
    if (duplicateCount > 0) {
      message += `，${duplicateCount} 张图片已在目标分类中（已忽略）`;
    }
    
    res.json({ 
      success: true, 
      message: message,
      affectedRows: updateResult[0].affectedRows,
      duplicateCount: duplicateCount
    });
  } catch (error) {
    console.error('批量移动图片错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 批量移出分类 - 将图片从分类中移除
app.post('/api/reference-images/remove-from-category', authenticateToken, async (req, res) => {
  try {
    const { imageIds } = req.body;
    
    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: '请选择要移出的图片' });
    }
    
    const connection = await getConnection();
    
    // 验证所有图片都属于当前用户
    const placeholders = imageIds.map(() => '?').join(',');
    const [images] = await connection.execute(
      `SELECT id, category_id FROM reference_images WHERE id IN (${placeholders}) AND user_id = ?`,
      [...imageIds, req.user.id]
    );
    
    if (images.length !== imageIds.length) {
      return res.status(403).json({ error: '部分图片不存在或无权限操作' });
    }
    
    // 过滤掉没有分类的图片
    const imagesToUpdate = images.filter(img => img.category_id !== null);
    const noCategoryCount = images.length - imagesToUpdate.length;
    
    if (imagesToUpdate.length === 0) {
      return res.json({ 
        success: true, 
        message: noCategoryCount > 0 ? `所有图片都没有分类，无需移出` : '没有图片需要移出',
        affectedRows: 0,
        noCategoryCount: noCategoryCount
      });
    }
    
    // 批量移除图片的分类
    const updatePlaceholders = imagesToUpdate.map(() => '?').join(',');
    const updateResult = await connection.execute(
      'UPDATE reference_images SET category_id = NULL WHERE id IN (' + updatePlaceholders + ') AND user_id = ?',
      [...imagesToUpdate.map(img => img.id), req.user.id]
    );
    
    let message = `成功移出 ${updateResult[0].affectedRows} 张图片`;
    if (noCategoryCount > 0) {
      message += `，${noCategoryCount} 张图片本来就没有分类`;
    }
    
    res.json({ 
      success: true, 
      message: message,
      affectedRows: updateResult[0].affectedRows,
      noCategoryCount: noCategoryCount
    });
  } catch (error) {
    console.error('批量移出分类错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
const startServer = async () => {
  try {
    await initServices();
    
    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`API地址: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('正在关闭服务器...');
  await redisService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('正在关闭服务器...');
  await redisService.close();
  process.exit(0);
});

startServer();
