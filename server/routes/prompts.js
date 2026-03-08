const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getPool } = require('../db');
const ossManager = require('../utils/ossManager');
const { authenticateToken } = require('../middleware/auth');
const imageCacheService = require('../services/imageCacheService');

// 配置multer用于处理文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

const db = getPool();

/**
 * 获取用户的提示词列表
 * GET /api/prompts
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '用户ID缺失'
      });
    }

    // 先尝试从缓存获取
    const cachedPrompts = await imageCacheService.getUserCommonPrompts(userId);
    if (cachedPrompts) {
      return res.json({
        success: true,
        data: cachedPrompts,
        cached: true
      });
    }

    // 缓存未命中，从数据库查询
    const connection = db;

    const [rows] = await connection.execute(
      `SELECT p.id, p.user_id, p.name as title, p.content, p.created_at, p.updated_at,
              p.tags, p.selected_common_prompts, p.selected_reference_images,
              p.generation_mode, p.image_size, p.generate_quantity, p.model_id,
              p.reference_image_id, p.cover_image_url,
              COALESCE(ri.oss_url, ri.url, p.reference_image_url) as reference_image_url,
              ri.name as reference_image_name,
              m.name as model_name, m.description as model_description
       FROM prompts p
       LEFT JOIN reference_images ri ON p.reference_image_id = ri.id
       LEFT JOIN ai_models m ON p.model_id = m.id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );

    // 缓存结果
    await imageCacheService.cacheUserCommonPrompts(userId, rows);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取提示词列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取提示词列表失败'
    });
  }
});

/**
 * 创建新的提示词
 * POST /api/prompts
 */
router.post('/', authenticateToken, upload.single('referenceImage'), async (req, res) => {
  try {
    const {
      title,
      content,
      referenceImageUrl,
      coverImageUrl,
      tags,
      selectedCommonPrompts,
      selectedReferenceImages,
      generationMode,
      imageSize,
      generateQuantity,
      modelId
    } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      });
    }

    let referenceImageId = null;

    // 如果有上传的图片文件，上传到OSS并保存到reference_images表
    if (req.file) {
      try {
        // 压缩图片
        const compressionResult = await ossManager.compressImage(req.file.buffer);
        
        // 上传到OSS
        const uploadResult = await ossManager.uploadImage(
          compressionResult.buffer,
          req.file.originalname,
          userId.toString()
        );
        
        // 保存图片信息到reference_images表
        const connection = db;
        const [imageResult] = await connection.execute(
          'INSERT INTO reference_images (user_id, name, url, filename, original_name, file_path, file_size, mime_type, oss_url, oss_key, is_prompt_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            userId,
            req.file.originalname,
            uploadResult.url,
            req.file.originalname,
            req.file.originalname,
            uploadResult.url, // 使用OSS URL作为file_path
            req.file.size,
            req.file.mimetype,
            uploadResult.url,
            uploadResult.key,
            1 // is_prompt_reference: 标记这是提示词卡片的参考图，不是常用参考图
          ]
        );
        referenceImageId = imageResult.insertId;
      } catch (uploadError) {
        console.error('图片上传失败:', uploadError);
        return res.status(500).json({
          success: false,
          message: '图片上传失败'
        });
      }
    }
    // 如果有OSS URL（通过前端上传到OSS后传递的URL），直接保存到reference_images表
    else if (referenceImageUrl) {
      try {
        const connection = db;
        const [imageResult] = await connection.execute(
          'INSERT INTO reference_images (user_id, name, url, filename, original_name, file_path, file_size, mime_type, oss_url, is_prompt_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            userId,
            'reference_image',
            referenceImageUrl,
            'reference_image',
            'reference_image',
            referenceImageUrl,
            0, // file_size
            'image/jpeg', // mime_type
            referenceImageUrl,
            1 // is_prompt_reference: 标记这是提示词卡片的参考图，不是常用参考图
          ]
        );
        referenceImageId = imageResult.insertId;
      } catch (urlError) {
        console.error('保存OSS URL失败:', urlError);
        return res.status(500).json({
          success: false,
          message: '保存图片URL失败'
        });
      }
    }

    const connection = db;

    // 插入提示词记录，优先使用reference_image_id
    const [result] = await connection.execute(
      'INSERT INTO prompts (user_id, name, content, reference_image_id, reference_image_url, cover_image_url, tags, selected_common_prompts, selected_reference_images, generation_mode, image_size, generate_quantity, model_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        title,
        content,
        referenceImageId,
        referenceImageUrl || null, // 保留URL作为备用
        coverImageUrl || null,
        tags || null,
        selectedCommonPrompts || null,
        selectedReferenceImages || null,
        generationMode || 'text-to-image',
        imageSize || '1024x1792',
        parseInt(generateQuantity) || 1,
        modelId || null
      ]
    );

    // 清除提示词缓存
    await imageCacheService.clearPromptsCache(userId);

    res.json({
      success: true,
      data: {
        id: result.insertId,
        user_id: userId,
        title,
        content,
        reference_image_id: referenceImageId,
        reference_image_url: referenceImageUrl || null,
        cover_image_url: coverImageUrl || null,
        tags: tags || null,
        selected_common_prompts: selectedCommonPrompts || null,
        selected_reference_images: selectedReferenceImages || null,
        generation_mode: generationMode || 'text-to-image',
        image_size: imageSize || '1024x1792',
        generate_quantity: parseInt(generateQuantity) || 1,
        model_id: modelId || null,
        created_at: new Date(),
        updated_at: new Date()
      },
      message: '提示词创建成功'
    });
  } catch (error) {
    console.error('创建提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '创建提示词失败'
    });
  }
});

