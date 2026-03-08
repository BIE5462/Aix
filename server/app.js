const path = require('path');
const express = require('express');
const cors = require('cors');
const { authenticateToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const promptRoutes = require('./routes/prompts');
const adminRoutes = require('./routes/admin');
const adminContentRoutes = require('./routes/adminContent');
const adminCreditsRoutes = require('./routes/adminCredits');
const adminPricingRoutes = require('./routes/adminPricing');
const adminUsersRoutes = require('./routes/adminUsers');
const adminGenerationsRoutes = require('./routes/adminGenerations');
const adminModelsRoutes = require('./routes/adminModels');
const videoRoutes = require('./routes/video');
const referenceImageRoutes = require('./routes/referenceImages');
const referenceImageCategoriesCompatRoutes = require('./routes/referenceImageCategoriesCompat');
const worksRoutes = require('./routes/works');
const creditsRoutes = require('./routes/credits');
const textModelsRoutes = require('./routes/textModels');
const aiPromptsRoutes = require('./routes/aiPrompts');
const batchPromptsRoutes = require('./routes/batchPrompts');
const videoModelsRoutes = require('./routes/videoModels');
const userHistoryRoutes = require('./routes/userHistory');
const historyRoutes = require('./routes/history');
const generateRoutes = require('./routes/generate');
const systemRoutes = require('./routes/system');

const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use('/api', systemRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/user/history', authenticateToken, userHistoryRoutes);
  app.use('/api/prompts', promptRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminContentRoutes);
  app.use('/api/admin', adminCreditsRoutes);
  app.use('/api/admin', adminPricingRoutes);
  app.use('/api/admin', adminUsersRoutes);
  app.use('/api/admin', adminGenerationsRoutes);
  app.use('/api/admin', adminModelsRoutes);
  app.use('/api/video', videoRoutes);
  app.use('/api/video-models', videoModelsRoutes);
  app.use('/api/reference-images', authenticateToken, referenceImageRoutes);
  app.use('/api/reference-image-categories', authenticateToken, referenceImageCategoriesCompatRoutes);
  app.use('/api/works', worksRoutes);
  app.use('/api/credits', creditsRoutes);
  app.use('/api/text-models', textModelsRoutes);
  app.use('/api/ai-prompts', aiPromptsRoutes);
  app.use('/api/batch-prompts', batchPromptsRoutes);
  app.use('/api/generate', authenticateToken, generateRoutes);
  app.use('/api/history', authenticateToken, historyRoutes);

  app.use(errorHandler);

  return app;
};

module.exports = {
  createApp
};
