const express = require('express');
const multer = require('multer');
const path = require('path');
const referenceImageOSS = require('../services/referenceImageOSS');
const userDataService = require('../userDataService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  }
});

const normalizeImage = (image, categoryMap = {}) => {
  const categoryId = image.categoryId ?? image.category_id ?? null;
  const url = image.url || image.oss_url || image.ossUrl || (image.filename ? `/uploads/${image.filename}` : null);
  const thumbnailUrl = image.thumbnailUrl || image.oss_thumbnail_url || image.thumbnail_url || image.ossThumbnailUrl || url;
  const fileSize = image.fileSize ?? image.file_size ?? image.size ?? null;
  const originalName = image.originalName || image.original_name || image.filename || image.name;
  const mimeType = image.mimeType || image.mime_type || null;
  const categoryName = image.categoryName || image.category || categoryMap[categoryId] || null;

  return {
    id: image.id,
    name: image.name || originalName,
    filename: image.filename || null,
    originalName,
    filePath: image.filePath || image.file_path || null,
    fileSize,
    mimeType,
    url,
    thumbnailUrl,
    ossKey: image.ossKey || image.oss_key || null,
    ossThumbnailKey: image.ossThumbnailKey || image.oss_thumbnail_key || null,
    compressedSize: image.compressedSize || image.compressed_size || null,
    categoryId,
    categoryName,
    createdAt: image.createdAt || image.created_at,
    updatedAt: image.updatedAt || image.updated_at,
    isPublic: image.isPublic || false,
    category_id: categoryId,
    category: categoryName,
    ossUrl: url,
    size: fileSize
  };
};

const getUserId = (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: '请先登录'
    });
    return null;
  }

  return userId;
};

const getCategoryMap = async (service, userId) => {
  const categories = await service.listCategories(userId);
  const categoryMap = {};

  for (const category of categories) {
    categoryMap[category.id] = category.name;
  }

  return { categories, categoryMap };
};

const listReferenceImages = async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const since = req.query.since;
    const service = req.app.locals.referenceImageService;
    const rows = await service.getUserReferenceImages(userId);
    const { categoryMap } = await getCategoryMap(service, userId);

    let images = rows.map((row) => normalizeImage(row, categoryMap));
    let deletedIds = [];

    if (since) {
      const sinceDate = new Date(parseInt(since, 10));
      images = images.filter((image) => {
        const createdAt = new Date(image.createdAt);
        const updatedAt = image.updatedAt ? new Date(image.updatedAt) : createdAt;
        return updatedAt > sinceDate || createdAt > sinceDate;
      });
    }

    res.json({
      success: true,
      images,
      deletedIds,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('获取参考图列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取参考图列表失败'
    });
  }
};

const uploadReferenceImages = async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const files = req.files;
    const { categoryId, is_prompt_reference } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要上传的图片' });
    }

    const service = req.app.locals.referenceImageService;

    if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
      await service.ensureCategoryExists(userId, categoryId);
    }

    const validFiles = [];
    const errors = [];

    for (const file of files) {
      if (!referenceImageOSS.isSupportedImageFormat(file.originalname)) {
        errors.push(`${file.originalname}: 不支持的图片格式`);
        continue;
      }

      if (file.size > referenceImageOSS.getMaxFileSize()) {
        errors.push(`${file.originalname}: 文件大小超过10MB限制`);
        continue;
      }

      validFiles.push({
        buffer: file.buffer,
        fileName: file.originalname
      });
    }

    if (validFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有有效的图片文件',
        details: errors
      });
    }

    const uploadResult = await referenceImageOSS.uploadMultipleReferenceImages(validFiles, userId, {
      compress: true,
      maxWidth: 1200,
      quality: 0.85,
      generateThumbnail: true
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: '图片上传失败',
        details: uploadResult.errors
      });
    }

    const savedImages = [];

    for (const result of uploadResult.results) {
      const imageData = {
        filename: result.key.split('/').pop(),
        originalName: result.originalName,
        filePath: result.key,
        fileSize: result.originalSize,
        mimeType: referenceImageOSS.getMimeType(path.extname(result.originalName)),
        ossUrl: result.url,
        ossKey: result.key,
        ossThumbnailUrl: result.thumbnailUrl,
        ossThumbnailKey: result.thumbnailKey,
        compressedSize: result.compressedSize
      };

      const dbResult = await userDataService.referenceImages.addReferenceImage(
        userId,
        imageData,
        categoryId || null,
        is_prompt_reference === '1' ? 1 : 0
      );

      savedImages.push(normalizeImage(dbResult.image));
    }

    res.json({
      success: true,
      message: `成功添加${savedImages.length}张参考图`,
      images: savedImages,
      summary: {
        total: files.length,
        success: savedImages.length,
        failed: errors.length + uploadResult.errors.length,
        errors: [...errors, ...uploadResult.errors.map((item) => item.error)]
      }
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('上传参考图失败:', error);
    res.status(status).json({
      success: false,
      error: error.message || '上传参考图失败'
    });
  }
};

