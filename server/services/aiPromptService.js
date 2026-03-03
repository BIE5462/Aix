const axios = require('axios');

class AIPromptService {
  /**
   * 生成提示词
   * @param {Object} modelConfig - 模型配置
   * @param {String} userInput - 用户输入
   * @param {Number} count - 生成数量
   * @param {Array} conversationHistory - 会话历史 [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
   * @returns {Array} 生成的提示词数组
   */
  async generatePrompts(modelConfig, userInput, count, conversationHistory = []) {
    try {
      // 构造系统提示词
      const systemPrompt = `${modelConfig.role_content}

请根据用户的描述，生成${count}个适合AI图像生成的英文提示词。
要求：
1. 每个提示词都要详细、具体、富有表现力
2. 包含风格、光线、氛围等细节
3. 使用逗号分隔关键词
4. 返回JSON格式：{"prompts": ["prompt1", "prompt2", ...]}
5. 确保生成恰好${count}个不同的提示词`;

      console.log('[AI提示词服务] 开始生成提示词:', {
        model: modelConfig.model_name,
        userInput,
        count,
        conversationHistoryLength: conversationHistory.length
      });

      // 构建消息数组
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // 添加会话历史
      if (conversationHistory && conversationHistory.length > 0) {
        messages.push(...conversationHistory);
      }

      // 添加当前用户输入
      messages.push({ role: 'user', content: userInput });

      // 调用AI API
      const response = await axios.post(
        modelConfig.api_url,
        {
          model: modelConfig.model_name,
          messages: messages,
          temperature: 0.8,
          response_format: { type: 'json_object' } // 要求返回JSON
        },
        {
          headers: {
            'Authorization': `Bearer ${modelConfig.api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60秒超时
        }
      );

      // 打印完整响应以便调试
      console.log('[AI提示词服务] API完整响应:', JSON.stringify(response.data, null, 2));

      // 解析返回结果 - 处理不同的API响应格式
      let content;
      if (response.data.choices && response.data.choices[0]) {
        // OpenAI 格式
        content = response.data.choices[0].message.content;
      } else if (response.data.content && Array.isArray(response.data.content)) {
        // Anthropic 格式
        content = response.data.content[0].text;
      } else if (response.data.message) {
        // 其他可能的格式
        content = response.data.message;
      } else {
        throw new Error('无法识别的API响应格式');
      }

      console.log('[AI提示词服务] AI返回内容:', content);

      // 清理 Markdown 代码块标记（如果存在）
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7); // 移除 ```json
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3); // 移除 ```
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3); // 移除结尾的 ```
      }
      cleanedContent = cleanedContent.trim();

      const parsed = JSON.parse(cleanedContent);

      // 验证返回格式
      if (!parsed.prompts || !Array.isArray(parsed.prompts)) {
        throw new Error('AI返回格式错误：缺少prompts数组');
      }

      if (parsed.prompts.length === 0) {
        throw new Error('AI返回的提示词数量为0');
      }

      // 构造结构化输出
      // 处理两种格式：字符串数组或对象数组
      const structuredPrompts = parsed.prompts.slice(0, count).map((prompt, index) => {
        // 如果prompt是对象，提取其中的prompt字段
        const promptText = typeof prompt === 'object' && prompt.prompt
          ? prompt.prompt
          : prompt;

        return {
          index: index + 1,
          prompt: typeof promptText === 'string' ? promptText.trim() : String(promptText).trim()
        };
      });

      console.log('[AI提示词服务] 生成成功:', {
        count: structuredPrompts.length,
        prompts: structuredPrompts
      });

      return structuredPrompts;
    } catch (error) {
      console.error('[AI提示词服务] 生成失败:', error);

      // 处理不同类型的错误
      if (error.response) {
        // API返回错误
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.response.data?.message || '未知错误';
        throw new Error(`AI API错误 (${status}): ${message}`);
      } else if (error.code === 'ECONNABORTED') {
        // 超时错误
        throw new Error('请求超时，请稍后重试');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        // 网络错误
        throw new Error('无法连接到AI服务，请检查网络或API地址');
      } else {
        // 其他错误
        throw new Error(`生成失败: ${error.message}`);
      }
    }
  }

  /**
   * 调用LLM获取纯文本结果（用于优化和迭代）
   */
  async _callLLMText(modelConfig, messages) {
    const response = await axios.post(
      modelConfig.api_url,
      {
        model: modelConfig.model_name,
        messages,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${modelConfig.api_key}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    let content;
    if (response.data.choices && response.data.choices[0]) {
      content = response.data.choices[0].message.content;
    } else if (response.data.content && Array.isArray(response.data.content)) {
      content = response.data.content[0].text;
    } else if (response.data.message) {
      content = response.data.message;
    } else {
      throw new Error('无法识别的API响应格式');
    }

    return content.trim();
  }

  /**
   * 优化提示词
   * @param {Object} modelConfig - 模型配置
   * @param {String} templateId - 模板ID
   * @param {String} originalPrompt - 原始提示词
   * @returns {String} 优化后的提示词
   */
  async optimizePrompt(modelConfig, templateId, originalPrompt) {
    const promptTemplates = require('./promptTemplates');
    const template = promptTemplates.getTemplate(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    const userMessage = template.userPromptTemplate.replace('{{originalPrompt}}', originalPrompt);
    const messages = [
      { role: 'system', content: template.systemPrompt },
      { role: 'user', content: userMessage }
    ];

    console.log('[AI提示词服务] 优化提示词:', { templateId, originalPrompt: originalPrompt.substring(0, 50) });
    const result = await this._callLLMText(modelConfig, messages);
    console.log('[AI提示词服务] 优化完成:', { resultLength: result.length });
    return result;
  }

  /**
   * 迭代优化提示词
   * @param {Object} modelConfig - 模型配置
   * @param {String} templateId - 优化模板ID（会自动查找关联的迭代模板）
   * @param {String} lastOptimizedPrompt - 上次优化结果
   * @param {String} iterateInput - 迭代需求
   * @returns {String} 迭代后的提示词
   */
  async iteratePrompt(modelConfig, templateId, lastOptimizedPrompt, iterateInput) {
    const promptTemplates = require('./promptTemplates');
    let template = promptTemplates.getTemplate(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    if (!template.isIterate && template.iterateTemplateId) {
      template = promptTemplates.getTemplate(template.iterateTemplateId);
      if (!template) {
        throw new Error(`关联的迭代模板不存在: ${templateId}`);
      }
    }

    const userMessage = template.userPromptTemplate
      .replace('{{lastOptimizedPrompt}}', lastOptimizedPrompt)
      .replace('{{iterateInput}}', iterateInput);
    const messages = [
      { role: 'system', content: template.systemPrompt },
      { role: 'user', content: userMessage }
    ];

    console.log('[AI提示词服务] 迭代提示词:', { templateId, iterateInput: iterateInput.substring(0, 50) });
    const result = await this._callLLMText(modelConfig, messages);
    console.log('[AI提示词服务] 迭代完成:', { resultLength: result.length });
    return result;
  }

  /**
   * 验证模型配置
   * @param {Object} modelConfig - 模型配置
   * @returns {Boolean} 是否有效
   */
  validateModelConfig(modelConfig) {
    if (!modelConfig) {
      throw new Error('模型配置不能为空');
    }

    const requiredFields = ['model_name', 'api_url', 'api_key', 'role_content'];
    for (const field of requiredFields) {
      if (!modelConfig[field]) {
        throw new Error(`模型配置缺少必填字段: ${field}`);
      }
    }

    return true;
  }
}

module.exports = new AIPromptService();
