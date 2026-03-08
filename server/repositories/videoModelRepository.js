const { execute } = require('../db');

const selectFields = `SELECT
  id,
  name,
  provider,
  model_type,
  model_id,
  api_url,
  icon_url,
  is_active,
  created_at,
  updated_at`;

const videoModelRepository = {
  async findActiveById(id) {
    const [rows] = await execute(
      `${selectFields} FROM video_models WHERE id = ? AND is_active = 1 LIMIT 1`,
      [id]
    );

    return rows[0] || null;
  },

  async findActiveByModelId(modelId) {
    const [rows] = await execute(
      `${selectFields} FROM video_models WHERE model_id = ? AND is_active = 1 LIMIT 1`,
      [modelId]
    );

    return rows[0] || null;
  },

  async listActiveModels() {
    const [rows] = await execute(
      `${selectFields} FROM video_models WHERE is_active = 1 ORDER BY created_at DESC`
    );

    return rows;
  }
};

module.exports = videoModelRepository;