router.get('/', listReferenceImages);
router.get('/list', listReferenceImages);

router.get('/categories', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const categories = await req.app.locals.referenceImageService.listCategories(userId);
    res.json({ success: true, categories: categories.map((category) => category.name) });
  } catch (error) {
    const status = error.status || 500;
    console.error('获取分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '获取分类失败' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const category = await req.app.locals.referenceImageService.createCategory(userId, req.body?.name);
    res.status(201).json({ success: true, category });
  } catch (error) {
    const status = error.status || 500;
    console.error('创建分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '创建分类失败' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const category = await req.app.locals.referenceImageService.updateCategory(userId, req.params.id, req.body?.name);
    res.json({ success: true, category, message: '分类更新成功' });
  } catch (error) {
    const status = error.status || 500;
    console.error('更新分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '更新分类失败' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    await req.app.locals.referenceImageService.deleteCategory(userId, req.params.id);
    res.json({ success: true, message: '分类删除成功' });
  } catch (error) {
    const status = error.status || 500;
    console.error('删除分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '删除分类失败' });
  }
});

router.delete('/batch', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { imageIds } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ success: false, error: '请提供要删除的图片ID列表' });
    }

    const deleteResult = await userDataService.referenceImages.deleteMultipleReferenceImages(userId, imageIds);

    if (deleteResult.ossKeys.length > 0) {
      const allKeys = [...deleteResult.ossKeys, ...deleteResult.ossThumbnailKeys];
      await referenceImageOSS.deleteMultipleReferenceImages(allKeys);
    }

    res.json({
      success: true,
      message: `成功删除${deleteResult.deletedCount}张参考图`,
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('批量删除参考图失败:', error);
    res.status(status).json({ success: false, error: error.message || '批量删除参考图失败' });
  }
});

router.post('/move-to-category', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const result = await req.app.locals.referenceImageService.moveImagesToCategory(
      userId,
      req.body?.imageIds,
      req.body?.categoryId ?? null
    );

    res.json({ success: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    console.error('移动图片到分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '移动图片到分类失败' });
  }
});

router.post('/remove-from-category', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const result = await req.app.locals.referenceImageService.removeImagesFromCategory(userId, req.body?.imageIds);
    res.json({ success: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    console.error('移出分类失败:', error);
    res.status(status).json({ success: false, error: error.message || '移出分类失败' });
  }
});

router.post('/', upload.array('images', 10), uploadReferenceImages);
router.post('/upload', upload.array('images', 10), uploadReferenceImages);

router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const service = req.app.locals.referenceImageService;
    const image = await service.getReferenceImageById(req.params.id, userId);

    if (!image) {
      return res.status(404).json({ success: false, error: '参考图不存在' });
    }

    const { categoryMap } = await getCategoryMap(service, userId);
    res.json({ success: true, data: normalizeImage(image, categoryMap) });
  } catch (error) {
    const status = error.status || 500;
    console.error('获取参考图详情失败:', error);
    res.status(status).json({ success: false, error: error.message || '获取参考图详情失败' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const deleteResult = await userDataService.referenceImages.deleteReferenceImage(userId, req.params.id);

    if (deleteResult.ossKey) {
      try {
        await referenceImageOSS.deleteReferenceImage(deleteResult.ossKey, deleteResult.ossThumbnailKey);
      } catch (ossError) {
        console.warn('OSS文件删除失败，但数据库记录已删除:', ossError.message);
      }
    }

    res.json({ success: true, message: '参考图删除成功' });
  } catch (error) {
    const status = error.message === '参考图不存在或无权限删除' ? 404 : (error.status || 500);
    console.error('删除参考图失败:', error);
    res.status(status).json({ success: false, error: error.message || '删除参考图失败' });
  }
});

module.exports = router;