/**
 * 更新提示词
 * PUT /api/prompts/:id
 */
router.put('/:id', authenticateToken, upload.single('referenceImage'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      tags,
      selectedCommonPrompts,
      selectedReferenceImages,
      generationMode,
      imageSize,
      generateQuantity,
      modelId,
      referenceImageUrl
    } = req.body;
    const userId = req.user.id;

    console.log('[提示词更新] 收到更新请求:', {
      id,
      title,
      contentLength: content?.length,
      hasFile: !!req.file,
      hasReferenceImageUrl: !!referenceImageUrl
    });

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: '标题和内容不能为空'
      });
    }

    const connection = db;

    // 先获取原有数据
    const [existingRows] = await connection.execute(
      'SELECT * FROM prompts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '提示词不存在'
      });
    }

    const existingPrompt = existingRows[0];
    let referenceImageId = existingPrompt.reference_image_id;
    let finalReferenceImageUrl = existingPrompt.reference_image_url;

    // 如果有新上传的图片
    if (req.file) {
      try {
        // 压缩并上传新图片
        const compressionResult = await ossManager.compressImage(req.file.buffer);
        const uploadResult = await ossManager.uploadImage(
          compressionResult.buffer,
          req.file.originalname,
          userId.toString()
        );

        // 保存图片信息到reference_images表
        const [imageResult] = await connection.execute(
          'INSERT INTO reference_images (user_id, name, url, filename, original_name, file_path, file_size, mime_type, oss_url, oss_key, is_prompt_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            userId,
            req.file.originalname,
            uploadResult.url,
            req.file.originalname,
            req.file.originalname,
            uploadResult.url,
            req.file.size,
            req.file.mimetype,
            uploadResult.url,
            uploadResult.key,
            1 // is_prompt_reference: 标记这是提示词卡片的参考图，不是常用参考图
          ]
        );
        referenceImageId = imageResult.insertId;
        finalReferenceImageUrl = uploadResult.url;
      } catch (uploadError) {
        console.error('图片更新失败:', uploadError);
        return res.status(500).json({
          success: false,
          message: '图片更新失败'
        });
      }
    } else if (referenceImageUrl) {
      // 如果提供了图片URL（没有上传新文件）
      finalReferenceImageUrl = referenceImageUrl;
    }

    // 构建更新SQL，包含所有可能更新的字段
    const updateFields = [];
    const updateValues = [];

    // 必须更新的字段
    updateFields.push('name = ?', 'content = ?', 'updated_at = CURRENT_TIMESTAMP');
    updateValues.push(title, content);


    // 可选更新的字段
    if (tags !== undefined) {
      updateFields.push('tags = ?');
      updateValues.push(tags);
    }

    if (selectedCommonPrompts !== undefined) {
      updateFields.push('selected_common_prompts = ?');
      updateValues.push(selectedCommonPrompts);
    }

    if (selectedReferenceImages !== undefined) {
      updateFields.push('selected_reference_images = ?');
      updateValues.push(selectedReferenceImages);
    }

    if (generationMode !== undefined) {
      updateFields.push('generation_mode = ?');
      updateValues.push(generationMode);
    }

    if (imageSize !== undefined) {
      updateFields.push('image_size = ?');
      updateValues.push(imageSize);
    }

    if (generateQuantity !== undefined) {
      updateFields.push('generate_quantity = ?');
      updateValues.push(parseInt(generateQuantity));
    }

    if (modelId !== undefined) {
      updateFields.push('model_id = ?');
      updateValues.push(modelId);
    }

    if (referenceImageId !== null) {
      updateFields.push('reference_image_id = ?');
      updateValues.push(referenceImageId);
    }

    if (finalReferenceImageUrl !== null) {
      updateFields.push('reference_image_url = ?');
      updateValues.push(finalReferenceImageUrl);
    }

    // 添加WHERE条件的参数
    updateValues.push(id, userId);

    // 执行更新
    const updateSQL = `UPDATE prompts SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`;
    console.log('[提示词更新] 执行SQL:', updateSQL);
    console.log('[提示词更新] 参数数量:', updateValues.length);

    await connection.execute(updateSQL, updateValues);

    // 清除提示词缓存
    await imageCacheService.clearPromptsCache(userId);

    console.log('[提示词更新] 更新成功');

    res.json({
      success: true,
      message: '提示词更新成功'
    });
  } catch (error) {
    console.error('更新提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '更新提示词失败'
    });
  }
});

