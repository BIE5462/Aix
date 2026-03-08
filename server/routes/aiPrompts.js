const express = require('express');
const router = express.Router();
const { getConnection } = require('../database');
const aiPromptService = require('../services/aiPromptService');
const { authenticateToken } = require('../middleware/auth');

// 生成提示词
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { model_id, user_input, count = 10, conversation_history = [] } = req.body;
    const userId = req.user.id; // 修正：应该是 id 而不是 userId

    // 验证参数
    if (!model_id || !user_input) {
      return res.status(400).json({ error: '模型ID和用户输入不能为空' });
    }

    if (count < 1 || count > 10) {
      return res.status(400).json({ error: '生成数量必须在1-10之间' });
    }

    if (user_input.trim().length === 0) {
      return res.status(400).json({ error: '用户输入不能为空' });
    }

    const pool = getConnection();

    // 获取模型配置
    const [models] = await pool.execute(
      'SELECT * FROM ai_text_models WHERE id = ? AND is_active = TRUE',
      [model_id]
    );

    if (models.length === 0) {
      return res.status(404).json({ error: '模型不存在或未启用' });
    }

    const modelConfig = models[0];

    // 验证模型配置
    aiPromptService.validateModelConfig(modelConfig);

    console.log('[AI提示词生成] 开始生成:', {
      userId,
      modelId: model_id,
      modelName: modelConfig.display_name,
      userInput: user_input,
      count,
      hasConversationHistory: conversation_history.length > 0
    });

    // 调用AI服务生成提示词（传入会话历史）
    const generatedPrompts = await aiPromptService.generatePrompts(
      modelConfig,
      user_input,
      count,
      conversation_history
    );

    // 保存到历史记录
    const [result] = await pool.execute(
      'INSERT INTO ai_prompt_history (user_id, model_id, model_display_name, user_input, generated_prompts, prompt_count) VALUES (?, ?, ?, ?, ?, ?)',
      [
        userId,
        model_id,
        modelConfig.display_name,
        user_input,
        JSON.stringify(generatedPrompts),
        generatedPrompts.length
      ]
    );

    const historyId = result.insertId;

    console.log('[AI提示词生成] 生成成功:', {
      historyId,
      promptCount: generatedPrompts.length
    });

    res.json({
      success: true,
      data: {
        history_id: historyId,
        model_display_name: modelConfig.display_name,
        user_input,
        prompts: generatedPrompts,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[AI提示词生成] 生成失败:', error);
    res.status(500).json({ error: error.message || '生成提示词失败' });
  }
});

// 获取AI生成历史记录列表
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id; // 修正：应该是 id 而不是 userId
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;
    const pool = getConnection();

    // 获取历史记录列表
    const [records] = await pool.execute(
      `SELECT id, model_display_name, user_input, prompt_count, created_at
       FROM ai_prompt_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`,
      [userId]
    );

    // 获取总数
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM ai_prompt_history WHERE user_id = ?',
      [userId]
    );

    res.json({
      success: true,
      data: {
        list: records,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取AI生成历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

// 获取单条AI生成历史详情
router.get('/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // 修正：应该是 id 而不是 userId
    const pool = getConnection();

    const [records] = await pool.execute(
      'SELECT * FROM ai_prompt_history WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: '历史记录不存在' });
    }

    const record = records[0];

    // 解析JSON字段
    let generatedPrompts = [];
    try {
      generatedPrompts = typeof record.generated_prompts === 'string'
        ? JSON.parse(record.generated_prompts)
        : record.generated_prompts;
    } catch (error) {
      console.error('解析generated_prompts失败:', error);
    }

    res.json({
      success: true,
      data: {
        id: record.id,
        model_display_name: record.model_display_name,
        user_input: record.user_input,
        prompts: generatedPrompts,
        prompt_count: record.prompt_count,
        created_at: record.created_at
      }
    });
  } catch (error) {
    console.error('获取AI生成历史详情失败:', error);
    res.status(500).json({ error: '获取历史详情失败' });
  }
});

// 删除AI生成历史记录
router.delete('/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // 修正：应该是 id 而不是 userId
    const pool = getConnection();

    const [result] = await pool.execute(
      'DELETE FROM ai_prompt_history WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '历史记录不存在' });
    }

    res.json({
      success: true,
      message: '历史记录删除成功'
    });
  } catch (error) {
    console.error('删除AI生成历史记录失败:', error);
    res.status(500).json({ error: '删除历史记录失败' });
  }
});

// 获取优化模板列表
router.get('/templates', async (req, res) => {
  try {
    const promptTemplates = require('../services/promptTemplates');
    const templates = promptTemplates.getAllTemplatesMeta();
    const categories = promptTemplates.getCategories();
    res.json({
      success: true,
      data: { templates, categories }
    });
  } catch (error) {
    console.error('获取优化模板失败:', error);
    res.status(500).json({ error: '获取优化模板失败' });
  }
});

// 优化提示词
router.post('/optimize', authenticateToken, async (req, res) => {
  try {
    const { model_id, template_id, original_prompt } = req.body;

    if (!model_id || !template_id || !original_prompt?.trim()) {
      return res.status(400).json({ error: '缺少必要参数: model_id, template_id, original_prompt' });
    }

    const pool = getConnection();
    const [models] = await pool.execute(
      'SELECT * FROM ai_text_models WHERE id = ? AND is_active = TRUE',
      [model_id]
    );

    if (models.length === 0) {
      return res.status(404).json({ error: '模型不存在或未启用' });
    }

    const modelConfig = models[0];
    const optimizedPrompt = await aiPromptService.optimizePrompt(modelConfig, template_id, original_prompt.trim());

    res.json({
      success: true,
      data: { optimized_prompt: optimizedPrompt }
    });
  } catch (error) {
    console.error('[POST /optimize] 优化失败:', error);
    res.status(500).json({ error: error.message || '优化提示词失败' });
  }
});

// 迭代优化提示词
router.post('/iterate', authenticateToken, async (req, res) => {
  try {
    const { model_id, template_id, last_optimized_prompt, iterate_input } = req.body;

    if (!model_id || !template_id || !last_optimized_prompt?.trim() || !iterate_input?.trim()) {
      return res.status(400).json({ error: '缺少必要参数: model_id, template_id, last_optimized_prompt, iterate_input' });
    }

    const pool = getConnection();
    const [models] = await pool.execute(
      'SELECT * FROM ai_text_models WHERE id = ? AND is_active = TRUE',
      [model_id]
    );

    if (models.length === 0) {
      return res.status(404).json({ error: '模型不存在或未启用' });
    }

    const modelConfig = models[0];
    const iteratedPrompt = await aiPromptService.iteratePrompt(
      modelConfig, template_id, last_optimized_prompt.trim(), iterate_input.trim()
    );

    res.json({
      success: true,
      data: { iterated_prompt: iteratedPrompt }
    });
  } catch (error) {
    console.error('[POST /iterate] 迭代失败:', error);
    res.status(500).json({ error: error.message || '迭代优化失败' });
  }
});

module.exports = router;
