const express = require('express');
const router = express.Router();
const { getConnection, aiModelService } = require('../database');
const authService = require('../authService');
const creditService = require('../services/creditService');
const modelPricingService = require('../services/modelPricingService');

// 管理员认证中间件
const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }
    
    const result = await authService.verifyToken(token);
    
    // 检查是否为管理员
    if (!result.user.is_admin) {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    
    req.user = result.user;
    next();
  } catch (error) {
    return res.status(403).json({ error: '无效的访问令牌' });
  }
};

// 管理员登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    const pool = getConnection();
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? AND is_admin = 1',
      [username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: '管理员账户不存在' });
    }
    
    const user = users[0];
    
    // 验证密码
    const isValidPassword = await authService.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }
    
    // 检查用户状态
    if (user.is_active === 0) {
      return res.status(403).json({ error: '账户已被禁用' });
    }
    
    // 更新最后登录时间（如果字段存在）
    try {
      await pool.execute(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );
    } catch (error) {
      // 忽略更新时间更新错误
      console.log('更新时间更新失败:', error.message);
    }
    
    // 生成JWT令牌
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

// 获取系统统计数据
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const pool = getConnection();
    
    // 获取总用户数
    const [totalUsers] = await pool.execute('SELECT COUNT(*) as count FROM users');
    
    // 获取新增用户数（最近30天）
    const [newUsers] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
    
    // 获取总生成图片数
    const [totalImages] = await pool.execute(
      'SELECT SUM(quantity) as count FROM history_records'
    );
    
    // 获取今日生成图片数
    const [todayImages] = await pool.execute(
      'SELECT SUM(quantity) as count FROM history_records WHERE DATE(created_at) = CURDATE()'
    );
    
    // 获取活跃用户数（最近7天有生成记录）
    const [activeUsers] = await pool.execute(
      'SELECT COUNT(DISTINCT user_id) as count FROM history_records WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND user_id IS NOT NULL'
    );
    
    // 获取管理员数量
    const [adminCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE is_admin = 1'
    );
    
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

// 获取用户列表
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, search = '', status = '' } = req.query;
    const pool = getConnection();
    
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    let params = [];
    
    if (search) {
      whereClause += ' WHERE (username LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status !== '') {
      if (whereClause) {
        whereClause += ' AND is_active = ?';
      } else {
        whereClause = ' WHERE is_active = ?';
      }
      params.push(status);
    }
    
    // 获取用户列表
    const [users] = await pool.execute(
      `SELECT id, username, email, is_admin, is_active, created_at, last_login_at FROM users${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(pageSize)} OFFSET ${offset}`,
      params
    );
    
    // 获取总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    
    // 获取每个用户的生成图片数量、提示词数量和积分余额
    const userIds = users.map(user => user.id);
    let userImageCounts = {};
    let userPromptCounts = {};
    let userCredits = {};

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');

      // 获取生成图片数量
      const [imageCounts] = await pool.execute(
        `SELECT user_id, SUM(quantity) as count FROM history_records WHERE user_id IN (${placeholders}) GROUP BY user_id`,
        userIds
      );

      imageCounts.forEach(item => {
        userImageCounts[item.user_id] = item.count;
      });

      // 获取提示词数量
      const [promptCounts] = await pool.execute(
        `SELECT user_id, COUNT(*) as count FROM prompts WHERE user_id IN (${placeholders}) GROUP BY user_id`,
        userIds
      );

      promptCounts.forEach(item => {
        userPromptCounts[item.user_id] = item.count;
      });

      // 获取用户积分余额
      const [creditBalances] = await pool.execute(
        `SELECT user_id, balance FROM user_credits WHERE user_id IN (${placeholders})`,
        userIds
      );

      creditBalances.forEach(item => {
        userCredits[item.user_id] = parseFloat(item.balance);
      });
    }

    const usersWithStats = users.map(user => ({
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
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败', details: error.message });
  }
});

// 更新用户状态
router.put('/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }
    
    const pool = getConnection();
    const [result] = await pool.execute(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [status ? 1 : 0, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({ error: '更新用户状态失败' });
  }
});

// 设置/取消管理员
router.put('/users/:id/admin', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;
    
    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ error: '管理员状态值无效' });
    }
    
    const pool = getConnection();
    const [result] = await pool.execute(
      'UPDATE users SET is_admin = ? WHERE id = ?',
      [is_admin ? 1 : 0, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('设置管理员状态失败:', error);
    res.status(500).json({ error: '设置管理员状态失败' });
  }
});

// 删除用户
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 不能删除自己
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: '不能删除自己的账户' });
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

