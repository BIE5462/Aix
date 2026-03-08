const express = require('express');
const { getConnection } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search = '', status = '' } = req.query;
    const pool = getConnection();
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    const params = [];

    if (search) {
      whereClause += ' WHERE (username LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status !== '') {
      whereClause += whereClause ? ' AND is_active = ?' : ' WHERE is_active = ?';
      params.push(status);
    }

    const [users] = await pool.execute(
      `SELECT id, username, email, is_admin, is_active, created_at, last_login_at FROM users${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`,
      params
    );

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );

    const userIds = users.map((user) => user.id);
    const userImageCounts = {};
    const userPromptCounts = {};
    const userCredits = {};

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const [imageCounts] = await pool.execute(
        `SELECT user_id, SUM(quantity) as count FROM history_records WHERE user_id IN (${placeholders}) GROUP BY user_id`,
        userIds
      );
      imageCounts.forEach((item) => { userImageCounts[item.user_id] = item.count; });

      const [promptCounts] = await pool.execute(
        `SELECT user_id, COUNT(*) as count FROM prompts WHERE user_id IN (${placeholders}) GROUP BY user_id`,
        userIds
      );
      promptCounts.forEach((item) => { userPromptCounts[item.user_id] = item.count; });

      const [creditBalances] = await pool.execute(
        `SELECT user_id, balance FROM user_credits WHERE user_id IN (${placeholders})`,
        userIds
      );
      creditBalances.forEach((item) => { userCredits[item.user_id] = parseFloat(item.balance); });
    }

    const usersWithStats = users.map((user) => ({
      ...user,
      imageCount: userImageCounts[user.id] || 0,
      promptCount: userPromptCounts[user.id] || 0,
      credits: userCredits[user.id] || 0,
      is_admin: Boolean(user.is_admin),
      status: Boolean(user.is_active)
    }));

    res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败', details: error.message });
  }
});

router.put('/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }

    const pool = getConnection();
    const [result] = await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [status ? 1 : 0, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({ error: '更新用户状态失败' });
  }
});

router.put('/users/:id/admin', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;

    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ error: '管理员状态值无效' });
    }

    const pool = getConnection();
    const [result] = await pool.execute('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('设置管理员状态失败:', error);
    res.status(500).json({ error: '设置管理员状态失败' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: '不能删除当前登录管理员' });
    }

    const pool = getConnection();
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
});

module.exports = router;
