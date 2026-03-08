const express = require('express');
const { getConnection } = require('../database');
const creditService = require('../services/creditService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await creditService.getUserBalance(id);
    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('获取用户积分失败:', error);
    res.status(500).json({ error: '获取用户积分失败' });
  }
});

router.post('/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '充值金额必须大于0' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await creditService.adminGrantCredits(
      req.user.id,
      parseInt(id, 10),
      parseFloat(amount),
      description || `管理员充值${amount}弹珠`,
      ipAddress
    );

    res.json({
      success: true,
      message: `成功为用户充值 ${amount} 弹珠`,
      data: {
        balance_before: result.balance_before,
        balance_after: result.balance_after,
        amount: result.amount
      }
    });
  } catch (error) {
    console.error('充值弹珠失败:', error);
    res.status(500).json({ error: error.message || '充值弹珠失败' });
  }
});

router.get('/users/:id/transactions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20, type } = req.query;

    const result = await creditService.getUserTransactions(
      parseInt(id, 10),
      parseInt(page, 10),
      parseInt(pageSize, 10),
      type || null
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.status(500).json({ error: '获取交易记录失败' });
  }
});

router.get('/credits/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await creditService.getCreditStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取积分统计失败:', error);
    res.status(500).json({ error: '获取积分统计失败' });
  }
});

router.get('/credits/user/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const balance = await creditService.getUserBalance(userId);
    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('获取用户积分失败:', error);
    res.status(500).json({ error: '获取用户积分失败' });
  }
});

router.post('/credits/grant', requireAdmin, async (req, res) => {
  try {
    const { user_id, amount, description } = req.body;

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: '用户ID和积分金额必填，且金额必须大于0' });
    }

    const result = await creditService.adminGrantCredits(
      req.user.id,
      user_id,
      parseFloat(amount),
      description || `管理员赠送${amount}弹珠`,
      req.ip
    );

    res.json({
      success: true,
      data: result,
      message: `成功给用户添加${amount}弹珠`
    });
  } catch (error) {
    console.error('添加积分失败:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/credits/transactions/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, pageSize = 20, type } = req.query;

    const result = await creditService.getUserTransactions(
      userId,
      parseInt(page, 10),
      parseInt(pageSize, 10),
      type
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('获取用户交易记录失败:', error);
    res.status(500).json({ error: '获取用户交易记录失败' });
  }
});

router.get('/credits/orders', requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, userId } = req.query;
    const pool = getConnection();
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

    let whereClause = '';
    const params = [];

    if (status) {
      whereClause += whereClause ? ' AND payment_status = ?' : ' WHERE payment_status = ?';
      params.push(status);
    }

    if (userId) {
      whereClause += whereClause ? ' AND o.user_id = ?' : ' WHERE o.user_id = ?';
      params.push(userId);
    }

    const [orders] = await pool.execute(
      `SELECT o.*, u.username, u.email
       FROM recharge_orders o
       LEFT JOIN users u ON o.user_id = u.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`,
      params
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total
       FROM recharge_orders o
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          total: countRows[0].total,
          totalPages: Math.ceil(countRows[0].total / parseInt(pageSize, 10))
        }
      }
    });
  } catch (error) {
    console.error('获取积分订单失败:', error);
    res.status(500).json({ error: '获取积分订单失败' });
  }
});

module.exports = router;

