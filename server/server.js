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
const referenceImageOSS = require('./services/referenceImageOSS');
const userDataService = require('./userDataService');
const creditService = require('./services/creditService');
const modelPricingService = require('./services/modelPricingService');
const { authenticateToken } = require('./middleware/auth');

// 导入新的服务
const ReferenceImageService = require('./services/referenceImageService');

// 导入新的认证路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const promptRoutes = require('./routes/prompts');
const adminRoutes = require('./routes/admin');
const videoRoutes = require('./routes/video');
const referenceImageRoutes = require('./routes/referenceImages');
const referenceImageCategoriesCompatRoutes = require('./routes/referenceImageCategoriesCompat');
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
app.use('/api/reference-image-categories', authenticateToken, referenceImageCategoriesCompatRoutes);
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


