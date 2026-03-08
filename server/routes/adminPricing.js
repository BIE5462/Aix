const express = require('express');
const modelPricingService = require('../services/modelPricingService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/model-pricing', requireAdmin, async (req, res) => {
  try {
    const pricingList = await modelPricingService.getAllPricing();
    res.json({ success: true, data: pricingList });
  } catch (error) {
    console.error('获取模型价格列表失败:', error);
    res.status(500).json({ error: '获取模型价格列表失败' });
  }
});

router.get('/model-pricing/:modelKey', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const pricing = await modelPricingService.getPricingByKey(modelKey);

    if (!pricing) {
      return res.status(404).json({ error: '模型价格配置不存在' });
    }

    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error('获取模型价格详情失败:', error);
    res.status(500).json({ error: '获取模型价格详情失败' });
  }
});

router.post('/model-pricing', requireAdmin, async (req, res) => {
  try {
    const pricingData = req.body;
    const result = await modelPricingService.upsertPricing(pricingData);
    res.json({ success: true, data: result, message: '保存成功' });
  } catch (error) {
    console.error('保存模型价格失败:', error);
    res.status(500).json({ error: error.message || '保存模型价格失败' });
  }
});

router.delete('/model-pricing/:modelKey', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const success = await modelPricingService.deletePricing(modelKey);

    if (!success) {
      return res.status(404).json({ error: '模型价格配置不存在' });
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除模型价格失败:', error);
    res.status(500).json({ error: '删除模型价格失败' });
  }
});

router.put('/model-pricing/:modelKey/status', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }

    await modelPricingService.toggleModelStatus(modelKey, is_active);
    res.json({ success: true, message: `模型已${is_active ? '启用' : '禁用'}` });
  } catch (error) {
    console.error('切换模型状态失败:', error);
    res.status(500).json({ error: '切换模型状态失败' });
  }
});

router.post('/model-pricing/calculate', requireAdmin, async (req, res) => {
  try {
    const { model_key, params } = req.body;

    if (!model_key) {
      return res.status(400).json({ error: '模型标识不能为空' });
    }

    const price = await modelPricingService.calculatePrice(model_key, params || {});
    res.json({
      success: true,
      data: {
        model_key,
        params,
        price,
        price_usd: (price * 0.001).toFixed(3)
      }
    });
  } catch (error) {
    console.error('计算价格失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

