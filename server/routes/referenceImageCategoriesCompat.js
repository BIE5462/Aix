const express = require('express');

const router = express.Router();

const getService = (req) => req.app.locals.referenceImageService;

router.get('/', async (req, res) => {
  try {
    const categories = await getService(req).listCategories(req.user.id);
    res.json(categories.map(({ id, name, createdAt }) => ({
      id,
      name,
      created_at: createdAt
    })));
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || '获取分类列表失败' });
  }
});

router.post('/', async (req, res) => {
  try {
    const category = await getService(req).createCategory(req.user.id, req.body?.name);
    res.status(201).json({
      id: category.id,
      name: category.name,
      created_at: category.createdAt
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || '创建分类失败' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await getService(req).updateCategory(req.user.id, req.params.id, req.body?.name);
    res.json({ success: true, message: '分类更新成功' });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || '更新分类失败' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await getService(req).deleteCategory(req.user.id, req.params.id);
    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || '删除分类失败' });
  }
});

module.exports = router;
