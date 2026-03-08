const config = require('./config');
const { createApp } = require('./app');
const { initServices, shutdownServices } = require('./bootstrap/initServices');

const PORT = config.server.port;
const app = createApp();

const startServer = async () => {
  try {
    await initServices(app);

    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`API地址: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

const handleShutdown = async () => {
  console.log('正在关闭服务器...');
  await shutdownServices();
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

startServer();
