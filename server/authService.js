const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { getPool } = require('./db');

const pool = getPool();

// JWT配置
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;
const getStoredPasswordHash = (user) => user?.password_hash || user?.password || null;

// 用户认证服务
const authService = {
  // 用户注册
  async register(userData) {
    try {
      const { username, email, password } = userData;
      
      // 检查用户名和邮箱是否已存在
      const [existingUsers] = await pool.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );
      
      if (existingUsers.length > 0) {
        throw new Error('用户名或邮箱已存在');
      }
      
      // 加密密码
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // 创建用户
      const [result] = await pool.execute(
        'INSERT INTO users (username, email, password_hash, password) VALUES (?, ?, ?, ?)',
        [username, email, passwordHash, passwordHash]
      );
      
      const userId = result.insertId;
      
      // 生成JWT token
      const token = jwt.sign(
        { userId, username, email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // 保存会话
      await this.saveSession(userId, token);
      
      return {
        success: true,
        user: {
          id: userId,
          username,
          email,
          createdAt: new Date().toISOString()
        },
        token
      };
    } catch (error) {
      console.error('用户注册失败:', error);
      throw error;
    }
  },
  
  // 用户登录
  async login(credentials) {
    try {
      const { username, password } = credentials;
      
      // 查找用户
      const [users] = await pool.execute(
        'SELECT id, username, email, password_hash, password FROM users WHERE (username = ? OR email = ?) AND is_active = TRUE',
        [username, username]
      );
      
      if (users.length === 0) {
        throw new Error('用户名或密码错误');
      }
      
      const user = users[0];
      const storedPasswordHash = getStoredPasswordHash(user);

      if (!storedPasswordHash) {
        throw new Error('用户密码数据缺失');
      }
      
      // 验证密码
      const isValidPassword = await bcrypt.compare(password, storedPasswordHash);
      if (!isValidPassword) {
        throw new Error('用户名或密码错误');
      }
      
      // 更新最后登录时间
      await pool.execute(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );
      
      // 生成JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // 保存会话
      await this.saveSession(user.id, token);
      
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        token
      };
    } catch (error) {
      console.error('用户登录失败:', error);
      throw error;
    }
  },
  
  // 验证token
  async verifyToken(token) {
    try {
      if (!token) {
        throw new Error('Token不能为空');
      }
      
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (!decoded || !decoded.userId) {
        throw new Error('Token格式无效');
      }
      
      // 检查用户是否仍然存在且活跃
      const [users] = await pool.execute(
        'SELECT id, username, email, is_admin FROM users WHERE id = ? AND is_active = TRUE',
        [decoded.userId]
      );
      
      if (users.length === 0) {
        throw new Error('用户不存在或已被禁用');
      }
      
      return {
        success: true,
        user: users[0]
      };
    } catch (error) {
      console.error('Token验证失败:', error);
      throw error;
    }
  },
  
  // 保存用户会话
  async saveSession(userId, token) {
    try {
      const decoded = jwt.decode(token);
      const expiresAt = new Date(decoded.exp * 1000);
      
      // 清理过期会话
      await pool.execute('DELETE FROM user_sessions WHERE expires_at < NOW()');
      
      // 保存新会话
      await pool.execute(
        'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, token.substring(0, 50), expiresAt]
      );
    } catch (error) {
      console.error('保存会话失败:', error);
    }
  },
  
  // 用户登出
  async logout(token) {
    try {
      const tokenHash = token.substring(0, 50);
      await pool.execute('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]);
      return { success: true };
    } catch (error) {
      console.error('用户登出失败:', error);
      throw error;
    }
  },
  
  // 获取用户信息
  async getUserInfo(userId) {
    try {
      const [users] = await pool.execute(
        'SELECT id, username, email, avatar, created_at, last_login_at FROM users WHERE id = ? AND is_active = TRUE',
        [userId]
      );
      
      if (users.length === 0) {
        throw new Error('用户不存在');
      }
      
      return {
        success: true,
        user: users[0]
      };
    } catch (error) {
      console.error('获取用户信息失败:', error);
      throw error;
    }
  },
  
  // 更新用户信息
  async updateUserInfo(userId, updateData) {
    try {
      const { username, email, avatar } = updateData;
      const updateFields = [];
      const updateValues = [];
      
      if (username) {
        updateFields.push('username = ?');
        updateValues.push(username);
      }
      if (email) {
        updateFields.push('email = ?');
        updateValues.push(email);
      }
      if (avatar) {
        updateFields.push('avatar = ?');
        updateValues.push(avatar);
      }
      
      if (updateFields.length === 0) {
        throw new Error('没有要更新的字段');
      }
      
      updateValues.push(userId);
      
      await pool.execute(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      return { success: true };
    } catch (error) {
      console.error('更新用户信息失败:', error);
      throw error;
    }
  },

  // 比较密码（用于管理员登录）
  async comparePassword(password, hashedPassword) {
    try {
      if (!hashedPassword) {
        return false;
      }
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      console.error('密码比较失败:', error);
      return false;
    }
  },

  // 生成JWT令牌
  generateToken(payload) {
    try {
      return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    } catch (error) {
      console.error('生成令牌失败:', error);
      throw error;
    }
  }
};

module.exports = authService;

