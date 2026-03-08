const { getPool, query, execute, withTransaction } = require('./db');
const imageCacheService = require('./services/imageCacheService');

const pool = getPool();

// 初始化数据库表
const initDatabase = async () => {
  try {
    // 创建用户表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NULL,
        password_hash VARCHAR(255) NOT NULL,
        password VARCHAR(255) NULL,
        is_admin TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
        INDEX idx_username (username),
        INDEX idx_email (email)
      )
    `);
    
    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email`);
    } catch (alterError) {
      if (alterError.code !== 'ER_DUP_FIELDNAME') {
        throw alterError;
      }
    }

    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN password VARCHAR(255) NULL AFTER password_hash`);
    } catch (alterError) {
      if (alterError.code !== 'ER_DUP_FIELDNAME') {
        throw alterError;
      }
    }

    await pool.execute(`
      UPDATE users
      SET password_hash = password
      WHERE (password_hash IS NULL OR password_hash = '')
        AND password IS NOT NULL
        AND password != ''
    `);

    // 为现有数据库添加 last_login_at 列（如果不存在）
    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL COMMENT '最后登录时间'`);
    } catch (alterError) {
      if (alterError.code !== 'ER_DUP_FIELDNAME') {
        throw alterError;
      }
    }
    
    // 修改 email 列允许 NULL
    try {
      await pool.execute(`ALTER TABLE users MODIFY COLUMN email VARCHAR(100) UNIQUE NULL`);
    } catch (alterError) {
      // 忽略错误
    }
    
    // 创建历史记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS history_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prompt TEXT NOT NULL,
        mode ENUM('text-to-image', 'image-to-image') NOT NULL,
        size VARCHAR(20) NOT NULL,
        quantity INT DEFAULT 1,
        reference_image VARCHAR(500),
        generated_images JSON,
        user_id INT NULL,
        model_id INT NULL COMMENT '使用的AI模型ID',
        video_data JSON NULL COMMENT '视频数据',
        tags JSON NULL COMMENT '标签',
        selected_common_prompts JSON NULL COMMENT '选中的常用提示词',
        selected_reference_images JSON NULL COMMENT '选中的参考图片',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id)
      )
    `);
    
    // 为现有 history_records 表添加缺失列
    const historyRecordsColumns = [
      { name: 'model_id', def: "INT NULL COMMENT '使用的AI模型ID'" },
      { name: 'video_data', def: "JSON NULL COMMENT '视频数据'" },
      { name: 'tags', def: "JSON NULL COMMENT '标签'" },
      { name: 'selected_common_prompts', def: "JSON NULL COMMENT '选中的常用提示词'" },
      { name: 'selected_reference_images', def: "JSON NULL COMMENT '选中的参考图片'" },
      { name: 'reference_images', def: "JSON NULL COMMENT '参考图片列表'" },
      { name: 'credits_consumed', def: "INT DEFAULT 0 COMMENT '消耗积分数'" },
      { name: 'transaction_id', def: "INT NULL COMMENT '关联交易ID'" }
    ];
    for (const col of historyRecordsColumns) {
      try {
        await pool.execute(`ALTER TABLE history_records ADD COLUMN ${col.name} ${col.def}`);
      } catch (alterError) {
        if (alterError.code !== 'ER_DUP_FIELDNAME') {
          throw alterError;
        }
      }
    }
    
    // 创建参考图表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS reference_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        name VARCHAR(200) NOT NULL,
        url VARCHAR(500) NOT NULL,
        filename VARCHAR(255) NULL COMMENT '文件名',
        original_name VARCHAR(255) NULL COMMENT '原始文件名',
        file_path VARCHAR(500) NULL COMMENT '文件路径',
        file_size INT NULL COMMENT '文件大小(字节)',
        mime_type VARCHAR(100) NULL COMMENT 'MIME类型',
        oss_url VARCHAR(500) NULL COMMENT 'OSS URL',
        oss_key VARCHAR(500) NULL COMMENT 'OSS文件key',
        oss_thumbnail_url VARCHAR(500) NULL COMMENT 'OSS缩略图URL',
        oss_thumbnail_key VARCHAR(500) NULL COMMENT 'OSS缩略图key',
        compressed_size INT NULL COMMENT '压缩后文件大小(字节)',
        is_prompt_reference TINYINT(1) DEFAULT 0 COMMENT '是否为提示词参考图',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);
    
    // 为现有 reference_images 表添加缺失列
    const referenceImagesColumns = [
      { name: 'filename', def: "VARCHAR(255) NULL COMMENT '文件名'" },
      { name: 'original_name', def: "VARCHAR(255) NULL COMMENT '原始文件名'" },
      { name: 'file_path', def: "VARCHAR(500) NULL COMMENT '文件路径'" },
      { name: 'file_size', def: "INT NULL COMMENT '文件大小(字节)'" },
      { name: 'mime_type', def: "VARCHAR(100) NULL COMMENT 'MIME类型'" },
      { name: 'oss_url', def: "VARCHAR(500) NULL COMMENT 'OSS URL'" },
      { name: 'oss_key', def: "VARCHAR(500) NULL COMMENT 'OSS文件key'" },
      { name: 'oss_thumbnail_url', def: "VARCHAR(500) NULL COMMENT 'OSS缩略图URL'" },
      { name: 'oss_thumbnail_key', def: "VARCHAR(500) NULL COMMENT 'OSS缩略图key'" },
      { name: 'compressed_size', def: "INT NULL COMMENT '压缩后文件大小(字节)'" },
      { name: 'is_prompt_reference', def: "TINYINT(1) DEFAULT 0 COMMENT '是否为提示词参考图'" }
    ];
    for (const col of referenceImagesColumns) {
      try {
        await pool.execute(`ALTER TABLE reference_images ADD COLUMN ${col.name} ${col.def}`);
      } catch (alterError) {
        if (alterError.code !== 'ER_DUP_FIELDNAME') {
          throw alterError;
        }
      }
    }
    
    // 创建提示词表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS prompts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        tags VARCHAR(100) NULL COMMENT '标签/分类',
        reference_image_id INT NULL COMMENT '关联参考图片ID',
        selected_common_prompts JSON NULL COMMENT '选中的常用提示词',
        selected_reference_images JSON NULL COMMENT '选中的参考图片',
        generation_mode VARCHAR(50) NULL COMMENT '生成模式',
        image_size VARCHAR(20) NULL COMMENT '图片尺寸',
        generate_quantity INT DEFAULT 1 COMMENT '生成数量',
        model_id INT NULL COMMENT '使用的模型ID',
        cover_image_url VARCHAR(500) NULL COMMENT '封面图URL',
        reference_image_url VARCHAR(500) NULL COMMENT '参考图URL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);
    
    // 为现有 prompts 表添加缺失列
    const promptsColumns = [
      { name: 'tags', def: "VARCHAR(100) NULL COMMENT '标签/分类'" },
      { name: 'reference_image_id', def: "INT NULL COMMENT '关联参考图片ID'" },
      { name: 'selected_common_prompts', def: "JSON NULL COMMENT '选中的常用提示词'" },
      { name: 'selected_reference_images', def: "JSON NULL COMMENT '选中的参考图片'" },
      { name: 'generation_mode', def: "VARCHAR(50) NULL COMMENT '生成模式'" },
      { name: 'image_size', def: "VARCHAR(20) NULL COMMENT '图片尺寸'" },
      { name: 'generate_quantity', def: "INT DEFAULT 1 COMMENT '生成数量'" },
      { name: 'model_id', def: "INT NULL COMMENT '使用的模型ID'" },
      { name: 'cover_image_url', def: "VARCHAR(500) NULL COMMENT '封面图URL'" },
      { name: 'reference_image_url', def: "VARCHAR(500) NULL COMMENT '参考图URL'" }
    ];
    for (const col of promptsColumns) {
      try {
        await pool.execute(`ALTER TABLE prompts ADD COLUMN ${col.name} ${col.def}`);
      } catch (alterError) {
        if (alterError.code !== 'ER_DUP_FIELDNAME') {
          throw alterError;
        }
      }
    }

    // 创建视频模型表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS video_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL COMMENT '模型名称',
        provider VARCHAR(100) NOT NULL COMMENT '提供商',
        model_type ENUM('text-to-video', 'image-to-video-first', 'image-to-video-both') NOT NULL COMMENT '模型类型',
        model_id VARCHAR(100) NOT NULL COMMENT '模型ID',
        api_url VARCHAR(500) NOT NULL COMMENT 'API地址',
        api_key VARCHAR(500) NOT NULL COMMENT 'API密钥',
        icon_url VARCHAR(500) NULL COMMENT '图标URL',
        is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_model_type (model_type),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视频模型配置表'
    `);

    // 创建常用提示词表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS common_prompts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'image' COMMENT '提示词类型：image（图像）或 video（视频）',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_type (type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='常用提示词表'
    `);
    
    // 创建图像模型表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模型名称',
        api_key VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API密钥',
        base_url VARCHAR(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API基础URL',
        is_default TINYINT(1) DEFAULT '0' COMMENT '是否为默认模型',
        is_active TINYINT(1) DEFAULT '1' COMMENT '是否启用',
        description TEXT COLLATE utf8mb4_unicode_ci COMMENT '模型描述',
        provider VARCHAR(50) DEFAULT 'google' COMMENT '模型厂商: google/doubao',
        model_type VARCHAR(50) DEFAULT 'image' COMMENT '模型类型: image/video',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        PRIMARY KEY (id),
        KEY idx_name (name),
        KEY idx_is_default (is_default),
        KEY idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI图像模型管理表'
    `);
    
    // 迁移：如果 provider 和 model_type 字段不存在，则添加
    try {
      await pool.execute(`ALTER TABLE ai_models ADD COLUMN provider VARCHAR(50) DEFAULT 'google' COMMENT '模型厂商: google/doubao' AFTER description`);
    } catch (error) {
      if (!error.message.includes('Duplicate column name')) {
        throw error;
      }
    }
    
    try {
      await pool.execute(`ALTER TABLE ai_models ADD COLUMN model_type VARCHAR(50) DEFAULT 'image' COMMENT '模型类型: image/video' AFTER provider`);
    } catch (error) {
      if (!error.message.includes('Duplicate column name')) {
        throw error;
      }
    }

    
    
    // 检查是否有默认图像模型，如果没有则插入
    const [existingImageModels] = await pool.execute('SELECT COUNT(*) as count FROM ai_models WHERE is_default = TRUE');
    if (existingImageModels[0].count === 0) {
      // 注意：默认模型需要管理员在后台配置真实API信息
      await pool.execute(`
        INSERT INTO ai_models (name, description, api_key, base_url, is_active, is_default)
        VALUES ('nano-banana', '默认的AI图像生成模型（需配置API）', '', 'https://api.example.com', FALSE, TRUE)
      `);
      console.log('默认图像模型已插入（请在后台配置API信息）');
    }

    // 创建AI文本模型配置表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ai_text_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        display_name VARCHAR(100) NOT NULL COMMENT '前端展示名称',
        model_name VARCHAR(100) NOT NULL COMMENT '模型调用名称',
        api_url VARCHAR(500) NOT NULL COMMENT 'API地址',
        api_key VARCHAR(500) NOT NULL COMMENT 'API密钥',
        role_name VARCHAR(100) NOT NULL COMMENT 'Role名称',
        role_content TEXT NOT NULL COMMENT 'Role内容/系统提示词',
        is_active BOOLEAN DEFAULT true COMMENT '是否启用',
        is_default BOOLEAN DEFAULT false COMMENT '是否为默认模型',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active),
        INDEX idx_is_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI文本模型配置表'
    `);

    // 创建AI生成提示词历史记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ai_prompt_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '用户ID',
        model_id INT NOT NULL COMMENT '使用的模型ID',
        model_display_name VARCHAR(100) NOT NULL COMMENT '模型展示名称快照',
        user_input TEXT NOT NULL COMMENT '用户输入的原始需求',
        generated_prompts JSON NOT NULL COMMENT '生成的提示词列表',
        prompt_count INT NOT NULL COMMENT '生成的提示词数量',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_model_id (model_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI生成提示词历史记录表'
    `);

    // 创建批量输入表单历史记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS batch_prompt_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '用户 ID',
        name VARCHAR(200) NOT NULL COMMENT '历史记录名称',
        prompts JSON NOT NULL COMMENT '批量提示词列表 (最多 10 个)',
        prompt_count INT NOT NULL COMMENT '提示词数量',
        source_type ENUM('manual', 'ai_generated') DEFAULT 'manual' COMMENT '来源类型',
        source_id INT NULL COMMENT '如果是 AI 生成的，关联 ai_prompt_history 的 ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_source_type (source_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量输入表单历史记录表'
    `);

    // 创建公开作品表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS public_works (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '用户 ID',
        history_id INT NULL COMMENT '关联的历史记录 ID',
        title VARCHAR(200) NULL COMMENT '作品标题',
        cover_url VARCHAR(500) NOT NULL COMMENT '封面图 URL',
        content_type ENUM('image', 'video') NOT NULL COMMENT '内容类型',
        prompt TEXT NOT NULL COMMENT '提示词',
        model_id INT NULL COMMENT '模型 ID',
        model_name VARCHAR(100) NULL COMMENT '模型名称',
        size VARCHAR(20) NULL COMMENT '尺寸/分辨率',
        reference_images JSON NULL COMMENT '参考图片列表',
        video_data JSON NULL COMMENT '视频数据',
        is_published BOOLEAN DEFAULT TRUE COMMENT '是否已发布',
        views_count INT DEFAULT 0 COMMENT '浏览数',
        likes_count INT DEFAULT 0 COMMENT '点赞数',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_content_type (content_type),
        INDEX idx_is_published (is_published),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公开作品表'
    `);

    // 创建作品点赞表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS work_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '用户 ID',
        work_id INT NOT NULL COMMENT '作品 ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_work (user_id, work_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (work_id) REFERENCES public_works(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_work_id (work_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品点赞表'
    `);

    // 创建用户积分余额表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE COMMENT '用户 ID',
        balance DECIMAL(10,2) DEFAULT 0 COMMENT '当前余额（弹珠数）',
        total_recharged DECIMAL(10,2) DEFAULT 0 COMMENT '累计充值金额',
        total_consumed DECIMAL(10,2) DEFAULT 0 COMMENT '累计消费金额',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户积分余额表'
    `);

    // 创建积分交易记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '用户 ID',
        transaction_type ENUM('recharge', 'consume', 'admin_grant') NOT NULL COMMENT '交易类型',
        amount DECIMAL(10,2) NOT NULL COMMENT '交易金额（正数增加，负数减少）',
        balance_before DECIMAL(10,2) NOT NULL COMMENT '交易前余额',
        balance_after DECIMAL(10,2) NOT NULL COMMENT '交易后余额',
        description VARCHAR(500) NULL COMMENT '交易描述',
        related_order_id VARCHAR(100) NULL COMMENT '关联订单 ID',
        related_generation_id INT NULL COMMENT '关联生成记录 ID',
        admin_user_id INT NULL COMMENT '操作管理员 ID',
        ip_address VARCHAR(50) NULL COMMENT 'IP 地址',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_transaction_type (transaction_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='积分交易记录表'
    `);

    // 创建充值订单表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS recharge_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号',
        user_id INT NOT NULL COMMENT '用户 ID',
        amount DECIMAL(10,2) NOT NULL COMMENT '充值金额（美元）',
        credits DECIMAL(10,2) NOT NULL COMMENT '获得弹珠数',
        payment_method VARCHAR(50) NULL COMMENT '支付方式',
        payment_status ENUM('pending', 'paid', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '支付状态',
        payment_time TIMESTAMP NULL COMMENT '支付时间',
        payment_channel_order_no VARCHAR(100) NULL COMMENT '支付渠道订单号',
        payment_data JSON NULL COMMENT '支付回调数据',
        ip_address VARCHAR(50) NULL COMMENT '用户 IP',
        user_agent VARCHAR(500) NULL COMMENT '用户代理',
        expired_at TIMESTAMP NOT NULL COMMENT '过期时间',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_order_no (order_no),
        INDEX idx_user_id (user_id),
        INDEX idx_payment_status (payment_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='充值订单表'
    `);

    // 创建模型价格配置表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS model_pricing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_key VARCHAR(100) NOT NULL UNIQUE COMMENT '模型标识',
        model_name VARCHAR(200) NOT NULL COMMENT '模型名称',
        model_type ENUM('image', 'video') NOT NULL COMMENT '模型类型',
        pricing_type ENUM('fixed', 'per_second', 'per_resolution') NOT NULL COMMENT '计费类型',
        base_price DECIMAL(10,2) NULL COMMENT '基础价格（固定价格）',
        price_per_second DECIMAL(10,2) NULL COMMENT '每秒价格',
        supported_durations JSON NULL COMMENT '支持的时长列表（秒）',
        resolution_pricing JSON NULL COMMENT '分辨率价格配置',
        is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
        description TEXT NULL COMMENT '描述',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_model_key (model_key),
        INDEX idx_model_type (model_type),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型价格配置表'
    `);

    // 初始化现有用户的积分账户
    await pool.execute(`
      INSERT INTO user_credits (user_id, balance, total_recharged, total_consumed)
      SELECT id, 0, 0, 0 FROM users
      ON DUPLICATE KEY UPDATE user_id = user_id
    `);
    console.log('现有用户积分账户已初始化');

    // 检查是否有默认文本模型，如果没有则插入
    const [existingTextModels] = await pool.execute('SELECT COUNT(*) as count FROM ai_text_models WHERE is_default = TRUE');
    if (existingTextModels[0].count === 0) {
      // 注意：默认模型需要管理员在后台配置真实API信息
      await pool.execute(`
        INSERT INTO ai_text_models (display_name, model_name, api_url, api_key, role_name, role_content, is_active, is_default)
        VALUES ('GPT-4提示词生成器', 'gpt-4-turbo', 'https://api.example.com', '', '提示词专家', '你是一个专业的AI图像生成提示词专家，擅长将用户的简单描述转换为详细的、适合AI图像生成的英文提示词。你需要：1. 理解用户的中文描述；2. 生成详细的英文提示词；3. 包含风格、光线、氛围、质量等细节；4. 使用逗号分隔关键词；5. 确保提示词适合Stable Diffusion、Midjourney等AI图像生成工具。', FALSE, TRUE)
      `);
      console.log('默认文本模型已插入（请在后台配置API信息）');
    }

    console.log('数据库表初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
};

// 历史记录相关操作
const historyService = {
  // 添加历史记录
  async addHistory(historyData, userId = null) {
    try {
      const {
        prompt, mode, size, quantity, referenceImage, generatedImages, modelId, videoData,
        tags, selectedCommonPrompts, selectedReferenceImages
      } = historyData;

      // 确保所有参数都不是undefined
      const safeParams = [
        userId,
        prompt || '',
        mode || 'text-to-image',
        size || '1024x1024',
        quantity || 1,
        referenceImage || null,
        JSON.stringify(generatedImages || []),
        modelId || null,
        videoData ? JSON.stringify(videoData) : null,
        tags ? JSON.stringify(tags) : null,
        selectedCommonPrompts ? JSON.stringify(selectedCommonPrompts) : null,
        selectedReferenceImages ? JSON.stringify(selectedReferenceImages) : null
      ];

      const [result] = await pool.execute(
        'INSERT INTO history_records (user_id, prompt, mode, size, quantity, reference_image, generated_images, model_id, video_data, tags, selected_common_prompts, selected_reference_images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        safeParams
      );

      // 清除历史记录缓存
      if (userId) {
        await imageCacheService.clearHistoryCache(userId);
      }

      return {
        id: result.insertId,
        record: {
          id: result.insertId,
          ...historyData,
          createdAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('添加历史记录失败:', error);
      throw error;
    }
  },
  
  // 获取历史记录列表
  async getHistoryList(page = 1, pageSize = 10, searchKeyword = '', userId = null) {
    try {
      // 构建缓存键（包含搜索关键词和用户ID）
      const cacheKey = userId
        ? `user:${userId}:history:all:page:${page}:size:${pageSize}:search:${searchKeyword || 'none'}`
        : null;

      // 如果有用户ID，尝试从缓存获取
      if (cacheKey) {
        const cached = await imageCacheService.getUserHistory(userId, page, pageSize, `all:search:${searchKeyword || 'none'}`);
        if (cached) {
          console.log(`从缓存获取历史记录: 用户${userId}, 页码${page}, 搜索词"${searchKeyword}"`);
          return cached;
        }
      }

      const offset = (page - 1) * pageSize;
      let query = 'SELECT * FROM history_records';
      let params = [];

      if (searchKeyword) {
        query += ' WHERE prompt LIKE ?';
        params.push(`%${searchKeyword}%`);
      }

      query += ' ORDER BY created_at DESC LIMIT ' + parseInt(pageSize) + ' OFFSET ' + parseInt(offset);

      const [rows] = await pool.execute(query, params);

      // 解析JSON字段
      const historyList = rows.map(row => {
        let generatedImages = [];
        let videoData = null;

        try {
          if (row.generated_images) {
            generatedImages = typeof row.generated_images === 'string'
              ? JSON.parse(row.generated_images)
              : row.generated_images;
          }
        } catch (error) {
          console.error('解析generated_images失败:', error, row.generated_images);
          generatedImages = [];
        }

        try {
          if (row.video_data) {
            videoData = typeof row.video_data === 'string'
              ? JSON.parse(row.video_data)
              : row.video_data;
          }
        } catch (error) {
          console.error('解析video_data失败:', error);
          videoData = null;
        }

        return {
          id: row.id.toString(),
          prompt: row.prompt,
          mode: row.mode,
          size: row.size,
          quantity: row.quantity,
          referenceImage: row.reference_image,
          generatedImages,
          videoData,
          modelId: row.model_id,
          modelName: row.model_name || null,
          createdAt: row.created_at.toISOString()
        };
      });

      // 缓存结果（如果有用户ID）
      if (cacheKey && userId) {
        await imageCacheService.cacheUserHistory(userId, page, pageSize, `all:search:${searchKeyword || 'none'}`, historyList);
      }

      return historyList;
    } catch (error) {
      console.error('获取历史记录失败:', error);
      throw error;
    }
  },
  
  // 删除历史记录
  async deleteHistory(id, userId = null) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM history_records WHERE id = ?',
        [id]
      );

      // 清除历史记录缓存
      if (userId && result.affectedRows > 0) {
        await imageCacheService.clearHistoryCache(userId);
      }

      return result.affectedRows > 0;
    } catch (error) {
      console.error('删除历史记录失败:', error);
      throw error;
    }
  },
  
  // 清空历史记录
  async clearHistory(userId = null) {
    try {
      const [result] = await pool.execute('DELETE FROM history_records');

      // 清除历史记录缓存
      if (userId && result.affectedRows > 0) {
        await imageCacheService.clearHistoryCache(userId);
      }

      return result.affectedRows;
    } catch (error) {
      console.error('清空历史记录失败:', error);
      throw error;
    }
  },
  
  // 获取历史记录总数
  async getHistoryCount(searchKeyword = '') {
    try {
      let query = 'SELECT COUNT(*) as count FROM history_records';
      let params = [];
      
      if (searchKeyword) {
        query += ' WHERE prompt LIKE ?';
        params.push(`%${searchKeyword}%`);
      }
      
      const [rows] = await pool.execute(query, params);
      return rows[0].count;
    } catch (error) {
      console.error('获取历史记录总数失败:', error);
      throw error;
    }
  }
};

// 参考图相关操作
const referenceImageService = {
  // 添加参考图
  async addReferenceImage(imageData) {
    try {
      const { filename, originalName, filePath, fileSize, mimeType } = imageData;
      
      const [result] = await pool.execute(
        'INSERT INTO reference_images (filename, original_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?)',
        [filename, originalName, filePath, fileSize, mimeType]
      );
      
      return {
        id: result.insertId,
        filename,
        originalName,
        filePath,
        fileSize,
        mimeType,
        url: `/uploads/${filename}`,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('添加参考图失败:', error);
      throw error;
    }
  },
  
  // 批量添加参考图
  async addReferenceImages(imagesData) {
    try {
      const results = [];
      for (const imageData of imagesData) {
        const result = await this.addReferenceImage(imageData);
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error('批量添加参考图失败:', error);
      throw error;
    }
  },
  
  // 获取参考图列表
  async getReferenceImages() {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM reference_images ORDER BY created_at DESC'
      );
      
      return rows.map(row => ({
        id: row.id.toString(),
        filename: row.filename,
        originalName: row.original_name,
        filePath: row.file_path,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        url: `/uploads/${row.filename}`,
        createdAt: row.created_at.toISOString()
      }));
    } catch (error) {
      console.error('获取参考图列表失败:', error);
      throw error;
    }
  },
  
  // 根据ID获取参考图
  async getReferenceImageById(id) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM reference_images WHERE id = ?',
        [id]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      const row = rows[0];
      return {
        id: row.id.toString(),
        filename: row.filename,
        originalName: row.original_name,
        filePath: row.file_path,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        url: `/uploads/${row.filename}`,
        createdAt: row.created_at.toISOString()
      };
    } catch (error) {
      console.error('获取参考图详情失败:', error);
      throw error;
    }
  },
  
  // 删除参考图
  async deleteReferenceImage(id) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM reference_images WHERE id = ?',
        [id]
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('删除参考图失败:', error);
      throw error;
    }
  },
  
  // 批量删除参考图
  async batchDeleteReferenceImages(ids) {
    try {
      if (ids.length === 0) return 0;
      
      const placeholders = ids.map(() => '?').join(',');
      const [result] = await pool.execute(
        `DELETE FROM reference_images WHERE id IN (${placeholders})`,
        ids
      );
      
      return result.affectedRows;
    } catch (error) {
      console.error('批量删除参考图失败:', error);
      throw error;
    }
  }
};

// 图像模型相关操作
const aiModelService = {
  // 获取所有图像模型
  async getAllModels() {
    try {
      // 先从缓存获取
      const cached = await imageCacheService.getModelList('all');
      if (cached) {
        console.log('从缓存获取所有AI模型列表:', cached.length, '个模型');
        return cached;
      }

      // 查询数据库
      const [rows] = await pool.execute('SELECT * FROM ai_models WHERE is_active = TRUE ORDER BY is_default DESC, created_at ASC');

      // 缓存结果（24小时）
      await imageCacheService.cacheModelList('all', rows);

      return rows;
    } catch (error) {
      console.error('获取图像模型失败:', error);
      throw error;
    }
  },

  // 根据ID获取图像模型
  async getModelById(id) {
    try {
      const [rows] = await pool.execute('SELECT * FROM ai_models WHERE id = ? AND is_active = TRUE', [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('获取图像模型失败:', error);
      throw error;
    }
  },

  // 根据名称获取图像模型
  async getModelByName(name) {
    try {
      const [rows] = await pool.execute('SELECT * FROM ai_models WHERE name = ? AND is_active = TRUE', [name]);
      return rows[0] || null;
    } catch (error) {
      console.error('获取图像模型失败:', error);
      throw error;
    }
  },

  // 获取默认图像模型
  async getDefaultModel() {
    try {
      const [rows] = await pool.execute('SELECT * FROM ai_models WHERE is_default = TRUE AND is_active = TRUE LIMIT 1');
      return rows[0] || null;
    } catch (error) {
      console.error('获取默认图像模型失败:', error);
      throw error;
    }
  },

  // 添加图像模型
  async addModel(modelData) {
    try {
      const { name, description, api_key, base_url, is_default = false, is_active = true, provider = 'google', model_type = 'image' } = modelData;

      // 如果设置为默认模型，先取消其他模型的默认状态
      if (is_default) {
        await pool.execute('UPDATE ai_models SET is_default = FALSE');
      }

      const [result] = await pool.execute(
        'INSERT INTO ai_models (name, description, api_key, base_url, is_default, is_active, provider, model_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, description, api_key, base_url, is_default, is_active, provider, model_type]
      );

      // 清除模型列表缓存
      await imageCacheService.clearModelCache();

      return result.insertId;
    } catch (error) {
      console.error('添加图像模型失败:', error);
      throw error;
    }
  },

  // 更新图像模型
  async updateModel(id, modelData) {
    try {
      const { name, description, api_key, base_url, is_default = false, is_active = true, provider = 'google', model_type = 'image' } = modelData;

      // 如果设置为默认模型，先取消其他模型的默认状态
      if (is_default) {
        await pool.execute('UPDATE ai_models SET is_default = FALSE WHERE id != ?', [id]);
      }

      const [result] = await pool.execute(
        'UPDATE ai_models SET name = ?, description = ?, api_key = ?, base_url = ?, is_default = ?, is_active = ?, provider = ?, model_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, description, api_key, base_url, is_default, is_active, provider, model_type, id]
      );

      // 清除模型列表缓存
      if (result.affectedRows > 0) {
        await imageCacheService.clearModelCache();
      }

      return result.affectedRows > 0;
    } catch (error) {
      console.error('更新图像模型失败:', error);
      throw error;
    }
  },

  // 删除图像模型
  async deleteModel(id) {
    try {
      const [result] = await pool.execute('DELETE FROM ai_models WHERE id = ?', [id]);

      // 清除模型列表缓存
      if (result.affectedRows > 0) {
        await imageCacheService.clearModelCache();
      }

      return result.affectedRows > 0;
    } catch (error) {
      console.error('删除图像模型失败:', error);
      throw error;
    }
  }
};

// 视频模型相关操作


// 获取数据库连接的便捷函数
const getConnection = () => pool;

module.exports = {
  pool,
  getPool,
  getConnection,
  query,
  execute,
  withTransaction,
  initDatabase,
  historyService,
  referenceImageService,
  aiModelService
};