/**
 * 删除提示词
 * DELETE /api/prompts/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const connection = db;
    
    // 先获取提示词信息
    const [rows] = await connection.execute(
      'SELECT * FROM prompts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '提示词不存在'
      });
    }

    const prompt = rows[0];

    // 删除数据库记录
    await connection.execute(
      'DELETE FROM prompts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    // 删除OSS中的图片
    if (prompt.reference_image_key) {
      await ossManager.deleteImage(prompt.reference_image_key);
    }

    // 清除提示词缓存
    await imageCacheService.clearPromptsCache(userId);

    res.json({
      success: true,
      message: '提示词删除成功'
    });
  } catch (error) {
    console.error('删除提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '删除提示词失败'
    });
  }
});

/**
 * 获取用户常用提示词列表
 * GET /api/prompts/common
 */
router.get('/common', authenticateToken, async (req, res) => {
  try {
    const connection = db;
    const userId = req.user.id;
    const [rows] = await connection.execute(
      'SELECT * FROM common_prompts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取用户常用提示词列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户常用提示词列表失败'
    });
  }
});

/**
 * 创建常用提示词
 * POST /api/prompts/common
 */
router.post('/common', authenticateToken, async (req, res) => {
  try {
    const { name, content } = req.body;
    const userId = req.user.id;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: '名称和内容不能为空'
      });
    }

    const connection = db;
    const [result] = await connection.execute(
      'INSERT INTO common_prompts (user_id, title, content, type) VALUES (?, ?, ?, ?)',
      [userId, name, content, 'image']
    );

    res.json({
      success: true,
      data: {
        id: result.insertId,
        user_id: userId,
        title: name,
        content: content
      },
      message: '常用提示词创建成功'
    });
  } catch (error) {
    console.error('创建常用提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '创建常用提示词失败'
    });
  }
});

/**
 * 更新常用提示词
 * PUT /api/prompts/common/:id
 */
router.put('/common/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content } = req.body;
    const userId = req.user.id;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: '名称和内容不能为空'
      });
    }

    const connection = db;
    const [result] = await connection.execute(
      'UPDATE common_prompts SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [name, content, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '常用提示词不存在'
      });
    }

    res.json({
      success: true,
      message: '常用提示词更新成功'
    });
  } catch (error) {
    console.error('更新常用提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '更新常用提示词失败'
    });
  }
});

/**
 * 删除常用提示词
 * DELETE /api/prompts/common/:id
 */
router.delete('/common/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const connection = db;
    const [result] = await connection.execute(
      'DELETE FROM common_prompts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '常用提示词不存在'
      });
    }

    res.json({
      success: true,
      message: '常用提示词删除成功'
    });
  } catch (error) {
    console.error('删除常用提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '删除常用提示词失败'
    });
  }
});

/**
 * 批量上传localStorage中的提示词到服务器
 * POST /api/prompts/batch-upload
 */