// 获取用户积分余额
router.get('/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const balance = await creditService.getUserBalance(id);
    
    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('获取用户积分失败:', error);
    res.status(500).json({ error: '获取用户积分失败' });
  }
});

// 给用户充值弹珠
router.post('/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '充值金额必须大于0' });
    }
    
    // 获取管理员IP
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // 调用积分服务进行充值
    const result = await creditService.adminGrantCredits(
      req.user.id,
      parseInt(id),
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

// 获取用户积分交易记录
router.get('/users/:id/transactions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20, type } = req.query;
    
    const result = await creditService.getUserTransactions(
      parseInt(id),
      parseInt(page),
      parseInt(pageSize),
      type || null
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.status(500).json({ error: '获取交易记录失败' });
  }
});

// 获取生成内容列表
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
    let params = [];
    
    if (search) {
      whereClause += ' WHERE h.prompt LIKE ?';
      params.push(`%${search}%`);
    }
    
    if (userId) {
      if (whereClause) {
        whereClause += ' AND h.user_id = ?';
      } else {
        whereClause = ' WHERE h.user_id = ?';
      }
      params.push(userId);
    }
    
    // 获取生成记录列表
    const [records] = await pool.execute(
      `SELECT h.*, u.username, u.email 
       FROM history_records h 
       LEFT JOIN users u ON h.user_id = u.id 
       ${whereClause}
       ORDER BY h.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, pageSize.toString(), offset.toString()]
    );
    
    // 获取总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM history_records h ${whereClause}`,
      params
    );
    
    // 解析生成图片数据
    const recordsWithImages = records.map(record => {
      let generatedImages = [];
      try {
        if (record.generated_images) {
          generatedImages = typeof record.generated_images === 'string' 
            ? JSON.parse(record.generated_images) 
            : record.generated_images;
        }
      } catch (error) {
        console.error('解析generated_images失败:', error);
        generatedImages = [];
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
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取生成内容失败:', error);
    res.status(500).json({ error: '获取生成内容失败' });
  }
});

// 删除生成记录
router.delete('/generations/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getConnection();
    
    const [result] = await pool.execute(
      'DELETE FROM history_records WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('删除生成记录失败:', error);
    res.status(500).json({ error: '删除生成记录失败' });
  }
});

// ==================== 模型管理接口 ====================

