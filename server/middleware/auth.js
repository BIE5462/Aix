const jwt = require('jsonwebtoken');
const config = require('../config');
const authService = require('../authService');

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn || '7d';

const extractBearerToken = (req) => {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
};

const normalizeUser = (user = {}) => {
  const id = user.id || user.userId || null;
  const isAdmin = typeof user.isAdmin !== 'undefined'
    ? Boolean(user.isAdmin)
    : Boolean(user.is_admin);

  return {
    ...user,
    id,
    userId: id,
    username: user.username,
    email: user.email,
    isAdmin,
    is_admin: typeof user.is_admin !== 'undefined' ? user.is_admin : (isAdmin ? 1 : 0)
  };
};

const sendAuthError = (res, status, error, code) => {
  return res.status(status).json({
    success: false,
    error,
    code
  });
};

const getAuthenticatedUser = async (req) => {
  const token = extractBearerToken(req);

  if (!token) {
    const error = new Error('访问令牌缺失');
    error.status = 401;
    error.code = 'AUTH_TOKEN_MISSING';
    throw error;
  }

  const result = await authService.verifyToken(token);
  return normalizeUser(result.user);
};

const authenticateToken = async (req, res, next) => {
  try {
    req.user = await getAuthenticatedUser(req);
    next();
  } catch (error) {
    if (error.status === 401) {
      return sendAuthError(res, 401, '访问令牌缺失', 'AUTH_TOKEN_MISSING');
    }

    return sendAuthError(res, 403, '访问令牌无效或已过期', 'AUTH_TOKEN_INVALID');
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return next();
    }

    const result = await authService.verifyToken(token);
    req.user = normalizeUser(result.user);
    next();
  } catch (error) {
    next();
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user.isAdmin) {
      return sendAuthError(res, 403, '需要管理员权限', 'AUTH_FORBIDDEN');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.status === 401) {
      return sendAuthError(res, 401, '访问令牌缺失', 'AUTH_TOKEN_MISSING');
    }

    return sendAuthError(res, 403, '访问令牌无效或已过期', 'AUTH_TOKEN_INVALID');
  }
};

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  generateToken,
  verifyToken,
  normalizeUser
};
