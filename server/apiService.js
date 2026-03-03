const axios = require('axios');
const config = require('./config');
const ossManager = require('./utils/ossManager');
const { getConnection, aiModelService } = require('./database');
const imageCacheService = require('./services/imageCacheService');

// 创建API客户端
const apiClient = axios.create({
  baseURL: config.api.baseUrl,
  headers: {
    'Authorization': `Bearer ${config.api.key}`,
    'Content-Type': 'application/json'
  }
});

// 根据模型ID获取图像模型配置
async function getImageModelConfig(modelId) {
  try {
    if (!modelId) {
      // 如果没有指定模型ID，使用默认模型
      const model = await aiModelService.getDefaultModel();
      
      if (model) {
        return {
          name: model.name,
          api_key: model.api_key,
          base_url: model.base_url
        };
      }
      
      // 如果没有默认模型，使用配置文件中的默认配置
      return {
        name: 'nano-banana',
        api_key: config.api.key,
        base_url: config.api.baseUrl
      };
    }
    
    const model = await aiModelService.getModelById(modelId);
    
    if (!model) {
      throw new Error('指定的图像模型不存在或已禁用');
    }
    
    return {
      name: model.name,
      api_key: model.api_key,
      base_url: model.base_url
    };
  } catch (error) {
    console.error('获取图像模型配置失败:', error);
    throw error;
  }
}

// 根据模型名称检测尺寸参数类型
function getSizeParameterName(modelName) {
  const name = modelName.toLowerCase();
  // doubao和seedream模型使用size参数
  if (name.includes('doubao') || name.includes('seedream')) {
    return 'size';
  }
  // gpt-image-1.5 使用size参数
  if (name.includes('gpt-image')) {
    return 'size';
  }
  // 其他模型默认使用aspect_ratio
  return 'aspect_ratio';
}

// 检测是否为Gemini原生模型（nano-banana / gemini系列）
function isGeminiNativeModel(modelName) {
  if (!modelName) return false;
  const name = modelName.toLowerCase();
  return name.includes('nano-banana') || name.includes('gemini');
}

// 检测是否为gpt-image模型
function isGptImageModel(modelName) {
  return modelName && modelName.toLowerCase().includes('gpt-image');
}

// 检测是否为Flux模型
function isFluxModel(modelName) {
  return modelName && modelName.toLowerCase().includes('flux');
}

// 验证并调整尺寸以满足模型要求
function validateAndAdjustSize(modelName, size) {
  const name = modelName.toLowerCase();

  // 豆包即梦4.5和5.0模型要求最小像素数
  if (name.includes('doubao-seedream-4-5') || name.includes('doubao-seedream-5-0')) {
    const MIN_PIXELS = 3686400; // 最小像素要求

    // 解析尺寸
    const sizeMatch = size.match(/^(\d+)x(\d+)$/);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1]);
      const height = parseInt(sizeMatch[2]);
      const pixels = width * height;

      if (pixels < MIN_PIXELS) {
        // 计算需要的缩放比例
        const scale = Math.sqrt(MIN_PIXELS / pixels);
        const newWidth = Math.ceil(width * scale);
        const newHeight = Math.ceil(height * scale);
        const adjustedSize = `${newWidth}x${newHeight}`;

        console.warn(`⚠️ 警告: ${modelName} 要求至少 ${MIN_PIXELS} 像素`);
        console.warn(`原始尺寸 ${size} (${pixels} 像素) 不满足要求`);
        console.warn(`自动调整为 ${adjustedSize} (${newWidth * newHeight} 像素)`);

        return adjustedSize;
      }
    }
  }

  return size;
}

