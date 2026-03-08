const express = require('express');
const { getConnection } = require('../database');
const authService = require('../authService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const pool = getConnection();
    const [users] = await pool.execute(
      'SELECT id, username, email, is_admin, is_active, created_at, updated_at, password_hash, password FROM users WHERE username = ? AND is_admin = 1',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '管理员账户不存在' });
    }

    const user = users[0];
    const storedPasswordHash = user.password_hash || user.password;
    const isValidPassword = await authService.comparePassword(password, storedPasswordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ error: '账户已被禁用' });
    }

    try {
      await pool.execute('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    } catch (error) {
      console.log('更新时间更新失败:', error.message);
    }

    const token = authService.generateToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('管理员登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const pool = getConnection();

    const [totalUsers] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [newUsers] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    const [totalImages] = await pool.execute('SELECT SUM(quantity) as count FROM history_records');
    const [todayImages] = await pool.execute('SELECT SUM(quantity) as count FROM history_records WHERE DATE(created_at) = CURDATE()');
    const [activeUsers] = await pool.execute('SELECT COUNT(DISTINCT user_id) as count FROM history_records WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND user_id IS NOT NULL');
    const [adminCount] = await pool.execute('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers[0].count,
        newUsers: newUsers[0].count,
        totalImages: totalImages[0].count || 0,
        todayImages: todayImages[0].count || 0,
        activeUsers: activeUsers[0].count,
        adminCount: adminCount[0].count
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

module.exports = router;