// 获取模型列表
router.get('/models', requireAdmin, async (req, res) => {
  try {
    const { type = 'all' } = req.query; // 支持按类型筛选: all, image
    
    let models = [];
    
    if (type === 'all' || type === 'image') {
      const imageModels = await aiModelService.getAllModels();
      models = models.concat(imageModels.map(model => ({
        ...model,
        model_type: model.model_type || 'image'
      })));
    }
    
    
    // 按类型和默认状态排序
    models.sort((a, b) => {
      if (a.model_type !== b.model_type) {
        return a.model_type.localeCompare(b.model_type);
      }
      if (a.is_default !== b.is_default) {
        return b.is_default - a.is_default;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    res.json({
      success: true,
      models: models.map(model => ({
        ...model,
        is_active: Boolean(model.is_active),
        is_default: Boolean(model.is_default)
      }))
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// 添加模型
router.post('/models', requireAdmin, async (req, res) => {
  try {
    const { name, provider, api_key, base_url, description, is_active, is_default, model_type = 'image' } = req.body;
    
    if (!name || !api_key || !base_url) {
      return res.status(400).json({ error: '模型名称、API密钥和API地址不能为空' });
    }
    
    if (model_type !== 'image') {
      return res.status(400).json({ error: '模型类型必须是image' });
    }
    
    const modelData = {
      name,
      provider: provider || 'default',
      api_key,
      base_url,
      description: description || '',
      is_active: is_active !== false,
      is_default: is_default === true,
      model_type
    };
    
    let modelId;
    
    modelId = await aiModelService.addModel(modelData);
    
    res.json({
      success: true,
      modelId
    });
  } catch (error) {
    console.error('添加模型失败:', error);
    res.status(500).json({ error: '添加模型失败' });
  }
});

// 更新模型
router.put('/models/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, provider, api_key, base_url, description, is_active, is_default, model_type = 'image' } = req.body;
    
    if (!name || !api_key || !base_url) {
      return res.status(400).json({ error: '模型名称、API密钥和API地址不能为空' });
    }
    
    if (model_type !== 'image') {
      return res.status(400).json({ error: '模型类型必须是image' });
    }
    
    const modelData = {
      name,
      provider: provider || 'default',
      api_key,
      base_url,
      description: description || '',
      is_active: is_active !== false,
      is_default: is_default === true,
      model_type
    };
    
    let success;
    
    success = await aiModelService.updateModel(id, modelData);
    
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('更新模型失败:', error);
    res.status(500).json({ error: '更新模型失败' });
  }
});

// 切换模型状态
router.put('/models/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, model_type } = req.body;
    
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }
    
    if (!['image', 'video'].includes(model_type)) {
      return res.status(400).json({ error: '模型类型无效' });
    }
    
    let success;
    
    success = await aiModelService.updateModel(id, { is_active });
    
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('切换模型状态失败:', error);
    res.status(500).json({ error: '切换模型状态失败' });
  }
});

// 设置默认模型
router.put('/models/:id/default', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { model_type } = req.body;
    
    if (!['image', 'video'].includes(model_type)) {
      return res.status(400).json({ error: '模型类型无效' });
    }
    
    let success;
    
    success = await aiModelService.updateModel(id, { is_default: true });
    
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('设置默认模型失败:', error);
    res.status(500).json({ error: '设置默认模型失败' });
  }
});

// 删除模型
router.delete('/models/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { model_type } = req.body;
    
    if (!['image', 'video'].includes(model_type)) {
      return res.status(400).json({ error: '模型类型无效' });
    }
    
    // 检查是否为默认模型
    let model;
    model = await aiModelService.getModelById(id);
    
    if (!model) {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    if (model.is_default) {
      return res.status(400).json({ error: '不能删除默认模型' });
    }
    
    let success;
    success = await aiModelService.deleteModel(id);
    
    if (!success) {
      return res.status(404).json({ error: '模型不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('删除模型失败:', error);
    res.status(500).json({ error: '删除模型失败' });
  }
});

// ==================== 用户管理接口 ====================

// 获取所有用户列表（管理员）
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const pool = getConnection();
    const [users] = await pool.execute(
      'SELECT id, username, email, created_at, is_admin FROM users ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        isAdmin: user.is_admin
      }))
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// ==================== 提示词管理接口 ====================

// 获取所有提示词（管理员）
router.get('/prompts', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.query; // 支持按用户ID筛选
    const pool = getConnection();
    
    let query = 'SELECT p.id, p.name, p.content, p.tags, p.user_id, p.created_at, p.updated_at, u.username FROM prompts p LEFT JOIN users u ON p.user_id = u.id';
    let params = [];
    
    if (userId) {
      query += ' WHERE p.user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    const [prompts] = await pool.execute(query, params);
    
    res.json({
      success: true,
      prompts: prompts.map(prompt => ({
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

// 添加提示词（管理员）
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

// 更新提示词（管理员）
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
        id: parseInt(id),
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

// 删除提示词（管理员）
router.delete('/prompts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const pool = getConnection();
    const [result] = await pool.execute(
      'DELETE FROM prompts WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '提示词不存在' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('删除提示词失败:', error);
    res.status(500).json({ error: '删除提示词失败' });
  }
});

// ==================== 参考图片管理接口 ====================

// 获取所有参考图片（管理员）
router.get('/reference-images', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.query; // 支持按用户ID筛选
    const pool = getConnection();
    
    // 统一从reference_images表获取所有参考图片，通过外键关联
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
    
    let params = [];
    
    if (userId) {
      query += ' WHERE r.user_id = ?';
      params.push(userId);
    }
    
    query += ' GROUP BY r.id ORDER BY r.created_at DESC';
    
    const [allImages] = await pool.execute(query, params);
    
    // 格式化返回数据
    const formattedImages = allImages.map(image => ({
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
    
    res.json({
      success: true,
      data: formattedImages,
      total: formattedImages.length
    });
  } catch (error) {
    console.error('获取参考图片失败:', error);
    res.status(500).json({ error: '获取参考图片失败' });
  }
});

// 添加参考图片（管理员）
router.post('/reference-images', requireAdmin, async (req, res) => {
  try {
    const { name, url } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: '名称和URL不能为空' });
    }
    
    const pool = getConnection();
    const [result] = await pool.execute(
      'INSERT INTO reference_images (filename, original_name, file_path, oss_url, user_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [name, name, url, url, req.user.id]
    );
    
    res.json({
      success: true,
      image: {
        id: result.insertId,
        name: name,
        url: url
      }
    });
  } catch (error) {
    console.error('添加参考图片失败:', error);
    res.status(500).json({ error: '添加参考图片失败' });
  }
});

// 更新参考图片（管理员）
router.put('/reference-images/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: '名称和URL不能为空' });
    }
    
    const pool = getConnection();
    const [result] = await pool.execute(
      'UPDATE reference_images SET original_name = ?, oss_url = ?, updated_at = NOW() WHERE id = ?',
      [name, url, id]
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

// 删除参考图片（管理员）
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

// ==================== 积分管理接口 ====================

// 获取积分系统统计
router.get('/credits/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await creditService.getCreditStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取积分统计失败:', error);
    res.status(500).json({ error: '获取积分统计失败' });
  }
});

// 获取用户积分详情（管理员查看指定用户）
router.get('/credits/user/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const balance = await creditService.getUserBalance(userId);
    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('获取用户积分失败:', error);
    res.status(500).json({ error: '获取用户积分失败' });
  }
});

// 管理员给用户添加积分
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

// 获取用户交易记录（管理员查看指定用户）
router.get('/credits/transactions/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, pageSize = 20, type } = req.query;

    const result = await creditService.getUserTransactions(
      userId,
      parseInt(page),
      parseInt(pageSize),
      type
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.status(500).json({ error: '获取交易记录失败' });
  }
});

