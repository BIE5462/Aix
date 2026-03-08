const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  ...config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  idleTimeout: 300000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 10,
  timezone: '+00:00'
});

const normalizeSqlForLog = (sql) => String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 200);

const logDbError = (operation, sql, error) => {
  console.error(`[db.${operation}] 数据库操作失败:`, {
    message: error.message,
    code: error.code,
    sql: normalizeSqlForLog(sql)
  });
};

const getPool = () => pool;

const getConnection = async () => pool.getConnection();

const query = async (sql, params = []) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    logDbError('query', sql, error);
    throw error;
  }
};

const execute = async (sql, params = []) => {
  try {
    return await pool.execute(sql, params);
  } catch (error) {
    logDbError('execute', sql, error);
    throw error;
  }
};

const withTransaction = async (handler) => {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('[db.withTransaction] 事务回滚失败:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

const closePool = async () => pool.end();

module.exports = {
  pool,
  getPool,
  getConnection,
  query,
  execute,
  withTransaction,
  closePool
};
