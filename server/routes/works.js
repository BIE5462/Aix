const express = require('express');
const router = express.Router();
const worksService = require('../services/worksService');
const { authenticateToken } = require('../middleware/auth');

/**
 * 获取公共作品列表（无需认证）
 * GET /api/works?page=1&pageSize=20&type=image&model=xxx&sort=latest
 */
router.get('/', async (req, res) => {
  try {
    const { page, pageSize, type, model, sort } = req.query;

    const result = await worksService.getPublicWorks(
      { type, model, sort },
      { page, pageSize }
    );

    res.json(result);
  } catch (error) {
    console.error('[GET /api/works] 获取作品列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取作品列表失败'
    });
  }
});

/**
 * 获取作品详情（无需认证）
 * GET /api/works/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await worksService.getWorkDetail(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[GET /api/works/:id] 获取作品详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取作品详情失败'
    });
  }
});

/**
 * 发布作品（需要认证）
 * POST /api/works
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const workData = req.body;

    console.log('[POST /api/works] 发布作品请求:', {
      userId,
      contentType: workData.contentType,
      prompt: workData.prompt?.substring(0, 50)
    });

    const result = await worksService.publishWork(userId, workData);

    console.log('[POST /api/works] 发布成功:', result);
    res.json(result);
  } catch (error) {
    console.error('[POST /api/works] 发布作品失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '发布作品失败'
    });
  }
});

/**
 * 取消发布作品（需要认证）
 * DELETE /api/works/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.unpublishWork(userId, id);

    if (!result.success) {
      return res.status(403).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[DELETE /api/works/:id] 取消发布失败:', error);
    res.status(500).json({
      success: false,
      error: '取消发布失败'
    });
  }
});

/**
 * 永久删除作品（需要认证）
 * DELETE /api/works/:id/permanent
 */
router.delete('/:id/permanent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.deleteWorkPermanently(userId, id);

    if (!result.success) {
      const statusCode = result.message === '作品不存在' ? 404 : 403;
      return res.status(statusCode).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[DELETE /api/works/:id/permanent] 永久删除失败:', error);
    res.status(500).json({
      success: false,
      error: '永久删除失败'
    });
  }
});

/**
 * 增加浏览数（无需认证）
 * POST /api/works/:id/view
 */
router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await worksService.incrementViews(id);

    res.json(result);
  } catch (error) {
    console.error('[POST /api/works/:id/view] 更新浏览数失败:', error);
    res.status(500).json({
      success: false,
      error: '更新浏览数失败'
    });
  }
});

/**
 * 获取用户的所有作品列表（需要认证）
 * GET /api/works/user/my
 */
router.get('/user/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, pageSize } = req.query;

    const result = await worksService.getUserWorks(userId, { page, pageSize });

    res.json(result);
  } catch (error) {
    console.error('[GET /api/works/user/my] 获取用户作品失败:', error);
    res.status(500).json({
      success: false,
      error: '获取用户作品失败'
    });
  }
});

/**
 * 重新上架作品（需要认证）
 * PUT /api/works/:id/publish
 */
router.put('/:id/publish', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.republishWork(userId, id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[PUT /api/works/:id/publish] 重新上架失败:', error);
    res.status(500).json({
      success: false,
      error: '重新上架失败'
    });
  }
});

/**
 * 点赞作品（需要认证）
 * POST /api/works/:id/like
 */
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.likeWork(userId, id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[POST /api/works/:id/like] 点赞失败:', error);
    res.status(500).json({
      success: false,
      error: '点赞失败'
    });
  }
});

/**
 * 取消点赞作品（需要认证）
 * DELETE /api/works/:id/like
 */
router.delete('/:id/like', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.unlikeWork(userId, id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[DELETE /api/works/:id/like] 取消点赞失败:', error);
    res.status(500).json({
      success: false,
      error: '取消点赞失败'
    });
  }
});

/**
 * 检查点赞状态（需要认证）
 * GET /api/works/:id/like-status
 */
router.get('/:id/like-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await worksService.checkLikeStatus(userId, id);

    res.json(result);
  } catch (error) {
    console.error('[GET /api/works/:id/like-status] 检查点赞状态失败:', error);
    res.status(500).json({
      success: false,
      error: '检查点赞状态失败'
    });
  }
});

module.exports = router;

