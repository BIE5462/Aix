const express = require('express');
const router = express.Router();
const { getConnection } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// 保存批量输入历史
router.post('/history', authenticateToken, async (req, res) => {
  try {
    const { name, prompts, source_type = 'manual', source_id = null } = req.body;
    const userId = req.user.id;

    // 验证参数
    if (!name || !prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: '名称和提示词列表不能为空' });
    }

    if (prompts.length === 0 || prompts.length > 10) {
      return res.status(400).json({ error: '提示词数量必须在1-10之间' });
    }

    // 过滤空提示词
    const validPrompts = prompts.filter(p => p && p.trim() !== '');
    if (validPrompts.length === 0) {
      return res.status(400).json({ error: '至少需要一个有效的提示词' });
    }

    const pool = getConnection();

    const [result] = await pool.execute(
      'INSERT INTO batch_prompt_history (user_id, name, prompts, prompt_count, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, JSON.stringify(validPrompts), validPrompts.length, source_type, source_id]
    );

    console.log('[批量输入历史] 保存成功:', {
      id: result.insertId,
      userId,
      name,
      promptCount: validPrompts.length
    });

    res.json({
      success: true,
      data: {
        id: result.insertId,
        name,
        prompt_count: validPrompts.length,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('保存批量输入历史失败:', error);
    res.status(500).json({ error: '保存历史记录失败' });
  }
});

// 获取批量输入历史列表
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;
    const pool = getConnection();

    // 获取历史记录列表
    const [records] = await pool.execute(
      `SELECT id, name, prompt_count, source_type, created_at
       FROM batch_prompt_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`,
      [userId]
    );

    // 获取总数
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM batch_prompt_history WHERE user_id = ?',
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
    console.error('获取批量输入历史列表失败:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

// 获取批量输入历史详情
router.get('/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = getConnection();

    const [records] = await pool.execute(
      'SELECT * FROM batch_prompt_history WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: '历史记录不存在' });
    }

    const record = records[0];

    // 解析JSON字段
    let prompts = [];
    try {
      prompts = typeof record.prompts === 'string'
        ? JSON.parse(record.prompts)
        : record.prompts;
    } catch (error) {
      console.error('解析prompts失败:', error);
    }

    res.json({
      success: true,
      data: {
        id: record.id,
        name: record.name,
        prompts,
        prompt_count: record.prompt_count,
        source_type: record.source_type,
        source_id: record.source_id,
        created_at: record.created_at
      }
    });
  } catch (error) {
    console.error('获取批量输入历史详情失败:', error);
    res.status(500).json({ error: '获取历史详情失败' });
  }
});

// 删除批量输入历史
router.delete('/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = getConnection();

    const [result] = await pool.execute(
      'DELETE FROM batch_prompt_history WHERE id = ? AND user_id = ?',
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
    console.error('删除批量输入历史失败:', error);
    res.status(500).json({ error: '删除历史记录失败' });
  }
});

module.exports = router;
