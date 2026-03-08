const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const ossRetryService = require('../services/ossRetryService');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: '缺少图片URL参数' });
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: '不支持的URL协议' });
      }
    } catch (error) {
      return res.status(400).json({ error: '无效的图片URL' });
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(response.data);
  } catch (error) {
    console.error('代理图片请求失败:', error.message);
    res.status(500).json({ error: '代理图片失败: ' + error.message });
  }
});

router.post('/download-image', authenticateToken, async (req, res) => {
  try {
    const { imageUrl, filename } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: '请提供图片URL' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'image/png',
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    if (filename) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error('代理下载图片失败:', error);

    if (error.code === 'ECONNABORTED') {
      res.status(408).json({ error: '下载超时' });
    } else if (error.response) {
      res.status(error.response.status).json({ error: `下载失败: ${error.response.statusText}` });
    } else {
      res.status(500).json({ error: '下载失败: ' + (error.message || '未知错误') });
    }
  }
});

router.get('/admin/oss-retry-status', async (req, res) => {
  try {
    const status = await ossRetryService.getQueueStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('获取OSS补偿队列状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/oss-retry-process', async (req, res) => {
  try {
    await ossRetryService.processNow();
    res.json({ success: true, message: '已触发OSS补偿处理' });
  } catch (error) {
    console.error('手动触发OSS补偿处理失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
