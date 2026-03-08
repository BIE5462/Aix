const express = require('express');
const { historyService, getConnection } = require('../database');
const redisService = require('../redis');
const ossRetryService = require('../services/ossRetryService');
const apiService = require('../apiService');
const creditService = require('../services/creditService');
const modelPricingService = require('../services/modelPricingService');
const { generateUploadFields } = require('../middleware/upload');

const router = express.Router();

const generateImagesAsync = async (taskId, params, user = null) => {
  try {
    const results = [];
    let successCount = 0;

    await redisService.cacheGenerationResult(taskId, {
      status: 'processing',
      ...params,
      results: [],
      successCount: 0,
      totalCount: params.quantity,
      createdAt: new Date().toISOString()
    });

    const onImageGenerated = async (imageResult, index, total) => {
      results.push(imageResult);

      if (imageResult.url && !imageResult.error) {
        successCount++;
      }

      const currentStatus = successCount === 0 && results.length === total ? 'failed'
        : successCount < total && results.length === total ? 'partial'
        : results.length < total ? 'processing'
        : 'completed';

      await redisService.cacheGenerationResult(taskId, {
        status: currentStatus,
        ...params,
        results,
        successCount,
        totalCount: total,
        progress: Math.round((results.length / total) * 100),
        createdAt: new Date().toISOString()
      });

      console.log(`图片生成进度: ${results.length}/${total}, 成功: ${successCount}`);
    };

    const finalResults = await apiService.generateMultipleImages(params, user?.id, onImageGenerated);
    const finalSuccessCount = finalResults.filter((item) => item.url && !item.error).length;
    const totalCount = params.quantity;

    const historyData = {
      prompt: params.prompt,
      mode: params.mode,
      size: params.size,
      quantity: params.quantity,
      referenceImage: params.image ? `/uploads/${params.image.filename}` : null,
      referenceImages: params.images ? params.images.map((img) => `/uploads/${img.filename}`) : [],
      generatedImages: finalResults,
      modelId: params.modelId || null
    };

    let historyRecord;
    let creditsConsumed = 0;
    let transactionId = null;

    if (user) {
      const connection = await getConnection().getConnection();

      try {
        await connection.beginTransaction();

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

        if (finalSuccessCount > 0) {
          creditsConsumed = Math.ceil((params.requiredCredits / params.quantity) * finalSuccessCount);

          const transaction = await creditService.consumeCredits(
            connection,
            user.id,
            creditsConsumed,
            `生成${finalSuccessCount}张图片 - ${params.modelKey || 'unknown'}`,
            historyRecord.id,
            null
          );

          transactionId = transaction.transaction_id;

          await connection.execute(
            'UPDATE history_records SET credits_consumed = ?, transaction_id = ? WHERE id = ?',
            [creditsConsumed, transactionId, historyRecord.id]
          );

          console.log(`用户 ${user.id} 生成${finalSuccessCount}张图片，消耗${creditsConsumed}弹珠`);
        } else {
          console.log(`用户 ${user.id} 图片生成失败，不扣除积分`);
        }

        await connection.commit();

        const needsRetryImages = finalResults.filter((item) => item.needsOssRetry);
        if (needsRetryImages.length > 0 && historyRecord && historyRecord.id) {
          try {
            await ossRetryService.updateQueueHistoryId(
              needsRetryImages.map((img) => img.ossRetryData?.originalUrl),
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
      const result = await historyService.addHistory(historyData, null);
      historyRecord = result.record;
    }

    let finalStatus = 'completed';
    if (finalSuccessCount === 0) {
      finalStatus = 'failed';
    } else if (finalSuccessCount < totalCount) {
      finalStatus = 'partial';
    }

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

router.post('/', generateUploadFields, async (req, res) => {
  try {
    const { prompt, size, quantity, mode, modelId, imageSize } = req.body;
    const image = req.files?.image?.[0];
    const images = req.files?.images || [];

    if (!prompt) {
      return res.status(400).json({ error: '提示词不能为空' });
    }

    if (mode === 'image-to-image' && !image && images.length === 0) {
      return res.status(400).json({ error: '图生图模式需要上传参考图片' });
    }

    const quantityNum = parseInt(quantity, 10) || 1;
    if (quantityNum < 1 || quantityNum > 8) {
      return res.status(400).json({ error: '生成数量必须在1-8之间' });
    }

    let requiredCredits = 0;
    let modelKey = 'nano-banana';

    if (modelId) {
      try {
        const { aiModelService } = require('../database');
        const model = await aiModelService.getModelById(modelId);
        if (model && model.name) {
          modelKey = model.name;
        }
      } catch (error) {
        console.error('查询模型信息失败:', error);
      }
    }

    try {
      requiredCredits = await modelPricingService.calculatePrice(modelKey, {
        quantity: quantityNum
      });
    } catch (error) {
      console.error('计算价格失败:', error);
      return res.status(400).json({
        error: error.message || '当前模型未配置价格，请联系管理员'
      });
    }

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

    const taskId = Date.now().toString();

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

router.get('/:taskId', async (req, res) => {
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

module.exports = router;