router.post('/batch-upload', authenticateToken, async (req, res) => {
  try {
    const { promptCards, commonPrompts } = req.body;
    const userId = req.user.id;
    
    if (!promptCards && !commonPrompts) {
      return res.status(400).json({
        success: false,
        message: '没有要上传的提示词数据'
      });
    }

    const connection = db;
    const results = {
      promptCards: { success: 0, failed: 0, errors: [] },
      commonPrompts: { success: 0, failed: 0, errors: [] }
    };

    // 上传提示词卡片
    if (promptCards && Array.isArray(promptCards)) {
      for (const prompt of promptCards) {
        try {
          if (!prompt.title || !prompt.content) {
            results.promptCards.failed++;
            results.promptCards.errors.push(`提示词卡片缺少标题或内容: ${prompt.title || '未知'}`);
            continue;
          }

          // 检查是否已存在相同的提示词
          const [existingRows] = await connection.execute(
            'SELECT id FROM prompts WHERE user_id = ? AND title = ? AND content = ?',
            [userId, prompt.title, prompt.content]
          );

          if (existingRows.length > 0) {
            results.promptCards.failed++;
            results.promptCards.errors.push(`提示词卡片已存在: ${prompt.title}`);
            continue;
          }

          // 插入新的提示词卡片
          await connection.execute(
            'INSERT INTO prompts (user_id, title, content, reference_image_url, reference_image_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              userId,
              prompt.title,
              prompt.content,
              prompt.referenceImage || null,
              null, // reference_image_key 暂时设为null，因为localStorage中的图片需要重新上传
              new Date(prompt.createdAt || Date.now()),
              new Date(prompt.updatedAt || Date.now())
            ]
          );
          
          results.promptCards.success++;
        } catch (error) {
          results.promptCards.failed++;
          results.promptCards.errors.push(`上传提示词卡片失败: ${prompt.title} - ${error.message}`);
        }
      }
    }

    // 上传常用提示词
    if (commonPrompts && Array.isArray(commonPrompts)) {
      for (const prompt of commonPrompts) {
        try {
          if (!prompt.name || !prompt.content) {
            results.commonPrompts.failed++;
            results.commonPrompts.errors.push(`常用提示词缺少名称或内容: ${prompt.name || '未知'}`);
            continue;
          }

          // 检查是否已存在相同的常用提示词
          const [existingRows] = await connection.execute(
            'SELECT id FROM common_prompts WHERE user_id = ? AND title = ? AND content = ?',
            [userId, prompt.name, prompt.content]
          );

          if (existingRows.length > 0) {
            results.commonPrompts.failed++;
            results.commonPrompts.errors.push(`常用提示词已存在: ${prompt.name}`);
            continue;
          }

          // 插入新的常用提示词
          await connection.execute(
            'INSERT INTO common_prompts (user_id, title, content, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              userId,
              prompt.name,
              prompt.content,
              'image',
              new Date(prompt.createdAt || Date.now()),
              new Date(prompt.updatedAt || Date.now())
            ]
          );
          
          results.commonPrompts.success++;
        } catch (error) {
          results.commonPrompts.failed++;
          results.commonPrompts.errors.push(`上传常用提示词失败: ${prompt.name} - ${error.message}`);
        }
      }
    }

    const totalSuccess = results.promptCards.success + results.commonPrompts.success;
    const totalFailed = results.promptCards.failed + results.commonPrompts.failed;

    res.json({
      success: true,
      data: results,
      message: `批量上传完成: 成功 ${totalSuccess} 个，失败 ${totalFailed} 个`
    });

  } catch (error) {
    console.error('批量上传提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '批量上传提示词失败'
    });
  }
});

/**
 * 获取视频常用提示词列表
 * GET /api/prompts/video-common
 */
router.get('/video-common', authenticateToken, async (req, res) => {
  try {
    const connection = db;
    const userId = req.user.id;

    // 查询视频常用提示词（使用相同的common_prompts表，通过type字段区分）
    const [rows] = await connection.execute(
      'SELECT * FROM common_prompts WHERE user_id = ? AND type = ? ORDER BY created_at DESC',
      [userId, 'video']
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取视频常用提示词列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取视频常用提示词列表失败',
      data: [] // 返回空数组作为fallback
    });
  }
});

/**
 * 创建视频常用提示词
 * POST /api/prompts/video-common
 */
router.post('/video-common', authenticateToken, async (req, res) => {
  try {
    const { name, content } = req.body;
    const userId = req.user.id;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        message: '名称和内容不能为空'
      });
    }

    const connection = db;
    const [result] = await connection.execute(
      'INSERT INTO common_prompts (user_id, title, content, type) VALUES (?, ?, ?, ?)',
      [userId, name, content, 'video']
    );

    res.json({
      success: true,
      data: {
        id: result.insertId,
        user_id: userId,
        title: name,
        content: content,
        type: 'video'
      },
      message: '视频常用提示词创建成功'
    });
  } catch (error) {
    console.error('创建视频常用提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '创建视频常用提示词失败'
    });
  }
});

/**
 * 删除视频常用提示词
 * DELETE /api/prompts/video-common/:id
 */
router.delete('/video-common/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const connection = db;
    const [result] = await connection.execute(
      'DELETE FROM common_prompts WHERE id = ? AND user_id = ? AND type = ?',
      [id, userId, 'video']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '视频常用提示词不存在'
      });
    }

    res.json({
      success: true,
      message: '视频常用提示词删除成功'
    });
  } catch (error) {
    console.error('删除视频常用提示词失败:', error);
    res.status(500).json({
      success: false,
      message: '删除视频常用提示词失败'
    });
  }
});

module.exports = router;

