const notFoundHandler = (req, res, next) => {
  res.status(404).json({ error: '接口不存在' });
};

const errorHandler = (error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ error: '服务器内部错误' });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
