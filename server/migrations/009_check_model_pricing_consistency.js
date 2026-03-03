/**
 * 检查 ai_models / video_models 与 model_pricing 之间的配置一致性
 * 用法：
 *   node server/migrations/009_check_model_pricing_consistency.js
 */

const { getConnection } = require('../database');

async function main() {
  const connection = getConnection();

  try {
    console.log('开始检查模型与价格配置的一致性...');

    // 读取 ai_models
    const [aiModels] = await connection.execute(
      'SELECT id, name, provider, model_type, is_active FROM ai_models'
    );

    // 读取 video_models（如果存在）
    let videoModels = [];
    try {
      const [rows] = await connection.execute(
        'SELECT id, name, provider, model_type, model_id, is_active FROM video_models'
      );
      videoModels = rows;
    } catch (error) {
      console.warn('查询 video_models 失败，可能表不存在:', error.message);
    }

    // 读取 model_pricing
    const [pricingRows] = await connection.execute(
      'SELECT model_key, model_name, model_type, pricing_type, is_active FROM model_pricing'
    );

    const pricingMap = new Map();
    pricingRows.forEach(row => {
      pricingMap.set(row.model_key, row);
    });

    console.log('\n=== 图像模型 (ai_models) 与价格配置对比 ===');
    const missingPricing = [];
    const typeMismatch = [];

    aiModels.forEach(model => {
      const key = model.name;
      const pricing = pricingMap.get(key);
      if (!pricing) {
        missingPricing.push({
          model_key: key,
          provider: model.provider,
          model_type: model.model_type,
          is_active: model.is_active
        });
      } else if (pricing.model_type !== 'image') {
        typeMismatch.push({
          model_key: key,
          model_type: pricing.model_type,
          expected: 'image'
        });
      }
    });

    if (missingPricing.length === 0) {
      console.log('✓ 所有 ai_models 均已在 model_pricing 中配置价格');
    } else {
      console.log('✗ 以下 ai_models 缺少价格配置:');
      missingPricing.forEach(item => {
        console.log(
          `  - key=${item.model_key}, provider=${item.provider}, type=${item.model_type}, active=${item.is_active}`
        );
      });
    }

    if (typeMismatch.length > 0) {
      console.log('\n✗ 以下条目的 model_type 与 ai_models 预期不一致(应为 image):');
      typeMismatch.forEach(item => {
        console.log(
          `  - key=${item.model_key}, pricing.model_type=${item.model_type}, expected=${item.expected}`
        );
      });
    }

    console.log('\n=== 视频模型 (video_models) 与价格配置对比 ===');
    const videoMissingPricing = [];

    videoModels.forEach(model => {
      const key = model.model_id || model.name;
      const pricing = pricingMap.get(key);
      if (!pricing) {
        videoMissingPricing.push({
          model_key: key,
          provider: model.provider,
          model_type: model.model_type,
          is_active: model.is_active
        });
      }
    });

    if (videoMissingPricing.length === 0) {
      console.log('✓ 所有 video_models 均已在 model_pricing 中配置价格');
    } else {
      console.log('✗ 以下 video_models 缺少价格配置:');
      videoMissingPricing.forEach(item => {
        console.log(
          `  - key=${item.model_key}, provider=${item.provider}, type=${item.model_type}, active=${item.is_active}`
        );
      });
    }

    console.log('\n检查完成。根据结果可考虑在数据库层面添加外键或唯一约束。');
    process.exit(0);
  } catch (error) {
    console.error('检查过程中发生错误:', error);
    process.exit(1);
  }
}

main();