// API服务
const apiService = {
  // Gemini 原生文生图
  async generateTextToImageGemini(params, modelConfig) {
    const endpoint = `/v1beta/models/${modelConfig.name}:generateContent`;
    const requestBody = {
      contents: [{ parts: [{ text: params.prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: params.size || '1:1'
        }
      }
    };

    if (params.imageSize) {
      requestBody.generationConfig.imageConfig.imageSize = params.imageSize;
    }

    console.log('Gemini 文生图请求:', { endpoint, model: modelConfig.name, size: params.size, imageSize: params.imageSize });

    const response = await axios.post(`${modelConfig.base_url}${endpoint}`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': modelConfig.api_key
      },
      timeout: 120000
    });

    return this.processGeminiResponse(response.data, params.userId);
  },

  // Gemini 原生图生图
  async generateImageToImageGemini(params, modelConfig, imageArray) {
    const parts = [{ text: params.prompt }];

    for (const imgData of imageArray) {
      let base64Data = imgData;
      let mimeType = 'image/jpeg';

      if (imgData.startsWith('data:')) {
        const match = imgData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        } else {
          base64Data = imgData.split(',')[1];
        }
      }

      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    const endpoint = `/v1beta/models/${modelConfig.name}:generateContent`;
    const requestBody = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: params.size || '1:1'
        }
      }
    };

    if (params.imageSize) {
      requestBody.generationConfig.imageConfig.imageSize = params.imageSize;
    }

    console.log('Gemini 图生图请求:', { endpoint, model: modelConfig.name, imageCount: imageArray.length, size: params.size, imageSize: params.imageSize });

    const response = await axios.post(`${modelConfig.base_url}${endpoint}`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': modelConfig.api_key
      },
      timeout: 120000
    });

    return this.processGeminiResponse(response.data, params.userId);
  },

  // 处理 Gemini 响应：提取 base64 图片并上传 OSS
  async processGeminiResponse(responseData, userId) {
    const candidates = responseData.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini 返回无有效候选结果');
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('Gemini 返回无有效内容');
    }

    for (const part of parts) {
      if (part.thought) continue;

      if (part.inlineData) {
        const { data: base64Data, mimeType } = part.inlineData;
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
        const ossKey = `gemini/${userId || 'anonymous'}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        try {
          const ossUrl = await ossManager.uploadBuffer(buffer, ossKey, mimeType || 'image/png');
          console.log('Gemini 图片已上传到 OSS:', ossUrl);
          return { data: [{ url: ossUrl }] };
        } catch (ossError) {
          console.error('OSS 上传失败，降级为 data URL:', ossError.message);
          const dataUrl = `data:${mimeType || 'image/png'};base64,${base64Data}`;
          return { data: [{ url: dataUrl }] };
        }
      }
    }

    const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
    throw new Error(`Gemini 未返回图片。模型回复: ${textParts.substring(0, 200)}`);
  },

  // 文生图API调用
  async generateTextToImage(params) {
    try {
      // 获取图像模型配置
      const modelConfig = await getImageModelConfig(params.modelId);

      // Gemini 原生模型走独立分支
      if (isGeminiNativeModel(modelConfig.name)) {
        return await this.generateTextToImageGemini(params, modelConfig);
      }

      // 创建动态API客户端
      const dynamicApiClient = axios.create({
        baseURL: modelConfig.base_url,
        headers: {
          'Authorization': `Bearer ${modelConfig.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      // 根据模型类型选择正确的尺寸参数名
      const sizeParamName = getSizeParameterName(modelConfig.name);

      // 验证并调整尺寸
      const adjustedSize = validateAndAdjustSize(modelConfig.name, params.size);

      // 检查是否为gpt-image或Flux模型，使用不同的API端点和请求格式
      if (isGptImageModel(modelConfig.name) || isFluxModel(modelConfig.name)) {
        // gpt-image-1.5 和 Flux 模型使用 /v1/chat/completions 端点
        const requestData = {
          model: modelConfig.name,
          messages: [
            {
              role: 'user',
              content: params.prompt
            }
          ],
          size: adjustedSize,
          response_format: {
            type: params.response_format || 'url'
          }
        };

        console.log('文生图请求参数 (gpt-image/Flux):', requestData);
        console.log('使用模型:', modelConfig.name);
        console.log('使用端点: /v1/chat/completions');
        if (adjustedSize !== params.size) {
          console.log('尺寸已调整:', params.size, '->', adjustedSize);
        }

        const response = await dynamicApiClient.post('/v1/chat/completions', requestData);

        console.log('文生图响应 (gpt-image):', response.data);

        // 详细输出 choices 内容以便调试
        if (response.data.choices && response.data.choices.length > 0) {
          console.log('choices[0] 完整内容:', JSON.stringify(response.data.choices[0], null, 2));
          console.log('message 内容:', JSON.stringify(response.data.choices[0].message, null, 2));

          // 从 message.content 中提取图片URL
          const content = response.data.choices[0].message.content;
          if (content) {
            // 尝试多种URL提取方式
            let imageUrl = null;

            // 方式1: 匹配 Markdown 图片格式 ![...](URL)
            const markdownImageMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            if (markdownImageMatch) {
              imageUrl = markdownImageMatch[1];
              console.log('从Markdown图片格式提取URL:', imageUrl);
            }

            // 方式2: 匹配下载链接格式 [下载⏬](URL)
            if (!imageUrl) {
              const downloadLinkMatch = content.match(/\[下载[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
              if (downloadLinkMatch) {
                imageUrl = downloadLinkMatch[1];
                console.log('从下载链接格式提取URL:', imageUrl);
              }
            }

            // 方式3: 匹配任何 https:// 开头的URL
            if (!imageUrl) {
              const urlMatch = content.match(/(https?:\/\/[^\s)]+\.(?:webp|jpg|jpeg|png|gif))/i);
              if (urlMatch) {
                imageUrl = urlMatch[1];
                console.log('从普通URL格式提取URL:', imageUrl);
              }
            }

            // 如果成功提取到URL，转换为标准格式
            if (imageUrl) {
              console.log('成功提取图片URL:', imageUrl);
              return {
                data: [{
                  url: imageUrl
                }]
              };
            } else {
              console.warn('未能从content中提取图片URL，content:', content.substring(0, 200));
            }
          }
        }

        return response.data;
      } else {
        // 其他模型使用标准的 /v1/images/generations 端点
        const requestData = {
          model: modelConfig.name,
          prompt: params.prompt,
          [sizeParamName]: adjustedSize, // 使用调整后的尺寸
          response_format: params.response_format || 'url'
        };

        console.log('文生图请求参数:', requestData);
        console.log('使用模型:', modelConfig.name);
        console.log('尺寸参数名:', sizeParamName);
        if (adjustedSize !== params.size) {
          console.log('尺寸已调整:', params.size, '->', adjustedSize);
        }

        const response = await dynamicApiClient.post('/v1/images/generations', requestData);

        console.log('文生图响应:', response.data);
        return response.data;
      }
    } catch (error) {
      console.error('文生图API调用失败:', error);
      throw new Error(error.response?.data?.error?.message || '文生图生成失败');
    }
  },

  // 图生图API调用（nano-banana使用JSON格式，支持url或b64_json）
  async generateImageToImageWithFile(params) {
    try {
      // 获取图像模型配置
      const modelConfig = await getImageModelConfig(params.modelId);

      console.log('使用模型:', modelConfig.name);

      // 检查是否有图片参数
      if (!params.image && (!params.images || params.images.length === 0)) {
        console.error('图生图API调用失败: 缺少图片参数');
        throw new Error('图生图模式需要提供参考图片');
      }

      // 将图片转换为base64或URL数组
      const fs = require('fs');
      const imageArray = [];

      // 支持多张图片上传
      // 将所有参考图都转换并传递，让用户可以在提示词中引用它们
      if (params.images && params.images.length > 0) {
        console.log(`处理 ${params.images.length} 张参考图...`);

        for (let index = 0; index < params.images.length; index++) {
          const image = params.images[index];

          if (!image) {
            console.warn(`跳过空图片 ${index + 1}`);
            continue;
          }

          // 如果图片有path属性，读取为base64
          if (image.path) {
            try {
              const imageBuffer = fs.readFileSync(image.path);
              const originalSize = imageBuffer.length;

              // 压缩图片以减小请求体大小
              let finalBuffer = imageBuffer;
              try {
                const sharp = require('sharp');
                const compressedBuffer = await sharp(imageBuffer)
                  .resize(1024, 1024, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .jpeg({
                    quality: 85,
                    progressive: true
                  })
                  .toBuffer();

                finalBuffer = compressedBuffer;
                console.log(`参考图 ${index + 1} 已压缩: ${originalSize} bytes → ${compressedBuffer.length} bytes (${Math.round((1 - compressedBuffer.length/originalSize) * 100)}% 减小)`);
              } catch (compressError) {
                console.warn(`参考图 ${index + 1} 压缩失败，使用原图:`, compressError.message);
              }

              const base64Image = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
              imageArray.push(base64Image);
              console.log(`参考图 ${index + 1} 已加载，Base64大小: ${Math.round(base64Image.length / 1024)}KB`);
            } catch (error) {
              console.error(`读取参考图 ${index + 1} 失败:`, error);
            }
          } else if (image.buffer) {
            // buffer格式，压缩后转base64
            try {
              const originalSize = image.buffer.length;
              let finalBuffer = image.buffer;

              try {
                const sharp = require('sharp');
                const compressedBuffer = await sharp(image.buffer)
                  .resize(1024, 1024, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .jpeg({
                    quality: 85,
                    progressive: true
                  })
                  .toBuffer();

                finalBuffer = compressedBuffer;
                console.log(`参考图 ${index + 1} 已压缩: ${originalSize} bytes → ${compressedBuffer.length} bytes (${Math.round((1 - compressedBuffer.length/originalSize) * 100)}% 减小)`);
              } catch (compressError) {
                console.warn(`参考图 ${index + 1} 压缩失败，使用原图:`, compressError.message);
              }

              const base64Image = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
              imageArray.push(base64Image);
              console.log(`参考图 ${index + 1} 已加载 (buffer)，Base64大小: ${Math.round(base64Image.length / 1024)}KB`);
            } catch (error) {
              console.error(`处理参考图 ${index + 1} 失败:`, error);
            }
          } else if (typeof image === 'string') {
            // 已经是URL或base64字符串
            imageArray.push(image);
            console.log(`参考图 ${index + 1} 已加载 (string)，大小: ${Math.round(image.length / 1024)}KB`);
          }
        }

        console.log(`共加载 ${imageArray.length} 张参考图用于生成`);
      } else if (params.image) {
        // 单图模式：向后兼容
        if (params.image.path) {
          try {
            const imageBuffer = fs.readFileSync(params.image.path);
            const base64Image = `data:${params.image.mimetype};base64,${imageBuffer.toString('base64')}`;
            imageArray.push(base64Image);
          } catch (error) {
            console.error('读取图片失败:', error);
          }
        } else if (params.image.buffer) {
          const base64Image = `data:${params.image.mimetype};base64,${params.image.buffer.toString('base64')}`;
          imageArray.push(base64Image);
        } else if (typeof params.image === 'string') {
          imageArray.push(params.image);
        }
      }

      if (imageArray.length === 0) {
        throw new Error('无法处理提供的图片');
      }

      // Gemini 原生模型走独立分支
      if (isGeminiNativeModel(modelConfig.name)) {
        return await this.generateImageToImageGemini(params, modelConfig, imageArray);
      }

      // 豆包即梦模型只支持单张参考图
      if (imageArray.length > 1 && (modelConfig.name.includes('doubao') || modelConfig.name.includes('seedream'))) {
        console.warn(`⚠️ 警告: ${modelConfig.name} 模型只支持单张参考图，将只使用第一张图片`);
      }

      // 根据模型类型选择正确的尺寸参数名
      const sizeParamName = getSizeParameterName(modelConfig.name);

      // 验证并调整尺寸
      const adjustedSize = validateAndAdjustSize(modelConfig.name, params.size);

      // 改进提示词，确保模型理解要使用参考图
      let enhancedPrompt = params.prompt;

      // 过滤可能触发内容审核的短语（针对Gemini）
      const sensitivePatterns = [
        { pattern: /legs spread apart/gi, replacement: 'legs positioned' },
        { pattern: /shooting upwards/gi, replacement: 'low angle view' },
        { pattern: /straddle/gi, replacement: 'sit on' }
      ];

      sensitivePatterns.forEach(({ pattern, replacement }) => {
        enhancedPrompt = enhancedPrompt.replace(pattern, replacement);
      });

      // 如果提示词中包含对参考图的引用（如"图一"、"图二"），添加更明确的指示
      if (imageArray.length > 1 && (enhancedPrompt.includes('图一') || enhancedPrompt.includes('图二'))) {
        enhancedPrompt = `[IMPORTANT: Use the reference images provided. ` +
                        `First image contains the primary subject, second image contains pose/style reference.] ` +
                        enhancedPrompt;
      } else if (imageArray.length === 1) {
        enhancedPrompt = `[Based on the reference image provided] ${enhancedPrompt}`;
      }

      console.log('原始提示词:', params.prompt);
      console.log('优化后提示词:', enhancedPrompt);

      // 根据API文档构建请求
      // 豆包即梦模型的图生图API只接受单个image字符串，不支持数组
      const requestData = {
        model: modelConfig.name,
        prompt: enhancedPrompt,
        [sizeParamName]: adjustedSize, // 使用调整后的尺寸
        response_format: params.response_format || 'url',
        image: imageArray[0] // 豆包即梦只支持单张参考图，使用第一张
      };

      console.log('图生图请求参数:', {
        model: requestData.model,
        prompt: requestData.prompt.substring(0, 100) + '...',
        [sizeParamName]: adjustedSize,
        response_format: requestData.response_format,
        imageCount: imageArray.length,
        imageSizes: imageArray.map((img, i) => `图${i+1}: ${Math.round(img.length/1024)}KB`),
        totalRequestSize: `${Math.round(JSON.stringify(requestData).length / 1024)}KB`
      });

      if (adjustedSize !== params.size) {
        console.log('尺寸已调整:', params.size, '->', adjustedSize);
      }

      // 检查请求体是否过大
      const requestSizeKB = JSON.stringify(requestData).length / 1024;
      if (requestSizeKB > 512) {
        console.warn(`⚠️ 警告: 请求体过大 (${Math.round(requestSizeKB)}KB)，可能导致API错误`);
      }

      // 根据模型类型选择不同的端点和请求格式
      let response;
      if (isGptImageModel(modelConfig.name) || isFluxModel(modelConfig.name)) {
        // gpt-image-1 和 Flux 模型使用 /v1/images/edits 端点，需要 multipart/form-data 格式
        console.log('使用 gpt-image/Flux 图生图端点: /v1/images/edits (multipart/form-data)');

        const FormData = require('form-data');
        const formData = new FormData();

        // 根据 API 文档添加必需参数
        formData.append('model', modelConfig.name);
        formData.append('prompt', enhancedPrompt);

        // 可选参数
        if (adjustedSize) {
          formData.append('size', adjustedSize);
        }

        // response_format 应该是简单字符串，不是对象
        formData.append('response_format', params.response_format || 'url');

        // 处理图片：将 base64 转换为 Buffer
        const imageData = imageArray[0];
        let imageBuffer;

        if (imageData.startsWith('data:')) {
          // 从 base64 data URL 中提取 buffer
          const base64Data = imageData.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
          // 如果是纯 base64 字符串
          imageBuffer = Buffer.from(imageData, 'base64');
        }

        // 添加图片文件到 FormData
        formData.append('image', imageBuffer, {
          filename: 'image.jpg',
          contentType: 'image/jpeg'
        });

        console.log('FormData 参数:', {
          model: modelConfig.name,
          prompt: enhancedPrompt.substring(0, 100) + '...',
          size: adjustedSize,
          imageSize: `${Math.round(imageBuffer.length / 1024)}KB`
        });

        // 创建支持 FormData 的 API 客户端
        const dynamicApiClient = axios.create({
          baseURL: modelConfig.base_url,
          headers: {
            'Authorization': `Bearer ${modelConfig.api_key}`,
            ...formData.getHeaders() // 自动设置正确的 Content-Type
          }
        });

        response = await dynamicApiClient.post('/v1/images/edits', formData);
      } else {
        // 其他模型使用 /v1/images/generations 端点，使用 JSON 格式
        console.log('使用标准图生图端点: /v1/images/generations');

        // 创建 JSON 格式的 API 客户端
        const dynamicApiClient = axios.create({
          baseURL: modelConfig.base_url,
          headers: {
            'Authorization': `Bearer ${modelConfig.api_key}`,
            'Content-Type': 'application/json'
          }
        });

        response = await dynamicApiClient.post('/v1/images/generations', requestData);
      }

      console.log('图生图响应:', response.data);
      console.log('使用的尺寸参数:', sizeParamName);
      return response.data;
    } catch (error) {
      console.error('图生图API调用失败:', error);
      console.error('错误详情:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code
      });
      throw new Error(error.response?.data?.error?.message || '图生图生成失败');
    }
  },

  // 查询gpt-image任务状态
  async queryGptImageTask(taskId, modelId) {
    try {
      // 获取图像模型配置
      const modelConfig = await getImageModelConfig(modelId);

      // 只有gpt-image模型支持任务查询
      if (!isGptImageModel(modelConfig.name)) {
        throw new Error('此模型不支持任务查询功能');
      }

      // 创建动态API客户端
      const dynamicApiClient = axios.create({
        baseURL: modelConfig.base_url,
        headers: {
          'Authorization': `Bearer ${modelConfig.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`查询 gpt-image 任务状态: ${taskId}`);
      const response = await dynamicApiClient.get(`/v1/images/tasks/${taskId}`);

      console.log('任务状态响应:', response.data);
      return response.data;
    } catch (error) {
      console.error('查询任务状态失败:', error);
      throw new Error(error.response?.data?.error?.message || '查询任务状态失败');
    }
  },

  // 批量生成图片（支持逐张回调）
  async generateMultipleImages(params, userId = null, onImageGenerated = null) {
    const { prompt, size, quantity, mode, image, images, modelId, imageSize } = params;
    const results = [];
    const originalUrls = []; // 存储原始URL用于后续转存
    let retryCount = 0; // 添加重试计数器
    const maxRetries = 2; // 最大重试次数

    console.log('批量生成图片参数:', {
      prompt: prompt?.substring(0, 50) + '...',
      size,
      quantity,
      mode,
      modelId,
      imageSize,
      hasImage: !!image,
      hasImages: images && images.length > 0,
      imageCount: images ? images.length : 0
    });

    for (let i = 0; i < quantity; i++) {
      let attempts = 0;
      let success = false;

      while (attempts <= maxRetries && !success) {
        try {
          // 如果是图生图模式且不是第一张，添加延迟避免API限制
          if (mode === 'image-to-image' && i > 0) {
            const delay = Math.min(1000 + i * 500, 3000); // 递增延迟，最多3秒
            console.log(`等待 ${delay}ms 后生成第 ${i + 1} 张图片...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          let result;

          if (mode === 'text-to-image') {
            result = await this.generateTextToImage({ prompt, size, modelId, imageSize, userId });
          } else {
            // 图生图模式，传递所有图片
            result = await this.generateImageToImageWithFile({
              prompt,
              size,
              image: image,  // 单张图片（向后兼容）
              images: images, // 多张图片
              modelId: modelId,
              imageSize,
              userId
            });
          }

          // 提取图片URL
          let imageUrl = null;
          if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            imageUrl = result.data[0].url;
          } else if (result.images && Array.isArray(result.images) && result.images.length > 0) {
            imageUrl = result.images[0].url;
          } else if (result.url) {
            imageUrl = result.url;
          }

          if (imageUrl) {
            const imageResult = {
              url: imageUrl,
              index: i + 1,
              timestamp: Date.now(),
              originalUrl: imageUrl // 始终保留模型返回的原始URL
            };

            // 如果有用户ID，改为「后台转存到OSS」
            // 前端先使用原始URL立即显示图片，转存由异步补偿服务处理
            if (userId) {
              // 检查是否已经是自己的OSS链接
              const isOwnOssUrl = imageUrl &&
                imageUrl.includes(`${config.oss.bucket}.${config.oss.region}.aliyuncs.com`);

              if (isOwnOssUrl) {
                // 已经是自己的OSS链接，不需要转存
                console.log(`第${i + 1}张图片已经是自己的OSS链接，跳过转存:`, imageUrl);
                imageResult.ossUrl = imageUrl;
                imageResult.isOwnOss = true;
              } else {
                // 标记需要后台转存，并推入OSS补偿队列
                imageResult.needsOssRetry = true;
                imageResult.ossRetryData = {
                  originalUrl: imageUrl,
                  userId: userId,
                  timestamp: Date.now()
                };

                try {
                  const redisClient = imageCacheService.redis.getClient();
                  if (redisClient && imageCacheService.redis.isConnectedToRedis()) {
                    await redisClient.lPush(
                      'oss:retry:queue',
                      JSON.stringify({
                        originalUrl: imageUrl,
                        userId: userId,
                        historyRecordId: null, // 稍后由ossRetryService.updateQueueHistoryId补充
                        timestamp: Date.now(),
                        retryCount: 0
                      })
                    );
                    console.log(`已将图片加入OSS转存队列: ${imageUrl.substring(0, 50)}...`);
                  } else {
                    console.warn('Redis未连接，无法将图片加入OSS转存队列');
                  }
                } catch (queueError) {
                  console.error('加入OSS转存队列失败:', queueError);
                }
              }
            }

            originalUrls.push(imageUrl);
            results.push(imageResult);
            success = true; // 标记成功

            // 每张图片生成完成后立即通知（使用原始URL立即更新前端UI）
            if (onImageGenerated) {
              await onImageGenerated(imageResult, i, quantity);
            }

            console.log(`生成第${i + 1}张图片成功:`, imageResult.url);
          } else {
            throw new Error('未能获取到生成的图片URL');
          }
        } catch (error) {
          attempts++;
          console.error(`生成第${i + 1}张图片失败 (尝试 ${attempts}/${maxRetries + 1}):`, error.message);
          console.error(`错误堆栈:`, error.stack);

          if (attempts > maxRetries) {
            // 达到最大重试次数，记录失败并继续下一张
            console.error(`生成第${i + 1}张图片失败，已达到最大重试次数`);

            // 添加失败记录到结果中
            const errorResult = {
              error: error.message,
              index: i + 1,
              timestamp: Date.now()
            };
            results.push(errorResult);

            // 通知失败
            if (onImageGenerated) {
              await onImageGenerated(errorResult, i, quantity);
            }
            break; // 跳出重试循环，继续下一张
          } else {
            // 等待后重试
            const retryDelay = attempts * 2000; // 重试延迟递增
            console.log(`等待 ${retryDelay}ms 后重试第${i + 1}张图片...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
    }

    // 注意：图片已在生成时逐张转存到OSS，这里不再需要批量转存

    return results;
  }
};

module.exports = apiService;
