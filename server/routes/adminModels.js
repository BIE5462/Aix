const express = require('express');
const { aiModelService } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/models', requireAdmin, async (req, res) => {
  try {
    const { type = 'all' } = req.query;
    let models = [];

    if (type === 'all' || type === 'image') {
      const imageModels = await aiModelService.getAllModels();
      models = models.concat(imageModels.map((model) => ({ ...model, model_type: model.model_type || 'image' })));
    }

    res.json({ success: true, models });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

router.post('/models', requireAdmin, async (req, res) => {
  try {
    const { name, description, api_key, base_url, is_default, is_active, provider, model_type } = req.body;

    if (!name || !api_key || !base_url) {
      return res.status(400).json({ error: '模型名称、API Key 和 Base URL 不能为空' });
    }

    const id = await aiModelService.addModel({
      name,
      description: description ?? null,
      api_key,
      base_url,
      is_default,
      is_active,
      provider,
      model_type
    });

    res.json({ success: true, id });
  } catch (error) {
    console.error('添加模型失败:', error);
    res.status(500).json({ error: error.message || '添加模型失败' });
  }
});

router.put('/models/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, api_key, base_url, is_default, is_active, provider, model_type } = req.body;

    if (!name || !api_key || !base_url) {
      return res.status(400).json({ error: '模型名称、API Key 和 Base URL 不能为空' });
    }

    const success = await aiModelService.updateModel(id, {
      name,
      description: description ?? null,
      api_key,
      base_url,
      is_default,
      is_active,
      provider,
      model_type
    });

    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('更新模型失败:', error);
    res.status(500).json({ error: error.message || '更新模型失败' });
  }
});

router.put('/models/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }

    const success = await aiModelService.updateModel(id, { is_active });
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('切换模型状态失败:', error);
    res.status(500).json({ error: error.message || '切换模型状态失败' });
  }
});

router.put('/models/:id/default', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const success = await aiModelService.updateModel(id, { is_default: true });
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('设置默认模型失败:', error);
    res.status(500).json({ error: error.message || '设置默认模型失败' });
  }
});

router.delete('/models/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const model = await aiModelService.getModelById(id);
    if (!model) {
      return res.status(404).json({ error: '模型不存在' });
    }

    if (model.is_default) {
      return res.status(400).json({ error: '不能删除默认模型' });
    }

    const success = await aiModelService.deleteModel(id);
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('删除模型失败:', error);
    res.status(500).json({ error: error.message || '删除模型失败' });
  }
});

module.exports = router;
