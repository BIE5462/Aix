const express = require('express');
const { getConnection } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/prompts', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.query;
    const pool = getConnection();

    let query = 'SELECT p.id, p.name, p.content, p.tags, p.user_id, p.created_at, p.updated_at, u.username FROM prompts p LEFT JOIN users u ON p.user_id = u.id';
    const params = [];

    if (userId) {
      query += ' WHERE p.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY p.created_at DESC';

    const [prompts] = await pool.execute(query, params);

    res.json({
      success: true,
      prompts: prompts.map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        content: prompt.content,
        category: prompt.tags || '未分类',
        userId: prompt.user_id,
        username: prompt.username,
        usage_count: 0,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at
      }))
    });
  } catch (error) {
    console.error('获取提示词失败:', error);
    res.status(500).json({ error: '获取提示词失败' });
  }
});

router.post('/prompts', requireAdmin, async (req, res) => {
  try {
    const { name, content, category } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: '名称和内容不能为空' });
    }

    const pool = getConnection();
    const [result] = await pool.execute(
      'INSERT INTO prompts (name, content, tags, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [name, content, category || '未分类', req.user.id]
    );

    res.json({
      success: true,
      prompt: {
        id: result.insertId,
        name,
        content,
        category: category || '未分类',
        usage_count: 0
      }
    });
  } catch (error) {
    console.error('添加提示词失败:', error);
    res.status(500).json({ error: '添加提示词失败' });
  }
});

router.put('/prompts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content, category } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: '名称和内容不能为空' });
    }

    const pool = getConnection();
    const [result] = await pool.execute(
      'UPDATE prompts SET name = ?, content = ?, tags = ?, updated_at = NOW() WHERE id = ?',
      [name, content, category || '未分类', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '提示词不存在' });
    }

    res.json({
      success: true,
      prompt: {
        id: parseInt(id, 10),
        name,
        content,
        category: category || '未分类'
      }
    });
  } catch (error) {
    console.error('更新提示词失败:', error);
    res.status(500).json({ error: '更新提示词失败' });
  }
});

router.delete('/prompts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();
    const [result] = await pool.execute('DELETE FROM prompts WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '提示词不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('删除提示词失败:', error);
    res.status(500).json({ error: '删除提示词失败' });
  }
});

router.get('/reference-images', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.query;
    const pool = getConnection();

    let query = `
      SELECT DISTINCT
        r.id,
        r.filename,
        r.original_name,
        r.file_path,
        r.file_size,
        r.mime_type,
        r.oss_url,
        r.oss_thumbnail_url,
        r.user_id,
        r.name,
        r.is_prompt_reference,
        r.created_at,
        u.username,
        COUNT(p.id) as usage_count
      FROM reference_images r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN prompts p ON r.id = p.reference_image_id
    `;

    const params = [];

    if (userId) {
      query += ' WHERE r.user_id = ?';
      params.push(userId);
    }

    query += ' GROUP BY r.id ORDER BY r.created_at DESC';

    const [allImages] = await pool.execute(query, params);

    const formattedImages = allImages.map((image) => ({
      id: image.id,
      name: image.name || image.original_name || image.filename,
      url: image.oss_url || `/uploads/${image.filename}`,
      thumbnailUrl: image.oss_thumbnail_url,
      fileSize: image.file_size,
      mimeType: image.mime_type,
      userId: image.user_id,
      username: image.username,
      isPromptReference: image.is_prompt_reference,
      usageCount: image.usage_count,
      createdAt: image.created_at,
      source: 'reference_images'
    }));

    res.json({ success: true, data: formattedImages, total: formattedImages.length });
  } catch (error) {
    console.error('获取参考图片失败:', error);
    res.status(500).json({ error: '获取参考图片失败' });
  }
});

router.post('/reference-images', requireAdmin, async (req, res) => {
  try {
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: '名称和URL不能为空' });
    }

    const pool = getConnection();
    const [result] = await pool.execute(
      'INSERT INTO reference_images (name, url, filename, original_name, file_path, oss_url, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [name, url, name, name, url, url, req.user.id]
    );

    res.json({
      success: true,
      image: {
        id: result.insertId,
        name,
        url
      }
    });
  } catch (error) {
    console.error('添加参考图片失败:', error);
    res.status(500).json({ error: '添加参考图片失败' });
  }
});

router.put('/reference-images/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: '名称和URL不能为空' });
    }

    const pool = getConnection();
    const [result] = await pool.execute(
      'UPDATE reference_images SET name = ?, url = ?, original_name = ?, file_path = ?, oss_url = ?, updated_at = NOW() WHERE id = ?',
      [name, url, name, url, url, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '参考图片不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('更新参考图片失败:', error);
    res.status(500).json({ error: '更新参考图片失败' });
  }
});

router.delete('/reference-images/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();
    const [result] = await pool.execute('DELETE FROM reference_images WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '参考图片不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('删除参考图片失败:', error);
    res.status(500).json({ error: '删除参考图片失败' });
  }
});

module.exports = router;
