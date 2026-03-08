const express = require('express');
const { getConnection } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/generations', requireAdmin, async (req, res) => {
  try {
    const { search = '', userId = '' } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;

    if (page < 1 || pageSize < 1) {
      return res.status(400).json({ error: '分页参数无效' });
    }

    const offset = (page - 1) * pageSize;
    const pool = getConnection();
    let whereClause = '';
    const params = [];

    if (search) {
      whereClause += ' WHERE h.prompt LIKE ?';
      params.push(`%${search}%`);
    }

    if (userId) {
      whereClause += whereClause ? ' AND h.user_id = ?' : ' WHERE h.user_id = ?';
      params.push(userId);
    }

    const [records] = await pool.execute(
      `SELECT h.*, u.username, u.email
       FROM history_records h
       LEFT JOIN users u ON h.user_id = u.id
       ${whereClause}
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize.toString(), offset.toString()]
    );

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM history_records h ${whereClause}`,
      params
    );

    const recordsWithImages = records.map((record) => {
      let generatedImages = [];
      try {
        if (record.generated_images) {
          generatedImages = typeof record.generated_images === 'string'
            ? JSON.parse(record.generated_images)
            : record.generated_images;
        }
      } catch (error) {
        console.error('解析generated_images失败:', error);
      }

      return {
        id: record.id,
        prompt: record.prompt,
        mode: record.mode,
        size: record.size,
        quantity: record.quantity,
        referenceImage: record.reference_image,
        generatedImages,
        username: record.username || '匿名用户',
        email: record.email,
        userId: record.user_id,
        createdAt: record.created_at
      };
    });

    res.json({
      success: true,
      records: recordsWithImages,
      pagination: {
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取生成内容失败:', error);
    res.status(500).json({ error: '获取生成内容失败' });
  }
});

router.delete('/generations/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();
    const [result] = await pool.execute('DELETE FROM history_records WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('删除生成记录失败:', error);
    res.status(500).json({ error: '删除生成记录失败' });
  }
});

module.exports = router;
