const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { getConnection } = require('../database');

const router = express.Router();

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码都是必填项'
      });
    }

    // 验证密码强度
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少6位'
      });
    }

    const connection = await getConnection();

    // 检查用户名是否已存在
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 加密密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const [result] = await connection.execute(
      'INSERT INTO users (username, password, email) VALUES (?, ?, NULL)',
      [username, hashedPassword]
    );

    // 生成JWT令牌
    const token = generateToken({
      userId: result.insertId,
      username: username
    });

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        token: token,
        user: {
          id: result.insertId,
          username: username
        }
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码都是必填项'
      });
    }

    const connection = await getConnection();

    // 查找用户
    const [users] = await connection.execute(
      'SELECT id, username, password FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    const user = users[0];

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 生成JWT令牌
    const token = generateToken({
      userId: user.id,
      username: user.username
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token: token,
        user: {
          id: user.id,
          username: user.username
        }
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const connection = await getConnection();
    
    const [users] = await connection.execute(
      'SELECT id, username, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const user = users[0];
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 验证令牌有效性
 * POST /api/auth/verify
 */
router.post('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: '令牌有效',
    data: {
      user: req.user
    }
  });
});

/**
 * 找回密码
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { username, newPassword } = req.body;

    // 验证输入
    if (!username || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '用户名和新密码都是必填项'
      });
    }

    // 验证密码强度
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少6位'
      });
    }

    const connection = await getConnection();

    // 查找用户
    const [users] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 加密新密码
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    await connection.execute(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashedPassword, username]
    );

    res.json({
      success: true,
      message: '密码重置成功'
    });

  } catch (error) {
    console.error('找回密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

module.exports = router;
