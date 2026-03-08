class ReferenceImageService {
  constructor(connection) {
    this.connection = connection;
  }

  createError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  normalizeName(name) {
    const normalized = String(name || '').trim();

    if (!normalized) {
      throw this.createError('分类名称不能为空', 400);
    }

    if (normalized.toLowerCase() === 'user-upload') {
      throw this.createError('user-upload 是系统保留分类名称，请使用其他名称', 400);
    }

    return normalized;
  }

  async getUserReferenceImages(userId) {
    const [rows] = await this.connection.execute(
      `SELECT *
       FROM reference_images
       WHERE user_id = ?
         AND (is_prompt_reference = 0 OR is_prompt_reference IS NULL)
       ORDER BY created_at DESC`,
      [userId]
    );

    return rows;
  }

  async getPublicReferenceImages(category = null) {
    let query = `
      SELECT * FROM reference_images
      WHERE is_public = 1
        AND (is_prompt_reference = 0 OR is_prompt_reference IS NULL)
      ORDER BY created_at DESC
    `;
    const params = [];

    if (category) {
      query = `
        SELECT * FROM reference_images
        WHERE is_public = 1
          AND (is_prompt_reference = 0 OR is_prompt_reference IS NULL)
          AND category = ?
        ORDER BY created_at DESC
      `;
      params.push(category);
    }

    const [rows] = await this.connection.execute(query, params);
    return rows;
  }

  async addReferenceImage(data) {
    const {
      userId,
      name,
      category,
      ossUrl,
      thumbnailUrl,
      originalName,
      size,
      mimeType
    } = data;

    const [result] = await this.connection.execute(
      `INSERT INTO reference_images
       (user_id, name, category, oss_url, thumbnail_url, original_name, size, mime_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, name, category || 'default', ossUrl, thumbnailUrl || ossUrl, originalName, size, mimeType]
    );

    return {
      id: result.insertId,
      user_id: userId,
      name,
      category: category || 'default',
      oss_url: ossUrl,
      thumbnail_url: thumbnailUrl || ossUrl,
      original_name: originalName,
      size,
      mime_type: mimeType,
      created_at: new Date()
    };
  }

  async deleteReferenceImage(imageId, userId) {
    await this.connection.execute(
      `DELETE FROM reference_images
       WHERE id = ? AND user_id = ?`,
      [imageId, userId]
    );
  }

  async getReferenceImageById(imageId, userId = null) {
    let query = `SELECT * FROM reference_images WHERE id = ?`;
    const params = [imageId];

    if (userId) {
      query += ` AND (user_id = ? OR user_id IS NULL)`;
      params.push(userId);
    }

    const [rows] = await this.connection.execute(query, params);
    return rows[0] || null;
  }

  async listCategories(userId) {
    const [rows] = await this.connection.execute(
      `SELECT id, name, created_at, updated_at
       FROM reference_image_categories
       WHERE user_id = ? AND name != ?
       ORDER BY created_at DESC`,
      [userId, 'user-upload']
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at
    }));
  }

  async getCategories(userId) {
    return this.listCategories(userId);
  }

  async ensureCategoryExists(userId, categoryId) {
    if (categoryId === null || categoryId === undefined || categoryId === '') {
      return null;
    }

    const [rows] = await this.connection.execute(
      'SELECT id, name, created_at, updated_at FROM reference_image_categories WHERE id = ? AND user_id = ?',
      [categoryId, userId]
    );

    if (rows.length === 0) {
      throw this.createError('目标分类不存在', 404);
    }

    return {
      id: rows[0].id,
      name: rows[0].name,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at || rows[0].created_at,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at || rows[0].created_at
    };
  }

  async createCategory(userId, name) {
    const normalizedName = this.normalizeName(name);

    const [existing] = await this.connection.execute(
      'SELECT id FROM reference_image_categories WHERE user_id = ? AND name = ?',
      [userId, normalizedName]
    );

    if (existing.length > 0) {
      throw this.createError('分类名称已存在', 400);
    }

    const [result] = await this.connection.execute(
      'INSERT INTO reference_image_categories (user_id, name) VALUES (?, ?)',
      [userId, normalizedName]
    );

    return {
      id: result.insertId,
      name: normalizedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async updateCategory(userId, categoryId, name) {
    const normalizedName = this.normalizeName(name);
    await this.ensureCategoryExists(userId, categoryId);

    const [existing] = await this.connection.execute(
      'SELECT id FROM reference_image_categories WHERE user_id = ? AND name = ? AND id != ?',
      [userId, normalizedName, categoryId]
    );

    if (existing.length > 0) {
      throw this.createError('分类名称已存在', 400);
    }

    await this.connection.execute(
      'UPDATE reference_image_categories SET name = ? WHERE id = ? AND user_id = ?',
      [normalizedName, categoryId, userId]
    );

    return {
      id: Number(categoryId),
      name: normalizedName,
      updatedAt: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async deleteCategory(userId, categoryId) {
    await this.ensureCategoryExists(userId, categoryId);

    await this.connection.execute(
      'UPDATE reference_images SET category_id = NULL WHERE category_id = ? AND user_id = ?',
      [categoryId, userId]
    );

    await this.connection.execute(
      'DELETE FROM reference_image_categories WHERE id = ? AND user_id = ?',
      [categoryId, userId]
    );

    return true;
  }

  async moveImagesToCategory(userId, imageIds, categoryId) {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      throw this.createError('请选择要移动的图片', 400);
    }

    const normalizedCategoryId = categoryId === '' ? null : categoryId;

    if (normalizedCategoryId !== null && normalizedCategoryId !== undefined) {
      await this.ensureCategoryExists(userId, normalizedCategoryId);
    }

    const placeholders = imageIds.map(() => '?').join(',');
    const [images] = await this.connection.execute(
      `SELECT id, category_id FROM reference_images WHERE id IN (${placeholders}) AND user_id = ?`,
      [...imageIds, userId]
    );

    if (images.length !== imageIds.length) {
      throw this.createError('部分图片不存在或无权限操作', 403);
    }

    const imagesToUpdate = images.filter((image) => image.category_id !== normalizedCategoryId);
    const duplicateCount = images.length - imagesToUpdate.length;

    if (imagesToUpdate.length === 0) {
      return {
        message: duplicateCount > 0 ? '所有图片已在目标分类中，无需重复添加' : '没有图片需要移动',
        affectedRows: 0,
        duplicateCount
      };
    }

    const updatePlaceholders = imagesToUpdate.map(() => '?').join(',');
    const [updateResult] = await this.connection.execute(
      `UPDATE reference_images SET category_id = ? WHERE id IN (${updatePlaceholders}) AND user_id = ?`,
      [normalizedCategoryId, ...imagesToUpdate.map((image) => image.id), userId]
    );

    let message = `成功移动 ${updateResult.affectedRows} 张图片`;
    if (duplicateCount > 0) {
      message += `，${duplicateCount} 张图片已在目标分类中（已忽略）`;
    }

    return {
      message,
      affectedRows: updateResult.affectedRows,
      duplicateCount
    };
  }

  async removeImagesFromCategory(userId, imageIds) {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      throw this.createError('请选择要移出的图片', 400);
    }

    const placeholders = imageIds.map(() => '?').join(',');
    const [images] = await this.connection.execute(
      `SELECT id, category_id FROM reference_images WHERE id IN (${placeholders}) AND user_id = ?`,
      [...imageIds, userId]
    );

    if (images.length !== imageIds.length) {
      throw this.createError('部分图片不存在或无权限操作', 403);
    }

    const imagesToUpdate = images.filter((image) => image.category_id !== null);
    const noCategoryCount = images.length - imagesToUpdate.length;

    if (imagesToUpdate.length === 0) {
      return {
        message: noCategoryCount > 0 ? '所有图片都没有分类，无需移出' : '没有图片需要移出',
        affectedRows: 0,
        noCategoryCount
      };
    }

    const updatePlaceholders = imagesToUpdate.map(() => '?').join(',');
    const [updateResult] = await this.connection.execute(
      `UPDATE reference_images SET category_id = NULL WHERE id IN (${updatePlaceholders}) AND user_id = ?`,
      [...imagesToUpdate.map((image) => image.id), userId]
    );

    let message = `成功移出 ${updateResult.affectedRows} 张图片`;
    if (noCategoryCount > 0) {
      message += `，${noCategoryCount} 张图片本来就没有分类`;
    }

    return {
      message,
      affectedRows: updateResult.affectedRows,
      noCategoryCount
    };
  }
}

module.exports = ReferenceImageService;
