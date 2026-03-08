const { initDatabase, getConnection } = require('../database');
const migrateDatabase = require('../migrate-db');
const migrateCategories = require('../migrate-categories');
const redisService = require('../redis');
const imageCacheService = require('../services/imageCacheService');
const ossRetryService = require('../services/ossRetryService');
const ReferenceImageService = require('../services/referenceImageService');

const initServices = async (app) => {
  await initDatabase();
  await migrateDatabase();
  await migrateCategories();
  await redisService.init();
  await imageCacheService.init();

  const connection = getConnection();
  app.locals.referenceImageService = new ReferenceImageService(connection);

  await ossRetryService.start();
  console.log('所有服务初始化完成');
};

const shutdownServices = async () => {
  try {
    ossRetryService.stop();
  } catch (error) {
    console.error('停止OSS补偿服务失败:', error);
  }

  await redisService.close();
};

module.exports = {
  initServices,
  shutdownServices
};
