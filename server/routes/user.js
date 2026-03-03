const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getConnection, aiModelService } = require('../database');
const imageCacheService = require('../services/imageCacheService');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

/**
 * 获取用户的参考图列表
 * GET /api/user/reference-images
 */
router.get('/reference-images', async (req, res) => {
  try {
    const userId = req.user.userId;

    // 先尝试从缓存获取
    const cachedImages = await imageCacheService.getUserReferenceImages(userId);
    if (cachedImages) {
      return res.json({
        success: true,
        data: {
          images: cachedImages
        },
        cached: true
      });
    }

    // 缓存未命中，从数据库查询
    const connection = await getConnection();

    const [images] = await connection.execute(
      'SELECT id, name, url, oss_url, created_at FROM reference_images WHERE user_id = ? AND (is_prompt_reference = 0 OR is_prompt_reference IS NULL) ORDER BY created_at DESC',
      [userId]
    );

    // 处理图片URL，优先使用oss_url
    const processedImages = images.map(img => ({
      ...img,
      url: img.oss_url || img.url
    }));

    // 缓存结果
    await imageCacheService.cacheUserReferenceImages(userId, processedImages);

    res.json({
      success: true,
      data: {
        images: processedImages
      }
    });

  } catch (error) {
    console.error('获取参考图列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 保存参考图
 * POST /api/user/reference-images
 */
router.post('/reference-images', async (req, res) => {
  try {
    const { name, url } = req.body;
    const userId = req.user.userId;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        message: '名称和URL都是必填项'
      });
    }

    const connection = await getConnection();

    const [result] = await connection.execute(
      'INSERT INTO reference_images (user_id, name, url, created_at, is_prompt_reference) VALUES (?, ?, ?, NOW(), ?)',
      [userId, name, url, 0]
    );

    // 清除参考图缓存
    await imageCacheService.clearReferenceImagesCache(userId);

    res.status(201).json({
      success: true,
      message: '参考图保存成功',
      data: {
        id: result.insertId,
        name: name,
        url: url
      }
    });

  } catch (error) {
    console.error('保存参考图错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 删除参考图
 * DELETE /api/user/reference-images/:id
 */
router.delete('/reference-images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const connection = await getConnection();

    const [result] = await connection.execute(
      'DELETE FROM reference_images WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '参考图不存在或无权限删除'
      });
    }

    // 清除参考图缓存
    await imageCacheService.clearReferenceImagesCache(userId);

    res.json({
      success: true,
      message: '参考图删除成功'
    });

  } catch (error) {
    console.error('删除参考图错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取用户的提示词列表
 * GET /api/user/prompts
 */
router.get('/prompts', async (req, res) => {
  try {
    const connection = await getConnection();
    
    const [prompts] = await connection.execute(
      'SELECT id, name, content, created_at FROM prompts WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({
      success: true,
      data: {
        prompts: prompts
      }
    });

  } catch (error) {
    console.error('获取提示词列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 保存提示词
 * POST /api/user/prompts
 */
router.post('/prompts', async (req, res) => {
  try {
    const { name, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: '名称和内容都是必填项'
      });
    }

    const connection = await getConnection();
    
    const [result] = await connection.execute(
      'INSERT INTO prompts (user_id, name, content, created_at) VALUES (?, ?, ?, NOW())',
      [req.user.userId, name, content]
    );

    res.status(201).json({
      success: true,
      message: '提示词保存成功',
      data: {
        id: result.insertId,
        name: name,
        content: content
      }
    });

  } catch (error) {
    console.error('保存提示词错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 更新提示词
 * PUT /api/user/prompts/:id
 */
router.put('/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: '名称和内容都是必填项'
      });
    }

    const connection = await getConnection();
    
    const [result] = await connection.execute(
      'UPDATE prompts SET name = ?, content = ? WHERE id = ? AND user_id = ?',
      [name, content, id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '提示词不存在或无权限修改'
      });
    }

    res.json({
      success: true,
      message: '提示词更新成功'
    });

  } catch (error) {
    console.error('更新提示词错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 删除提示词
 * DELETE /api/user/prompts/:id
 */
router.delete('/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await getConnection();
    
    const [result] = await connection.execute(
      'DELETE FROM prompts WHERE id = ? AND user_id = ?',
      [id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '提示词不存在或无权限删除'
      });
    }

    res.json({
      success: true,
      message: '提示词删除成功'
    });

  } catch (error) {
    console.error('删除提示词错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

/**
 * 获取可用的AI模型列表
 * GET /api/user/models
 */
router.get('/models', async (req, res) => {
  try {
    const models = await aiModelService.getAllModels();

    res.json({
      success: true,
      data: {
        models: models.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          is_default: Boolean(model.is_default),
          provider: model.provider || 'google',
          model_type: model.model_type || 'image',
          supported_modes: model.model_type === 'video' ? 'image-to-video' : 'both'
        }))
      }
    });

  } catch (error) {
    console.error('获取模型列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

module.exports = router;
