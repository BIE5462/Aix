const express = require('express');
const userDataService = require('../userDataService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = '', mode = null } = req.query;
    const result = await userDataService.history.getUserHistory(
      req.user.id,
      page,
      pageSize,
      search,
      mode
    );

    res.json({
      data: result.data,
      total: result.total,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize
    });
  } catch (error) {
    console.error('获取历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await userDataService.history.deleteHistory(req.user.id, id);

    if (success) {
      res.json({ message: '删除成功' });
    } else {
      res.status(404).json({ error: '记录不存在' });
    }
  } catch (error) {
    console.error('删除历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const result = await userDataService.history.clearHistory(req.user.id);
    res.json({
      success: true,
      message: `已清空${result.deletedCount}条历史记录`,
      deletedOss: result.deletedOss
    });
  } catch (error) {
    console.error('清空历史记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
