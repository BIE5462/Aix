const express = require('express');
const router = express.Router();
const { getConnection } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// 获取可用的文本模型列表（用户端）
router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = getConnection();
    const [models] = await pool.execute(
      'SELECT id, display_name, is_default FROM ai_text_models WHERE is_active = TRUE ORDER BY is_default DESC, created_at ASC'
    );

    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('获取文本模型列表失败:', error);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// 获取所有文本模型（管理员）
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const pool = getConnection();
    const [models] = await pool.execute(
      'SELECT * FROM ai_text_models ORDER BY is_default DESC, created_at DESC'
    );

    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('获取所有文本模型失败:', error);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// 添加文本模型（管理员）
router.post('/admin', requireAdmin, async (req, res) => {
  try {
    const {
      display_name,
      model_name,
      api_url,
      api_key,
      role_name,
      role_content,
      is_active = true,
      is_default = false
    } = req.body;

    // 验证必填字段
    if (!display_name || !model_name || !api_url || !api_key || !role_name || !role_content) {
      return res.status(400).json({ error: '所有字段都是必填的' });
    }

    const pool = getConnection();

    // 将布尔值转换为数字
    const isActiveValue = is_active ? 1 : 0;
    const isDefaultValue = is_default ? 1 : 0;

    // 如果设置为默认模型，先取消其他模型的默认状态
    if (is_default) {
      await pool.execute('UPDATE ai_text_models SET is_default = FALSE');
    }

    const [result] = await pool.execute(
      'INSERT INTO ai_text_models (display_name, model_name, api_url, api_key, role_name, role_content, is_active, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [display_name, model_name, api_url, api_key, role_name, role_content, isActiveValue, isDefaultValue]
    );

    res.json({
      success: true,
      data: {
        id: result.insertId,
        display_name,
        model_name,
        api_url,
        role_name,
        is_active: isActiveValue,
        is_default: isDefaultValue
      }
    });
  } catch (error) {
    console.error('添加文本模型失败:', error);
    res.status(500).json({ error: '添加模型失败' });
  }
});

// 更新文本模型（管理员）
router.put('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      display_name,
      model_name,
      api_url,
      api_key,
      role_name,
      role_content,
      is_active,
      is_default
    } = req.body;

    // 验证必填字段
    if (!display_name || !model_name || !api_url || !api_key || !role_name || !role_content) {
      return res.status(400).json({ error: '所有字段都是必填的' });
    }

    const pool = getConnection();

    // 将布尔值转换为数字
    const isActiveValue = is_active ? 1 : 0;
    const isDefaultValue = is_default ? 1 : 0;

    // 如果设置为默认模型，先取消其他模型的默认状态
    if (is_default) {
      await pool.execute('UPDATE ai_text_models SET is_default = FALSE WHERE id != ?', [id]);
    }

    const [result] = await pool.execute(
      'UPDATE ai_text_models SET display_name = ?, model_name = ?, api_url = ?, api_key = ?, role_name = ?, role_content = ?, is_active = ?, is_default = ? WHERE id = ?',
      [display_name, model_name, api_url, api_key, role_name, role_content, isActiveValue, isDefaultValue, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({
      success: true,
      message: '模型更新成功'
    });
  } catch (error) {
    console.error('更新文本模型失败:', error);
    res.status(500).json({ error: '更新模型失败' });
  }
});

// 删除文本模型（管理员）
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();

    // 检查是否是默认模型
    const [models] = await pool.execute('SELECT is_default FROM ai_text_models WHERE id = ?', [id]);
    if (models.length === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }

    if (models[0].is_default) {
      return res.status(400).json({ error: '不能删除默认模型，请先设置其他模型为默认' });
    }

    const [result] = await pool.execute('DELETE FROM ai_text_models WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }

    res.json({
      success: true,
      message: '模型删除成功'
    });
  } catch (error) {
    console.error('删除文本模型失败:', error);
    res.status(500).json({ error: '删除模型失败' });
  }
});

// 设置默认模型（管理员）
router.put('/admin/:id/set-default', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();

    // 检查模型是否存在
    const [models] = await pool.execute('SELECT id FROM ai_text_models WHERE id = ?', [id]);
    if (models.length === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }

    // 取消所有模型的默认状态
    await pool.execute('UPDATE ai_text_models SET is_default = FALSE');

    // 设置指定模型为默认
    await pool.execute('UPDATE ai_text_models SET is_default = TRUE WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '默认模型设置成功'
    });
  } catch (error) {
    console.error('设置默认模型失败:', error);
    res.status(500).json({ error: '设置默认模型失败' });
  }
});

module.exports = router;