// 获取所有充值订单（管理员）
router.get('/credits/orders', requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, userId } = req.query;
    const pool = getConnection();

    let whereClause = [];
    let params = [];

    if (status) {
      whereClause.push('payment_status = ?');
      params.push(status);
    }

    if (userId) {
      whereClause.push('user_id = ?');
      params.push(userId);
    }

    const whereSql = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';
    const offset = (page - 1) * pageSize;

    // 获取总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM recharge_orders ${whereSql}`,
      params
    );

    // 获取订单列表
    params.push(parseInt(pageSize), offset);
    const [orders] = await pool.execute(
      `SELECT r.*, u.username, u.email
       FROM recharge_orders r
       LEFT JOIN users u ON r.user_id = u.id
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          amount: parseFloat(order.amount),
          credits: parseFloat(order.credits)
        })),
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(countResult[0].total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取充值订单失败:', error);
    res.status(500).json({ error: '获取充值订单失败' });
  }
});

// ==================== 模型价格管理接口 ====================

// 获取所有模型价格配置
router.get('/model-pricing', requireAdmin, async (req, res) => {
  try {
    const { model_type, is_active } = req.query;

    const pricing = await modelPricingService.getAllPricing(
      model_type || null,
      is_active !== undefined ? is_active === 'true' : null
    );

    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    console.error('获取模型价格失败:', error);
    res.status(500).json({ error: '获取模型价格失败' });
  }
});

// 获取单个模型价格配置
router.get('/model-pricing/:modelKey', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const pricing = await modelPricingService.getPricingByKey(modelKey);

    if (!pricing) {
      return res.status(404).json({ error: '模型价格配置不存在' });
    }

    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    console.error('获取模型价格失败:', error);
    res.status(500).json({ error: '获取模型价格失败' });
  }
});

// 创建或更新模型价格配置
router.post('/model-pricing', requireAdmin, async (req, res) => {
  try {
    const result = await modelPricingService.upsertPricing(req.body);

    res.json({
      success: true,
      data: result,
      message: '模型价格配置成功'
    });
  } catch (error) {
    console.error('配置模型价格失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除模型价格配置
router.delete('/model-pricing/:modelKey', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const success = await modelPricingService.deletePricing(modelKey);

    if (!success) {
      return res.status(404).json({ error: '模型价格配置不存在' });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除模型价格失败:', error);
    res.status(500).json({ error: '删除模型价格失败' });
  }
});

// 启用/禁用模型价格
router.put('/model-pricing/:modelKey/status', requireAdmin, async (req, res) => {
  try {
    const { modelKey } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: '状态值无效' });
    }

    await modelPricingService.toggleModelStatus(modelKey, is_active);

    res.json({
      success: true,
      message: `模型已${is_active ? '启用' : '禁用'}`
    });
  } catch (error) {
    console.error('切换模型状态失败:', error);
    res.status(500).json({ error: '切换模型状态失败' });
  }
});

// 计算价格（测试接口）
router.post('/model-pricing/calculate', requireAdmin, async (req, res) => {
  try {
    const { model_key, params } = req.body;

    if (!model_key) {
      return res.status(400).json({ error: '模型标识不能为空' });
    }

    const price = await modelPricingService.calculatePrice(model_key, params || {});

    res.json({
      success: true,
      data: {
        model_key,
        params,
        price,
        price_usd: (price * 0.001).toFixed(3)
      }
    });
  } catch (error) {
    console.error('计算价格失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
