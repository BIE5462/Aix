<template>
  <div class="app-root">
    <!-- 左侧导航栏 -->
    <Sidebar
      :is-logged-in="isLoggedIn"
      :current-user="currentUser"
      :active-page="activePage"
      @navigate="handleNavigate"
      @login="showLoginDialog = true"
      @logout="handleLogout"
      @show-admin="showAdminDashboard = true"
      @recharge="showRechargeDialog = true"
    />

    <!-- 主内容区域 -->
    <div class="main-container">
      <!-- 社区首页 -->
      <CommunityHome
        v-if="activePage === 'home'"
        :is-logged-in="isLoggedIn"
        @use-template="handleUseTemplate"
        @need-login="showLoginDialog = true"
      />

      <!-- 提示词优化 -->
      <PromptOptimizer
        v-else-if="activePage === 'prompt-optimizer'"
        @fill-workspace="handleFillFromOptimizer"
        @fill-batch-prompts="handleFillBatchFromOptimizer"
      />

      <!-- 工作台（原有生成界面） -->
      <div v-else-if="activePage === 'workspace'" class="main-layout">
      <!-- 左侧面板：TAB切换 + 用户账户系统 -->
      <div class="left-panel">
        <!-- TAB切换区域 -->
        <div class="tab-section">
          <div class="tab-header">
            <el-tabs v-model="activeTab" class="left-tabs">
              <el-tab-pane label="我的提示词" name="prompts">
                <div class="tab-content">
                  <!-- 提示词管理按钮 -->
                  <div class="prompts-manage-header">
          <el-button 
            type="primary" 
                      size="small" 
                      @click="showPromptManager = true"
                      class="prompts-manage-btn"
                    >
                      <el-icon><Setting /></el-icon>
                      管理提示词
          </el-button>
        </div>

                  <!-- 提示词区域容器 -->
                  <div class="prompts-area-wrapper">
                    <!-- 提示词瀑布流列表 -->
                    <div class="prompts-waterfall-container">
                      <!-- 加载状态 -->
                      <div v-if="userPromptsLoading" class="loading-prompts">
                        <LoadingCard
                          title="加载提示词中..."
                          subtitle="正在获取您的个人提示词"
                          size="small"
                        />
                      </div>

                      <!-- 空状态 -->
                      <div v-else-if="userPrompts.length === 0" class="empty-prompts">
                        <el-icon size="48"><Document /></el-icon>
                        <p>暂无提示词</p>
              <el-button
                type="primary"
                size="small"
                @click="showPromptManager = true"
              >
                          管理提示词
              </el-button>
                      </div>

                      <!-- 提示词卡片列表 -->
                      <template v-else>
                        <div
                          v-for="userPrompt in displayedUserPrompts"
                          :key="userPrompt.id"
                          class="prompt-card-waterfall"
                          @click="selectUserPrompt(userPrompt)"
                        >
                          <div class="card-image-waterfall">
                            <img
                              v-if="userPrompt.referenceImage"
                              :src="userPrompt.referenceImage"
                              :alt="userPrompt.title"
                              @error="handleImageError"
                            />
                            <div v-else class="no-image-waterfall">
                              <el-icon size="24"><Picture /></el-icon>
                            </div>
                          </div>
                          <div class="card-content-waterfall">
                            <h4 class="card-title-waterfall">{{ userPrompt.title }}</h4>
                          </div>
                        </div>
                      </template>
                    </div>

                    <!-- 分页控件 - 固定在底部 -->
                    <div v-if="userPrompts.length > promptsPageSize" class="prompts-pagination-fixed">
                      <el-pagination
                        v-model:current-page="promptsCurrentPage"
                        :page-size="promptsPageSize"
                        :total="userPrompts.length"
                        layout="prev, pager, next, total"
                        small
                        background
                        @current-change="handlePromptsPageChange"
                      />
                    </div>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane label="生成历史" name="history">
                <div class="tab-content">
                  <HistoryPanel ref="historyPanelRef" @select-history="loadFromHistory" />
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </div>
      
      <!-- 中间控制面板 -->
      <div class="control-panel">
        <!-- 全局Tab切换 -->
        <el-tabs v-model="generationMode" class="global-mode-tabs">
          <el-tab-pane label="文生图" name="text-to-image"></el-tab-pane>
          <el-tab-pane label="图生图" name="image-to-image"></el-tab-pane>
          <el-tab-pane label="AI视频" name="image-to-video"></el-tab-pane>
        </el-tabs>

        <!-- 提示词输入 -->
        <div class="prompt-section">
          <div class="prompt-header">
            <!-- 模型选择和重置按钮 - 文生图和图生图 -->
            <div v-if="generationMode !== 'image-to-video'" style="display: flex; gap: 8px; align-items: center;">
              <el-select
                v-model="selectedModelId"
                placeholder="选择AI模型"
                size="small"
                @change="onModelChange"
                style="width: 200px"
              >
                <el-option
                  v-for="model in filteredAvailableModels"
                  :key="model.id"
                  :label="model.name"
                  :value="model.id"
                >
                  <div class="model-option">
                    <span class="model-name">{{ model.name }}</span>
                    <span v-if="model.is_default" class="default-tag">默认</span>
                  </div>
                </el-option>
              </el-select>
              <el-button @click="resetForm" size="small">重置</el-button>
              <el-button @click="showBatchPromptDialog = true" size="small" type="primary">批量输入</el-button>
            </div>
            <!-- 模型选择和重置按钮 - 视频模式 -->
            <div v-else style="display: flex; gap: 8px; align-items: center;">
              <el-select
                v-model="videoSelectedModelId"
                placeholder="选择视频模型"
                size="small"
                :loading="videoModelsLoading"
                style="width: 200px"
              >
                <el-option
                  v-for="model in videoModels"
                  :key="model.id"
                  :label="model.name"
                  :value="model.id"
                >
                  <div class="model-option">
                    <div class="model-name">{{ model.name }}</div>
                  </div>
                </el-option>
              </el-select>
              <el-button @click="resetVideoForm" size="small">重置</el-button>
            </div>
          </div>
          
          <!-- 文生图和图生图的提示词输入 -->
          <template v-if="generationMode === 'text-to-image' || generationMode === 'image-to-image'">
            <!-- 使用自定义多行标签输入组件 -->
            <MultilineTagInput
              ref="multilineTagInputRef"
              v-model="promptTags"
              placeholder="描述你想要生成的图像,例如:一只可爱的猫咪,柔软的毛发,大眼睛,阳光下微笑..."
              class="prompt-input-tag"
              :max-tags="20"
              :min-rows="3"
              :max-rows="6"
              :show-hint="true"
              separator=","
              :auto-convert-to-tags="false"
              :tag-mapping="tagMapping"
              @change="handlePromptChange"
            />
            <!-- 常用提示词 -->
            <div class="common-prompts">
              <div class="common-prompts-header">
                <div class="common-prompts-label">常用提示词：</div>
                <el-button 
                  size="small" 
                  type="primary" 
                  plain
                  @click="showCommonPromptsManager = true"
                  class="manage-prompts-btn"
                >
                  管理
                </el-button>
              </div>
              <div class="common-prompts-buttons">
                <el-button
                  v-for="commonPrompt in commonPrompts"
                  :key="commonPrompt.id"
                  size="small"
                  :type="selectedCommonPromptIds.has(commonPrompt.id) ? 'primary' : 'info'"
                  :plain="!selectedCommonPromptIds.has(commonPrompt.id)"
                  @click="addCommonPrompt(commonPrompt, commonPrompt.id)"
                  :class="{ 'selected-prompt': selectedCommonPromptIds.has(commonPrompt.id) }"
                >
                  {{ commonPrompt.name }}
                </el-button>
              </div>
            </div>
          </template>
          
          <!-- AI视频的提示词输入 -->
          <template v-else-if="generationMode === 'image-to-video'">
            <!-- 使用自定义多行标签输入组件 -->
            <MultilineTagInput
              ref="videoMultilineTagInputRef"
              v-model="videoPromptTags"
              placeholder="描述你想要生成的视频内容,例如:一只可爱的猫咪在草地上奔跑,阳光明媚,微风轻拂..."
              class="prompt-input-tag"
              :max-tags="20"
              :min-rows="3"
              :max-rows="6"
              :show-hint="true"
              separator=","
              :auto-convert-to-tags="false"
              :tag-mapping="videoTagMapping"
              @change="handleVideoPromptChange"
            />
            <!-- 视频常用提示词 -->
            <div class="common-prompts">
              <div class="common-prompts-header">
                <div class="common-prompts-label">视频常用提示词：</div>
                <el-button 
                  size="small" 
                  type="primary" 
                  plain
                  @click="showVideoPromptsManager = true"
                  class="manage-prompts-btn"
                >
                  管理
                </el-button>
              </div>
              <div class="common-prompts-buttons">
                <el-button
                  v-for="videoPrompt in videoCommonPrompts"
                  :key="videoPrompt.id"
                  size="small"
                  :type="selectedVideoPromptIds.has(videoPrompt.id) ? 'primary' : 'info'"
                  :plain="!selectedVideoPromptIds.has(videoPrompt.id)"
                  @click="addVideoCommonPrompt(videoPrompt, videoPrompt.id)"
                  :class="{ 'selected-prompt': selectedVideoPromptIds.has(videoPrompt.id) }"
                >
                  {{ videoPrompt.name }}
                </el-button>
              </div>
            </div>
          </template>

          <!-- 生成按钮 - 文生图和图生图模式 -->
          <div v-if="generationMode !== 'image-to-video'" class="prompt-action-buttons">
            <el-button
              type="primary"
              :loading="imageGenerateCooldown"
              @click="generateImage"
              :disabled="imageGenerateCooldown"
              size="default"
            >
              {{ imageGenerateCooldown ? '提交中...' : '生成图片' }}
            </el-button>
          </div>

          <!-- 生成按钮 - 视频模式 -->
          <div v-else class="prompt-action-buttons">
            <el-button
              type="primary"
              :loading="videoGenerateCooldown"
              @click="handleVideoGeneration"
              :disabled="!videoCanGenerate || videoGenerateCooldown"
              size="default"
            >
              <el-icon v-if="!videoGenerateCooldown"><VideoPlay /></el-icon>
              {{ videoGenerateCooldown ? '提交中...' : '开始生成视频' }}
            </el-button>
          </div>
        </div>

        <!-- 图生图模式下的图片上传 - 紧凑按钮式 -->
        <div v-if="generationMode === 'image-to-image'" class="settings-section vertical-layout compact-section">
          <div class="setting-item">
            <div class="image-upload-header-inline">
              <h3>参考图片</h3>
              <el-button 
                type="primary" 
                size="small" 
                :icon="Picture" 
                @click="showReferenceManager = true"
              >
                常用参考图
              </el-button>
            </div>
            
            <div class="reference-upload-compact">
              <!-- 上传按钮 -->
              <el-upload
                ref="uploadRef"
                :auto-upload="false"
                :on-change="handleImageChange"
                :show-file-list="false"
                accept="image/*"
                multiple
                class="compact-uploader"
              >
                <el-button size="small" :icon="Plus">上传参考图</el-button>
              </el-upload>
            </div>
            
            <!-- 已上传图片缩略图 -->
            <div v-if="uploadedImages.length > 0" class="uploaded-thumbnails-compact">
              <div
                v-for="(image, index) in uploadedImages"
                :key="image.id"
                class="thumbnail-item-compact"
                :class="{
                  'dragging': draggedImageIndex === index,
                  'drag-over': dropTargetIndex === index,
                  'loading': image.loading
                }"
                draggable="true"
                @dragstart="handleDragStart(index, $event)"
                @dragover.prevent="handleDragOver(index, $event)"
                @dragleave="handleDragLeave"
                @drop="handleDrop(index, $event)"
                @dragend="handleDragEnd"
              >
                <!-- 添加参考图序号标签 -->
                <div class="reference-number">参考图{{ index + 1 }}</div>

                <!-- 加载中占位符 -->
                <div v-if="image.loading" class="image-loading-placeholder">
                  <el-icon class="loading-spinner"><Loading /></el-icon>
                  <span class="loading-text">加载中...</span>
                </div>

                <!-- 图片 -->
                <img
                  v-else
                  :src="image.url"
                  :alt="image.name"
                  @click="handleThumbnailClick(image.id)"
                  style="cursor: pointer;"
                  title="点击替换图片"
                />

                <el-button
                  v-if="!image.loading"
                  type="danger"
                  size="small"
                  circle
                  class="remove-thumb-btn"
                  @click.stop="removeImage(image.id)"
                >
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
            </div>
            
            <!-- 常用参考图小图标 -->
            <div v-if="isLoadingReferenceImages || commonReferenceImages.length > 0" class="common-reference-icons-inline">
              <div class="icons-header-inline">
                <span>常用参考图</span>
                <div class="header-actions-inline">
                  <!-- 分类切换标签 -->
                  <div v-if="referenceCategories.length > 1" class="category-tabs-inline">
                    <div 
                      v-for="category in referenceCategories" 
                      :key="category.id"
                      class="category-tab-inline"
                      :class="{ active: activeReferenceCategoryId === category.id }"
                      @click="setActiveReferenceCategory(category.id)"
                    >
                      <span class="category-name">{{ category.name }}</span>
                      <span class="category-count">({{ getReferenceCategoryImageCount(category.id) }})</span>
                    </div>
                  </div>
                  <el-button 
                    v-if="commonReferenceImages.length > 16" 
                    size="small" 
                    type="text" 
                    @click="toggleReferenceIconsCollapse"
                    class="collapse-btn"
                  >
                    {{ isReferenceIconsCollapsed ? '展开' : '折叠' }}
                  </el-button>
                </div>
              </div>
              
              <!-- 加载动画 -->
              <div v-if="isLoadingReferenceImages" class="reference-loading">
                <el-icon class="is-loading" :size="24">
                  <Loading />
                </el-icon>
                <span>加载常用参考图中...</span>
              </div>
              
              <!-- 参考图网格 -->
              <div v-else class="icons-grid-inline" :class="{ collapsed: isReferenceIconsCollapsed }">
                <div
                  v-for="image in displayedReferenceImages"
                  :key="image.id"
                  class="reference-icon-inline"
                  draggable="true"
                  @click="insertCommonReferenceImage(image)"
                  @dragstart="handleCommonImageDragStart(image, $event)"
                  :title="`${image.originalName || image.filename}\n拖拽到上方缩略图可替换`"
                >
                  <img
                    :src="image.url"
                    :alt="image.originalName || image.filename"
                    @error="handleReferenceImageError($event, image)"
                    @load="handleReferenceImageLoad(image)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI视频模式下的输入控件 -->
        <div v-if="generationMode === 'image-to-video'" class="video-input-section">

          <!-- 图片上传区域 (仅在模型支持时显示) - 超紧凑模式 -->
          <div v-if="supportsFirstFrame || supportsLastFrame" class="settings-section vertical-layout compact-section">
            <div class="setting-item">
              <h3>上传图片</h3>
              <div class="video-upload-ultra-compact">
                <!-- 首帧图片 -->
                <div v-if="supportsFirstFrame" class="video-upload-item">
                  <label class="ultra-compact-label">首帧 <span v-if="firstFrameRequired" style="color: #f56c6c;">*</span></label>
                  <div v-if="firstFramePreview" class="ultra-compact-preview">
                    <img :src="firstFramePreview" alt="首帧" class="ultra-thumb" />
                    <el-button size="small" text @click="firstFrameFile = null; firstFramePreview = ''">
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                  <el-upload
                    v-else
                    class="ultra-compact-uploader"
                    :show-file-list="false"
                    :before-upload="handleFirstFrameUpload"
                    :accept="'image/*'"
                  >
                    <el-button size="small" :icon="Plus">上传</el-button>
                  </el-upload>
                </div>

                <!-- 互换按钮 -->
                <div v-if="supportsFirstFrame && supportsLastFrame && firstFramePreview && lastFramePreview" class="swap-button-container">
                  <el-button
                    size="small"
                    circle
                    @click="swapFirstLastFrames"
                    title="互换首尾帧"
                    class="swap-frames-btn"
                  >
                    <el-icon><SwitchButton /></el-icon>
                  </el-button>
                </div>

                <!-- 尾帧图片 -->
                <div v-if="supportsLastFrame" class="video-upload-item">
                  <label class="ultra-compact-label">尾帧</label>
                  <div v-if="lastFramePreview" class="ultra-compact-preview">
                    <img :src="lastFramePreview" alt="尾帧" class="ultra-thumb" />
                    <el-button size="small" text @click="lastFrameFile = null; lastFramePreview = ''">
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                  <el-upload
                    v-else
                    class="ultra-compact-uploader"
                    :show-file-list="false"
                    :before-upload="handleLastFrameUpload"
                    :accept="'image/*'"
                  >
                    <el-button size="small" :icon="Plus">上传</el-button>
                  </el-upload>
                </div>
              </div>
            </div>
          </div>

          <!-- 视频参数 - 紧凑横向布局 -->
          <div class="settings-section vertical-layout compact-section">
            <div class="setting-item">
              <h3>视频参数</h3>
              
              <!-- Sora2 专用参数 -->
              <div v-if="isSoraModel" class="params-compact-row">
                <div class="param-compact-col">
                  <label>时长</label>
                  <el-select v-model="videoDuration" placeholder="时长" size="small">
                    <el-option label="10秒" value="10" />
                    <el-option label="15秒" value="15" :disabled="!isSoraPro" />
                    <el-option label="25秒" value="25" :disabled="!isSoraPro" />
                  </el-select>
                  <div v-if="!isSoraPro && (videoDuration === '15' || videoDuration === '25')" class="param-hint-inline">
                    仅 Pro 支持
                  </div>
                </div>
                
                <div class="param-compact-col">
                  <label>宽高比</label>
                  <el-select v-model="videoAspectRatio" placeholder="比例" size="small">
                    <el-option label="横屏 (16:9)" value="16:9" />
                    <el-option label="竖屏 (9:16)" value="9:16" />
                  </el-select>
                </div>

                <div class="param-compact-col">
                  <label>HD 高清</label>
                  <el-switch 
                    v-model="videoHd" 
                    size="small"
                    :disabled="!isSoraPro || videoDuration === '25'"
                  />
                  <div v-if="!isSoraPro" class="param-hint-inline">
                    仅 Pro
                  </div>
                  <div v-else-if="videoDuration === '25'" class="param-hint-inline">
                    25秒不支持
                  </div>
                  <div v-else-if="videoHd" class="param-hint-inline">
                    +8分钟
                  </div>
                </div>
                
                <div class="param-compact-col">
                  <label>水印</label>
                  <el-switch v-model="videoWatermark" size="small" />
                </div>
              </div>

              <!-- 其他模型的通用参数 -->
              <div v-else class="params-compact-row">
                <div class="param-compact-col">
                  <label>时长</label>
                  <el-select v-model="videoDuration" placeholder="时长" size="small">
                    <el-option label="5秒" :value="5" />
                    <el-option label="10秒" :value="10" />
                  </el-select>
                </div>
                
                <div class="param-compact-col">
                  <label>分辨率</label>
                  <el-select v-model="videoResolution" placeholder="分辨率" size="small">
                    <el-option label="480p" value="480p" />
                    <el-option label="720p" value="720p" />
                    <el-option label="1080p" value="1080p" />
                  </el-select>
                </div>

                <div class="param-compact-col">
                  <label>宽高比</label>
                  <el-select v-model="videoRatio" placeholder="比例" size="small">
                    <el-option label="16:9" value="16:9" />
                    <el-option label="9:16" value="9:16" />
                    <el-option label="4:3" value="4:3" />
                    <el-option label="1:1" value="1:1" />
                    <el-option label="保持比例" value="keep_ratio" />
                  </el-select>
                </div>
              </div>
            </div>
          </div>

          <!-- Sora2 审查提示 -->
          <div v-if="isSoraModel" class="settings-section vertical-layout compact-section">
            <el-alert
              type="warning"
              :closable="false"
              show-icon
            >
              <template #title>
                <strong>⚠️ Sora2 重要提示</strong>
              </template>
              <div style="font-size: 12px; line-height: 1.6; margin-top: 4px;">
                <p style="margin: 4px 0; color: #E6A23C; font-weight: 600;">
                  <strong>❌ 严禁真人照片：</strong>图片中不能有真人或看起来像真人的图像
                </p>
                <p style="margin: 4px 0;">• 提示词不能包含暴力、色情、版权、活着的名人</p>
                <p style="margin: 4px 0;">• 生成结果会进行审查（可能在90%+时失败）</p>
                <p style="margin: 8px 0 4px 0;">
                  <strong>⏱️ 预计生成时间：</strong>
                </p>
                <p style="margin: 2px 0; padding-left: 16px;">
                  • 10秒视频：1-3分钟<br>
                  • 15秒视频：3-5分钟<br>
                  • 25秒视频：5-8分钟<br>
                  • HD高清模式：额外+8分钟
                </p>
                <p style="margin: 8px 0 4px 0; color: #00B8E6;">
                  <strong>💡 请耐心等待，系统会自动轮询直到完成（最长30分钟）</strong>
                </p>
              </div>
            </el-alert>
          </div>

          <!-- Sora2 角色客串功能 -->
          <div v-if="isSoraModel" class="settings-section vertical-layout compact-section">
            <el-collapse v-model="characterExpanded" class="advanced-collapse">
              <el-collapse-item name="character">
                <template #title>
                  <h3 class="collapse-title">🎭 角色客串（Character）</h3>
                </template>
                <div class="character-section">
                  <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    style="margin-bottom: 12px;"
                  >
                    <div style="font-size: 12px;">
                      <p style="margin: 4px 0;"><strong>💡 角色客串功能：</strong>从视频中提取角色，加入到新视频中</p>
                      <p style="margin: 4px 0;">• 可以提取宠物、物品等（不支持真人）</p>
                      <p style="margin: 4px 0;">• 需要提供包含角色的视频URL</p>
                      <p style="margin: 4px 0;">• 指定角色出现的时间范围（1-3秒）</p>
                    </div>
                  </el-alert>

                  <div class="character-input-group">
                    <div class="input-item">
                      <label>角色视频URL</label>
                      <el-input
                        v-model="characterVideoUrl"
                        placeholder="https://example.com/video.mp4"
                        size="small"
                        clearable
                      />
                    </div>

                    <div class="input-item">
                      <label>时间范围（秒）</label>
                      <div style="display: flex; gap: 8px; align-items: center;">
                        <el-input-number
                          v-model="characterStartTime"
                          :min="0"
                          :max="10"
                          :precision="1"
                          :step="0.1"
                          placeholder="开始"
                          size="small"
                          style="flex: 1;"
                        />
                        <span>-</span>
                        <el-input-number
                          v-model="characterEndTime"
                          :min="0"
                          :max="10"
                          :precision="1"
                          :step="0.1"
                          placeholder="结束"
                          size="small"
                          style="flex: 1;"
                        />
                      </div>
                      <div v-if="characterTimeRangeHint" class="param-hint-inline" style="margin-top: 4px;">
                        {{ characterTimeRangeHint }}
                      </div>
                    </div>
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>

          <!-- 高级选项 - 可折叠 -->
          <div v-if="isDoubaoModel || isVeoModel || isWanModel" class="settings-section vertical-layout compact-section">
            <el-collapse v-model="videoAdvancedExpanded" class="advanced-collapse">
              <el-collapse-item name="advanced">
                <template #title>
                  <h3 class="collapse-title">高级选项</h3>
                </template>
                <div class="advanced-options-compact">
                  <!-- 随机种子 -->
                  <div class="option-item-compact">
                    <label>随机种子（可选）</label>
                    <el-input-number
                      v-model="videoSeed"
                      :min="0"
                      :max="2147483647"
                      placeholder="留空随机"
                      size="small"
                      style="width: 100%"
                    />
                  </div>
                  
                  <!-- 豆包专用选项 -->
                  <div v-if="isDoubaoModel" class="option-checkboxes">
                    <el-checkbox v-model="videoWatermark">添加水印</el-checkbox>
                    <el-checkbox v-model="videoCameraFixed">固定摄像头</el-checkbox>
                    <el-checkbox v-model="videoReturnLastFrame">返回尾帧图像</el-checkbox>
                  </div>
                  
                  <!-- VEO3专用选项 -->
                  <div v-if="isVeoModel" class="option-checkboxes">
                    <el-checkbox v-model="videoEnhancePrompt">提示词优化</el-checkbox>
                    <el-checkbox v-model="videoEnableUpsample">分辨率提升</el-checkbox>
                  </div>
                  
                  <!-- Wan专用选项 -->
                  <template v-if="isWanModel">
                    <div class="option-checkboxes">
                      <el-checkbox v-model="videoWatermark">添加水印</el-checkbox>
                      <el-checkbox v-model="videoPromptExtend">提示词重写</el-checkbox>
                    </div>
                    
                    <div class="option-item-compact">
                      <label>负面提示词（可选）</label>
                      <el-input
                        v-model="videoNegativePrompt"
                        type="textarea"
                        :rows="2"
                        placeholder="不想出现的内容..."
                        size="small"
                      />
                    </div>
                    
                    <div class="option-item-compact">
                      <label>具体分辨率</label>
                      <el-select v-model="videoSize" placeholder="选择" size="small">
                        <el-option label="1920x1080 (16:9)" value="1920x1080" />
                        <el-option label="1080x1920 (9:16)" value="1080x1920" />
                        <el-option label="1440x1440 (1:1)" value="1440x1440" />
                        <el-option label="1280x720 (16:9)" value="1280x720" />
                        <el-option label="720x1280 (9:16)" value="720x1280" />
                      </el-select>
                    </div>
                  </template>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>


        <!-- 图片比例和生成数量 - 仅在非视频生成模式下显示 -->
        <div v-if="generationMode !== 'image-to-video'" class="settings-section vertical-layout">
          <div class="setting-item">
            <h3>{{ currentParamConfig.paramType === 'size' ? '图片尺寸' : '图片比例' }}</h3>
              <div class="ratio-selector">
                <div 
                  v-for="option in dynamicImageSizeOptions" 
                  :key="option.value"
                  class="ratio-option"
                  :class="{ active: imageSize === option.value }"
                  @click="imageSize = option.value"
                >
                  <div class="ratio-box" :class="getRatioClass(option.label)"></div>
                  <span class="ratio-text">{{ option.label }}</span>
                </div>
              </div>
          </div>

          <!-- 分辨率选择器 - 仅 Gemini 系列模型显示 -->
          <div v-if="currentParamConfig.imageSizeOptions" class="setting-item">
            <h3>图片分辨率</h3>
            <div class="tag-selector">
              <div
                v-for="option in currentParamConfig.imageSizeOptions"
                :key="option.value"
                class="tag-option"
                :class="{ active: imageResolution === option.value }"
                @click="imageResolution = option.value"
              >
                {{ option.label }}
              </div>
            </div>
          </div>
          
          <div class="setting-item">
            <h3>生成数量</h3>
              <div class="tag-selector">
                <div 
                  v-for="option in quantityOptions" 
                  :key="option.value"
                  class="tag-option"
                  :class="{ active: generateQuantity === option.value }"
                  @click="generateQuantity = option.value"
                >
                  {{ option.label }}
                </div>
              </div>
          </div>
        </div>
      </div>

      <!-- 右侧结果展示 -->
      <div class="result-panel">
        <!-- 图片生成模式：显示图片生成结果 -->
        <div>
          <div class="result-header">
          <h2>生成结果</h2>
            <div class="header-actions">
              <div class="auto-download-switch">
                <el-switch
                  v-model="autoDownloadEnabled"
                  active-text="自动下载"
                  inactive-text="手动下载"
                  size="small"
                  style="--el-switch-on-color: #67c23a; --el-switch-off-color: #dcdfe6;"
                />
              </div>
              <el-button
                v-if="hasAnyResults"
                class="download-all-btn"
                @click="downloadAllResults"
                :icon="Download"
                size="small"
                plain
              >
                一键下载全部
              </el-button>
              <el-button
                v-if="hasAnyResults"
                class="clear-results-btn"
                @click="clearAllResults"
                :icon="Delete"
                size="small"
                plain
              >
                清空结果
              </el-button>
            </div>
          </div>
          <div class="result-content">
          <!-- 空状态 -->
          <div v-if="generationBatches.length === 0" class="empty-result">
            <div class="empty-state">
              <div class="empty-icon-container">
                <el-icon class="empty-icon"><Picture /></el-icon>
                <div class="empty-decoration">
                  <div class="decoration-circle circle-1"></div>
                  <div class="decoration-circle circle-2"></div>
                  <div class="decoration-circle circle-3"></div>
                </div>
              </div>
              <h3 class="empty-title">等待生成</h3>
              <p class="empty-description">请在左侧输入提示词开始生成图片或视频</p>
            </div>
          </div>
          
          <!-- 批次容器 - 显示所有批次 -->
          <div v-else class="batches-container">
            <div 
              v-for="batch in generationBatches" 
              :key="batch.id"
              class="batch-card"
            >
              <!-- 批次头部 -->
              <div class="batch-header">
                <div class="batch-info">
                  <span class="batch-type">{{ batch.type === 'image' ? '图片生成' : '视频生成' }}</span>
                  <span v-if="getBatchModelName(batch)" class="batch-model-tag">{{ getBatchModelName(batch) }}</span>
                  <span class="batch-time">{{ formatTimestamp(batch.timestamp) }}</span>
                  <span class="batch-prompt" :title="batch.prompt">{{ batch.prompt.substring(0, 50) }}{{ batch.prompt.length > 50 ? '...' : '' }}</span>
                </div>
                <el-button 
                  size="small" 
                  @click="removeBatch(batch.id)"
                  :icon="Delete"
                >
                  清除
                </el-button>
              </div>

              <!-- 任务或结果展示 -->
              <div v-if="batch.status !== 'completed'" class="tasks-grid">
                <!-- 处理中时显示任务卡片或已完成的图片 -->
                <div 
                  v-for="task in batch.tasks" 
                  :key="task.id"
                  :class="{
                    'task-card': !task.imageUrl,
                    'task-pending': task.status === 'pending',
                    'task-processing': task.status === 'processing',
                    'task-completed': task.status === 'completed' && !task.imageUrl,
                    'task-failed': task.status === 'failed'
                  }"
                >
                  <!-- 如果任务已完成且有图片，显示图片 -->
                  <ImageCard
                    v-if="task.status === 'completed' && task.imageUrl"
                    :src="task.imageUrl"
                    :oss-url="task.ossUrl"
                    :original-url="task.originalUrl"
                    :alt="`生成的图片 ${task.index}`"
                    :prompt="batch.prompt"
                    :original-prompt="batch.originalPrompt"
                    :title="`生成的图片 ${task.index}`"
                    :subtitle="`实时生成`"
                    :meta="[batch.params?.size || imageSize, `${task.index}号`]"
                    :enable-cache="true"
                    :lazy="false"
                    :batch-id="batch.id"
                    :tags="batch.tags || []"
                    :selected-common-prompts="batch.selectedCommonPrompts || []"
                    :selected-reference-images="batch.selectedReferenceImages || []"
                    class="main-card"
                    @click="handleImageClick"
                    @download="handleImageDownload"
                    @add-to-prompts="handleAddToPrompts"
                    @preview="handleImagePreview"
                  />
                  
                  <!-- 否则显示任务状态卡片 -->
                  <div v-else class="task-content">
                    <!-- 任务状态图标 -->
                    <div class="task-icon">
                      <el-icon v-if="task.status === 'pending'" class="pending-icon"><Clock /></el-icon>
                      <el-icon v-else-if="task.status === 'processing'" class="processing-icon"><Loading /></el-icon>
                      <el-icon v-else-if="task.status === 'failed'" class="failed-icon"><Close /></el-icon>
                    </div>
                    
                    <!-- 任务信息 -->
                    <div class="task-info">
                      <h4>任务 {{ task.index }}</h4>
                      <p v-if="task.status === 'pending'">等待开始</p>
                      <p v-else-if="task.status === 'processing'">生成中...</p>
                      <p v-else-if="task.status === 'failed'" class="error-message">{{ getSimplifiedError(task.error) }}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-else class="results-grid">
                <!-- 完成时显示结果 -->
                <template v-for="result in batch.results" :key="result.url || result.id || `result-${result.timestamp}-${result.index}`">
                  <!-- 视频结果 - 缩略图模式，点击打开预览 -->
                  <div v-if="result.isVideo" class="video-card video-card-thumbnail" @click="openVideoPreview(result)">
                    <!-- 使用静态缩略图代替视频元素，避免内存占用 -->
                    <div class="video-thumbnail-container">
                      <img
                        v-if="result.thumbnail"
                        :src="result.thumbnail"
                        class="video-thumbnail-image"
                        alt="视频缩略图"
                        loading="lazy"
                      />
                      <div v-else class="video-thumbnail-placeholder">
                        <el-icon class="video-placeholder-icon"><VideoPlay /></el-icon>
                      </div>
                      <!-- 播放按钮覆盖层 -->
                      <div class="video-play-overlay">
                        <el-icon class="play-icon"><VideoPlay /></el-icon>
                        <span class="play-text">点击播放</span>
                      </div>
                    </div>
                    <div class="video-info">
                      <div class="info-item"><strong>时长:</strong> {{ result.duration }}秒</div>
                      <div class="info-item"><strong>分辨率:</strong> {{ result.resolution }}</div>
                      <div class="info-item"><strong>比例:</strong> {{ result.ratio }}</div>
                      <div class="info-item" v-if="result.seed"><strong>种子:</strong> {{ result.seed }}</div>
                    </div>
                    <div class="video-actions">
                      <el-button type="primary" size="small" @click.stop="downloadVideo(result.url)">
                        <el-icon><Download /></el-icon> 下载视频
                      </el-button>
                    </div>
                  </div>
                  
                  <!-- 图片结果 -->
                  <ImageCard
                    v-else
                    :src="result.url"
                    :oss-url="result.oss_url || result.ossUrl"
                    :original-url="result.originalUrl || result.url"
                    :alt="`生成的图片 ${result.index || ''}`"
                    :prompt="batch.prompt"
                    :original-prompt="batch.originalPrompt"
                    :title="`生成的图片 ${result.index || ''}`"
                    :subtitle="formatImageTime(result.timestamp)"
                    :meta="[batch.params.size || imageSize, `${result.index || ''}号`]"
                    :badges="getImageBadges(result)"
                    :enable-cache="true"
                    :lazy="true"
                    :batch-id="batch.id"
                    :tags="batch.tags || []"
                    :selected-common-prompts="batch.selectedCommonPrompts || []"
                    :selected-reference-images="batch.selectedReferenceImages || []"
                    class="main-card"
                    @click="handleImageClick"
                    @download="handleImageDownload"
                    @add-to-prompts="handleAddToPrompts"
                    @preview="handleImagePreview"
                  />
                </template>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示词管理对话框 -->
    <PromptManager
      v-model="showPromptManager"
      @select-prompt="handleSelectPrompt"
      @prompts-updated="handleUserPromptsUpdated"
    />

    <!-- 批量输入提示词对话框 -->
    <el-dialog
      v-model="showBatchPromptDialog"
      title="批量输入提示词"
      width="700px"
    >
      <div class="batch-prompt-container">
        <div class="batch-prompt-header">
          <span>当前参数将应用于所有提示词</span>
          <div class="batch-header-actions">
            <el-button
              v-if="lastBatchPrompts.length > 0"
              size="small"
              type="success"
              plain
              @click="loadLastBatchPrompts"
            >
              加载上一次批量输入
            </el-button>
            <el-button
              size="small"
              type="primary"
              plain
              @click="showBatchPromptHistoryPanel = true"
            >
              从历史记录加载
            </el-button>
            <el-tag type="info">最多输入10个提示词</el-tag>
          </div>
        </div>

        <div class="batch-inputs">
          <div
            v-for="(prompt, index) in batchPrompts"
            :key="index"
            class="batch-input-item"
          >
            <span class="batch-number">{{ index + 1 }}</span>
            <el-input
              v-model="batchPrompts[index]"
              :placeholder="`输入第 ${index + 1} 个提示词...`"
              clearable
            />
          </div>
        </div>

        <div class="batch-tips">
          <el-icon><InfoFilled /></el-icon>
          <span>提示：这些提示词将使用相同的参数和参考图依次生成</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="showBatchPromptDialog = false">取消</el-button>
        <el-button type="primary" @click="handleBatchGenerate">
          开始批量生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 视频常用提示词管理对话框 -->
    <CommonPromptsManager 
      v-model="showVideoPromptsManager" 
      prompt-type="video"
      @prompts-updated="handleVideoCommonPromptsUpdated"
    />


    <!-- 常用参考图管理对话框 -->
    <el-dialog v-model="showReferenceManager" width="98%" :close-on-click-modal="false" :show-header="false">
      
      <ReferenceImageManager
        @select-images="handleReferenceImageSelect"
        @close="handleReferenceImageCancel"
        @images-updated="handleReferenceImagesUpdated"
      />
    </el-dialog>

    <!-- 常用提示词管理对话框 -->
    <CommonPromptsManager
      v-model="showCommonPromptsManager"
      @prompts-updated="handleCommonPromptsUpdated"
    />

    <!-- 批量输入历史面板 -->
    <BatchPromptHistoryPanel
      v-model:visible="showBatchPromptHistoryPanel"
      @load-prompts="handleLoadBatchPromptHistory"
    />

    <!-- 管理员控制台对话框 -->
    <el-dialog 
      v-model="showAdminDashboard" 
      title="管理员控制台" 
      width="95%" 
      :close-on-click-modal="false"
      :show-close="true"
    >
      <AdminDashboard :current-user="currentUser" />
    </el-dialog>

    <!-- 自定义图片预览弹窗 -->
    <div v-if="showImageModal" class="image-modal" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <!-- 关闭按钮 -->
        <button class="close-btn" @click="closeImageModal">
          <el-icon><Close /></el-icon>
        </button>
        
        <!-- 图片容器 -->
        <div class="image-container">
          <img 
            :src="currentPreviewImage" 
            :alt="currentPreviewTitle"
            class="preview-image"
            :style="{ transform: `scale(${imageScale}) rotate(${imageRotation}deg)` }"
            @wheel="handleImageWheel"
            @mousedown="startDrag"
            @mousemove="handleDrag"
            @mouseup="endDrag"
            @mouseleave="endDrag"
          />
        </div>
        
        <!-- 控制栏 -->
        <div class="image-controls">
          <!-- 导航按钮 -->
          <div class="nav-controls">
            <button 
              class="nav-btn prev-btn" 
              @click="prevImage"
              :disabled="currentImageIndex === 0"
            >
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="image-counter">{{ currentImageIndex + 1 }} / {{ currentBatchImages.length }}</span>
            <button 
              class="nav-btn next-btn" 
              @click="nextImage"
              :disabled="currentImageIndex === currentBatchImages.length - 1"
            >
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
          
          <!-- 缩放和旋转控制 -->
          <div class="zoom-controls">
            <button class="control-btn" @click="zoomOut" title="缩小">
              <el-icon><ZoomOut /></el-icon>
            </button>
            <button class="control-btn" @click="resetZoom" title="重置">
              <el-icon><Refresh /></el-icon>
            </button>
            <button class="control-btn" @click="zoomIn" title="放大">
              <el-icon><ZoomIn /></el-icon>
            </button>
            <button class="control-btn" @click="rotateLeft" title="左旋转">
              <el-icon><RefreshLeft /></el-icon>
            </button>
            <button class="control-btn" @click="rotateRight" title="右旋转">
              <el-icon><RefreshRight /></el-icon>
            </button>
          </div>
          
          <!-- 操作按钮组 -->
          <div class="action-buttons-group">
            <!-- 再次修改按钮 -->
            <button class="action-btn edit-again-btn" @click="handleEditAgain" title="将图片发送到图生图进行修改">
              <el-icon><Edit /></el-icon>
              <span>再次修改</span>
            </button>

            <!-- 生成视频按钮 -->
            <button class="action-btn generate-video-btn" @click="handleGenerateVideo" title="使用此图片生成视频">
              <el-icon><VideoCamera /></el-icon>
              <span>生成视频</span>
            </button>

            <!-- 下载按钮 -->
            <button class="action-btn download-btn" @click="downloadCurrentImage" title="下载当前图片">
              <el-icon><Download /></el-icon>
              <span>下载</span>
            </button>

            <!-- 保存为提示词按钮 -->
            <button class="action-btn save-prompt-btn" @click="saveCurrentImageAsPrompt" title="保存为提示词">
              <el-icon><Document /></el-icon>
              <span>保存提示词</span>
            </button>
          </div>
        </div>
      </div>
  </div>

  <!-- 视频预览弹窗 -->
  <div v-if="showVideoModal" class="video-modal" @click="closeVideoModal">
    <div class="video-modal-content" @click.stop>
      <!-- 关闭按钮 -->
      <button class="close-btn" @click="closeVideoModal">
        <el-icon><Close /></el-icon>
      </button>

      <!-- 视频容器 -->
      <div class="video-container">
        <video
          ref="previewVideoElement"
          :src="currentPreviewVideo.url"
          controls
          autoplay
          class="preview-video"
          @loadeddata="handleVideoLoadedData"
        >
          您的浏览器不支持视频播放
        </video>
      </div>
      
      <!-- 视频信息 -->
      <div class="video-modal-info">
        <div class="info-row" v-if="currentPreviewVideo.duration">
          <strong>时长:</strong> {{ currentPreviewVideo.duration }}秒
        </div>
        <div class="info-row" v-if="currentPreviewVideo.resolution">
          <strong>分辨率:</strong> {{ currentPreviewVideo.resolution }}
        </div>
        <div class="info-row" v-if="currentPreviewVideo.ratio">
          <strong>比例:</strong> {{ currentPreviewVideo.ratio }}
        </div>
      </div>
      
      <!-- 下载按钮 -->
      <button class="download-btn-video" @click="downloadVideo(currentPreviewVideo.url)" title="下载视频">
        <el-icon><Download /></el-icon>
        <span>下载视频</span>
      </button>
    </div>
  </div>

    <!-- 登录对话框 -->
    <LoginDialog
      v-model="showLoginDialog"
      @login-success="handleLoginSuccess"
    />

    <!-- 充值弹窗 -->
    <RechargeDialog
      v-model="showRechargeDialog"
      :current-balance="userCredits"
      @success="handleRechargeSuccess"
    />

    </div><!-- main-container 结束 -->
  </div><!-- app-root 结束 -->
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox, ElSwitch } from 'element-plus'
import { Clock, Plus, Picture, Loading, Download, Collection, Close, ArrowLeft, ArrowRight, ZoomOut, ZoomIn, Refresh, RefreshLeft, RefreshRight, MoreFilled, SwitchButton, Document, Edit, VideoPlay, VideoCamera, Delete, Check, InfoFilled, Setting } from '@element-plus/icons-vue'
import Sidebar from './components/Sidebar.vue'
import CommunityHome from './components/CommunityHome.vue'
import LoginDialog from './components/LoginDialog.vue'
import RechargeDialog from './components/RechargeDialog.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import PromptManager from './components/PromptManager.vue'
import ReferenceImageManager from './components/ReferenceImageManager.vue'
import CommonPromptsManager from './components/CommonPromptsManager.vue'
import ImageCard from './components/ImageCard.vue'
import { clearAllUserCache } from './utils/cacheUtils'
import LoadingCard from './components/LoadingCard.vue'
import MultilineTagInput from './components/MultilineTagInput.vue'
import AdminDashboard from './components/AdminDashboard.vue'
import AIPromptGenerator from './components/AIPromptGenerator.vue'
import BatchPromptHistoryPanel from './components/BatchPromptHistoryPanel.vue'
import PromptOptimizer from './components/PromptOptimizer.vue'
import { generateImages, getGenerationResult, getAvailableModels } from './api/imageApi'
import { generateVideo, getVideoResult, getVideoGenerationStatus, getVideoModels } from './api/videoApi'

// 页面导航状态
// 从localStorage恢复页面状态，如果没有则使用默认值 'home'
const activePage = ref(localStorage.getItem('activePage') || 'home') // 'home', 'workspace', 'history'

// 认证相关数据
const isLoggedIn = ref(false)
const currentUser = ref(null)
const showAdminDashboard = ref(false)

// 响应式数据
// 从localStorage恢复生成模式，如果没有则使用默认值
const generationMode = ref(localStorage.getItem('generationMode') || 'text-to-image')
const prompt = ref('') // 提示词（保持向后兼容）
const promptTags = ref([]) // 提示词标签数组
const multilineTagInputRef = ref() // 多行标签输入组件引用

// 视频提示词相关数据
const videoPromptTags = ref([]) // 视频提示词标签数组
const videoMultilineTagInputRef = ref() // 视频多行标签输入组件引用
const videoCommonPrompts = ref([]) // 视频常用提示词列表
const selectedVideoPromptIds = ref(new Set()) // 选中的视频常用提示词ID集合
const videoTagMapping = ref({}) // 视频标签映射
const showVideoPromptsManager = ref(false) // 视频提示词管理器显示状态
const imageSize = ref('1024x1792')
const imageResolution = ref('1K')
const generateQuantity = ref(1)

// 模型选择相关
const availableModels = ref([])
const selectedModelId = ref(null)

// 视频生成相关数据
const videoModels = ref([])
const videoSelectedModelId = ref(null)
const videoModelsLoading = ref(false)
const videoModelsLoaded = ref(false)
const firstFrameFileList = ref([])
const lastFrameFileList = ref([])
const videoAutoDownload = ref(true)
const imageTypes = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'

// 新增的视频相关变量
const firstFrameFile = ref(null)
const firstFramePreview = ref('')
const lastFrameFile = ref(null)
const lastFramePreview = ref('')
const videoDuration = ref(5)
const videoResolution = ref('720p')
const videoRatio = ref('16:9')
const videoWatermark = ref(false)
const videoCameraFixed = ref(false)
const videoReturnLastFrame = ref(false)
const videoSeed = ref(null)
// VEO3专用参数
const videoEnhancePrompt = ref(true)
// 高级选项折叠控制
const videoAdvancedExpanded = ref([])
const videoEnableUpsample = ref(false)
// Wan专用参数
const videoNegativePrompt = ref('')
const videoPromptExtend = ref(false)
const videoSize = ref('1920x1080') // Wan使用具体分辨率
// Sora2专用参数
const videoHd = ref(false) // HD 高清模式
const videoAspectRatio = ref('16:9') // 宽高比
// Sora2角色客串
const characterExpanded = ref([])
const characterVideoUrl = ref('')
const characterStartTime = ref(null)
const characterEndTime = ref(null)

// 标签映射对象：将标签显示文本映射到实际的提示词内容
// 这个映射会从数据库中的常用提示词动态更新
const tagMapping = ref({})

// Provider parameter configuration
const providerConfig = {
  doubao: {
    paramType: 'size',
    options: [
      { label: '512x512', value: '512x512' },
      { label: '1024x1024', value: '1024x1024' },
      { label: '1792x1024 (横图)', value: '1792x1024' },
      { label: '1024x1792 (竖图)', value: '1024x1792' },
      { label: '1488x2079 (竖图)', value: '1488x2079' },
      { label: '1920x1920 (高清)', value: '1920x1920' },
      { label: '2048x2048 (超清)', value: '2048x2048' },
      { label: '2560x1440 (2K横图)', value: '2560x1440' },
      { label: '1440x2560 (2K竖图)', value: '1440x2560' },
      { label: '2K', value: '2K' }
    ]
  },
  'nano-banana': {
    paramType: 'aspect_ratio',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '4:3', value: '4:3' },
      { label: '3:4', value: '3:4' },
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
      { label: '2:3', value: '2:3' },
      { label: '3:2', value: '3:2' },
      { label: '4:5', value: '4:5' },
      { label: '5:4', value: '5:4' },
      { label: '21:9', value: '21:9' },
      { label: '1:4', value: '1:4' },
      { label: '4:1', value: '4:1' },
      { label: '1:8', value: '1:8' },
      { label: '8:1', value: '8:1' }
    ],
    imageSizeOptions: [
      { label: '标准 (1K)', value: '1K' },
      { label: '高清 (2K)', value: '2K' },
      { label: '超清 (4K)', value: '4K' }
    ]
  },
  qianwen: {
    paramType: 'aspect_ratio',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '21:9', value: '21:9' },
      { label: '16:9', value: '16:9' },
      { label: '4:3', value: '4:3' },
      { label: '3:2', value: '3:2' },
      { label: '2:3', value: '2:3' },
      { label: '3:4', value: '3:4' },
      { label: '9:16', value: '9:16' },
      { label: '9:21', value: '9:21' }
    ]
  },
  kuaishou: {
    paramType: 'aspect_ratio',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' },
      { label: '4:3', value: '4:3' },
      { label: '3:4', value: '3:4' },
      { label: '3:2', value: '3:2' },
      { label: '2:3', value: '2:3' }
    ]
  },
  default: {
    paramType: 'aspect_ratio',
    options: [
      { label: '1:1', value: '1:1' },
      { label: '16:9', value: '16:9' },
      { label: '9:16', value: '9:16' }
    ]
  }
}

// Detect provider from model name
const detectProvider = (modelName) => {
  if (!modelName) return 'default'
  const name = modelName.toLowerCase()
  if (name.includes('doubao') || name.includes('seedream')) return 'doubao'
  if (name.includes('nano-banana') || name.includes('gemini')) return 'nano-banana'
  if (name.includes('qwen')) return 'qianwen'
  if (name.includes('kling')) return 'kuaishou'
  return 'default'
}

// Current provider computed property
const currentProvider = computed(() => {
  const model = availableModels.value.find(m => m.id === selectedModelId.value)
  return detectProvider(model?.name)
})

// Current parameter configuration
const currentParamConfig = computed(() => {
  return providerConfig[currentProvider.value] || providerConfig.default
})

// Dynamic image size options based on provider
const dynamicImageSizeOptions = computed(() => {
  return currentParamConfig.value.options
})

// 🔧 新增：根据生成模式过滤可用模型
const filteredAvailableModels = computed(() => {
  const mode = generationMode.value
  
  // 如果是视频生成模式，返回空数组（视频有自己的模型列表）
  if (mode === 'image-to-video') {
    return []
  }
  
  // 过滤模型：只显示支持当前模式的模型
  return availableModels.value.filter(model => {
    const supportedModes = model.supported_modes || 'both'
    
    // 'both' 表示同时支持文生图和图生图
    if (supportedModes === 'both') {
      return true
    }
    
    // 'text-to-image' 只在文生图模式显示
    if (supportedModes === 'text-to-image' && mode === 'text-to-image') {
      return true
    }
    
    // 'image-to-image' 只在图生图模式显示
    if (supportedModes === 'image-to-image' && mode === 'image-to-image') {
      return true
    }
    
    return false
  })
})

  // 图片比例选项 (保留用于向后兼容)
  const imageSizeOptions = ref([
    { label: '1:1', value: '1024x1024' },
    { label: '16:9 (横图)', value: '1792x1024' },
    { label: '9:16 (竖图)', value: '1024x1792' }
  ])

  // 生成数量选项
  const quantityOptions = ref([
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
    { label: '5', value: 5 },
    { label: '6', value: 6 },
    { label: '7', value: 7 },
    { label: '8', value: 8 }
  ])
const uploadedImages = ref([]) // 改为数组支持多张图片
const generatedImages = ref([]) // 保留用于向后兼容
const isGenerating = ref(false)

// 批次管理系统（支持并发生成）
const generationBatches = ref([]) // 生成批次数组，每个批次包含多个任务
// 批次对象结构: {
//   id: string,
//   type: 'image' | 'video',
//   timestamp: Date,
//   status: 'pending' | 'processing' | 'completed' | 'failed',
//   tasks: [...],
//   results: [...],
//   prompt: string,
//   params: {...}
// }
const generationTasks = ref([]) // 保留用于向后兼容
const completedTasks = ref(0) // 已完成的任务数量

// 轮询控制器 - 用于在组件卸载时取消所有进行中的轮询
const pollingController = ref({ cancelled: false })
// 最大批次数量限制，防止内存无限增长
const MAX_BATCHES = 30

// 按钮冷却时间（防止误触）
const imageGenerateCooldown = ref(false)
const videoGenerateCooldown = ref(false)
const showHistory = ref(false)
const showPromptManager = ref(false)
const showReferenceManager = ref(false)
const showCommonPromptsManager = ref(false)
const showAddPromptDialog = ref(false)

// 批量输入相关
const showBatchPromptDialog = ref(false)
const batchPrompts = ref(Array(10).fill(''))
const lastBatchPrompts = ref([]) // 保存上一次的批量输入
const showBatchPromptHistoryPanel = ref(false) // 批量输入历史面板

// 提示词分页相关
const promptsCurrentPage = ref(1)
const promptsPageSize = ref(12) // 每页显示12个提示词
// 从localStorage恢复左侧标签页，如果没有则使用默认值
const savedTab = localStorage.getItem('activeTab')
const activeTab = ref(savedTab === 'ai-prompts' ? 'prompts' : (savedTab || 'prompts'))
const uploadRef = ref()
const historyPanelRef = ref()
const uploadedFiles = ref([]) // 保存上传的文件引用数组
const commonReferenceImages = ref([]) // 常用参考图列表
const isReferenceIconsCollapsed = ref(false) // 常用参考图折叠状态
const isLoadingReferenceImages = ref(false) // 常用参考图加载状态
const recentUsedImages = ref([]) // 最近使用的参考图
const referenceCategories = ref([
  { id: 'all', name: '全部' }
]) // 参考图分类列表
const SYSTEM_REFERENCE_CATEGORY_NAMES = new Set(['默认分类', '榛樿鍒嗙被'])
const activeReferenceCategoryId = ref('all') // 当前活动的参考图分类
const commonPrompts = ref([]) // 常用提示词列表
const userPrompts = ref([]) // 用户提示词列表
const userPromptsLoading = ref(false) // 用户提示词加载状态
const selectedCommonPromptIds = ref(new Set()) // 选中的常用提示词ID集合
const isUpdatingFromDelete = ref(false) // 标记是否正在从删除操作更新状态

// 计算属性：当前页显示的提示词
const displayedUserPrompts = computed(() => {
  const start = (promptsCurrentPage.value - 1) * promptsPageSize.value
  const end = start + promptsPageSize.value
  return userPrompts.value.slice(start, end)
})
const autoDownloadEnabled = ref(true) // 自动下载开关状态，默认开启

// 参考图拖拽和替换状态
const draggedImageIndex = ref(null) // 正在拖拽的图片索引
const dropTargetIndex = ref(null) // 拖拽目标位置索引
const replacingImageId = ref(null) // 正在替换的图片ID
const draggedCommonImageId = ref(null) // 正在拖拽的常用参考图ID

// 图片预览弹窗状态
const showImageModal = ref(false)
const currentPreviewImage = ref('')
const currentPreviewTitle = ref('')
const currentImageIndex = ref(0)
const currentViewingBatchId = ref(null) // 当前查看的批次ID
const currentBatchImages = ref([]) // 当前批次的图片列表
const imageScale = ref(1)
const imageRotation = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const imagePosition = ref({ x: 0, y: 0 })

// 视频预览相关
const showVideoModal = ref(false)
const previewVideoElement = ref(null) // 视频元素引用
const currentPreviewVideo = ref({
  url: '',
  duration: '',
  resolution: '',
  ratio: ''
})

// 处理图片上传
const handleImageChange = async (file) => {
  // 验证文件对象
  if (!file || !file.raw) {
    console.error('无效的文件对象:', file)
    ElMessage.error('文件上传失败：无效的文件')
    return
  }

  // 检查是否处于替换模式
  const isReplacing = replacingImageId.value !== null
  const replaceIndex = isReplacing ? uploadedImages.value.findIndex(img => img.id === replacingImageId.value) : -1

  if (isReplacing) {
    console.log('[替换模式] 替换图片ID:', replacingImageId.value, '索引:', replaceIndex)
  }

  // 使用 Object URL 代替 Base64 以减少内存占用
  const tempImageUrl = URL.createObjectURL(file.raw)

  const tempImageData = {
    id: Date.now() + Math.random(),
    url: tempImageUrl,
    file: file.raw,
    name: file.name,
    uploading: true, // 标记为上传中
    isObjectURL: true // 标记为需要释放的 Object URL
  }

  if (isReplacing && replaceIndex !== -1) {
    // 替换模式：先释放旧的 Object URL
    const oldImage = uploadedImages.value[replaceIndex]
    if (oldImage.isObjectURL && oldImage.url && oldImage.url.startsWith('blob:')) {
      URL.revokeObjectURL(oldImage.url)
      console.log('[内存清理] 释放旧的参考图 Object URL')
    }

    // 替换指定位置的图片
    uploadedImages.value.splice(replaceIndex, 1, tempImageData)
    uploadedFiles.value.splice(replaceIndex, 1, file.raw)
    console.log('[替换模式] 已替换索引', replaceIndex, '的图片:', file.name)
    replacingImageId.value = null // 清除替换标记
  } else {
    // 添加模式：添加到末尾
    uploadedImages.value.push(tempImageData)
    uploadedFiles.value.push(file.raw)
    console.log('[本地上传] 添加临时预览:', file.name)
  }

  // 临时上传的图片仍然需要上传到OSS以便生成使用
  // 但不会显示在常用参考图列表中（is_prompt_reference = 1）
  // 异步上传到OSS并保存到数据库
  try {
    console.log('[本地上传] 开始上传到OSS:', file.name)
    const token = localStorage.getItem('token')
    
    if (!token) {
      console.warn('[本地上传] 未登录，跳过上传到数据库')
      return
    }

    const formData = new FormData()
    formData.append('images', file.raw)  // 使用 images 而不是 image
    formData.append('is_prompt_reference', '1') // 标记为临时上传的参考图

    const response = await fetch('/api/reference-images', {  // 使用正确的接口
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    
    if (!response.ok) {
      throw new Error(`上传失败: ${response.status}`)
    }
    
    const result = await response.json()

    if (result.images && result.images.length > 0) {
      const refImage = result.images[0]  // 获取第一张上传的图片
      console.log('[本地上传] 上传成功，ID:', refImage.id)
      
      // 更新图片信息，替换临时ID为数据库ID
      let tempIndex = -1
      if (isReplacing && replaceIndex !== -1) {
        // 替换模式：更新被替换的图片
        tempIndex = replaceIndex
      } else {
        // 添加模式：查找刚添加的临时图片
        tempIndex = uploadedImages.value.findIndex(img => img.name === file.name && img.uploading)
      }
      
      if (tempIndex !== -1) {
        uploadedImages.value[tempIndex] = {
          id: refImage.id,
          dbId: refImage.id, // 保存数据库ID
          url: refImage.oss_url || refImage.url,
          file: file.raw,
          name: file.name,
          uploading: false
        }
        console.log('[本地上传] 已更新为数据库记录，ID:', refImage.id)
      }
    }
  } catch (error) {
    console.error('[本地上传] 上传到OSS失败:', error)
    // 上传失败不影响使用，仍然可以用本地文件生成
    // 只是无法保存到历史记录的参考图列表
  }
}

// 删除上传的图片
const removeImage = (imageId) => {
  const index = uploadedImages.value.findIndex(img => img.id === imageId)
  if (index !== -1) {
    // 释放 Object URL 防止内存泄漏
    const image = uploadedImages.value[index]
    if (image.isObjectURL && image.url && image.url.startsWith('blob:')) {
      URL.revokeObjectURL(image.url)
      console.log('[内存清理] 释放参考图 Object URL:', image.url)
    }

    uploadedImages.value.splice(index, 1)
    uploadedFiles.value.splice(index, 1)
  }
}

// 清空所有上传的图片
const clearAllImages = () => {
  // 释放所有 Object URL 防止内存泄漏
  uploadedImages.value.forEach(image => {
    if (image.isObjectURL && image.url && image.url.startsWith('blob:')) {
      URL.revokeObjectURL(image.url)
      console.log('[内存清理] 释放参考图 Object URL:', image.url)
    }
  })

  uploadedImages.value = []
  uploadedFiles.value = []
  uploadRef.value?.clearFiles()
}

// 点击缩略图替换图片
const handleThumbnailClick = (imageId) => {
  console.log('[替换图片] 点击缩略图，准备替换:', imageId)
  replacingImageId.value = imageId
  // 触发文件选择器
  uploadRef.value?.$el.querySelector('input[type="file"]')?.click()
}

// 常用参考图拖拽开始
const handleCommonImageDragStart = (image, event) => {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('common-reference-image-id', image.id.toString())
  draggedCommonImageId.value = image.id
  console.log('[常用参考图拖拽开始] 图片ID:', image.id, '名称:', image.originalName)
}

// 拖拽开始
const handleDragStart = (index, event) => {
  draggedImageIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  console.log('[拖拽开始] 索引:', index)
}

// 拖拽经过
const handleDragOver = (index, event) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  if (draggedImageIndex.value !== null && draggedImageIndex.value !== index) {
    dropTargetIndex.value = index
  }
}

// 拖拽离开
const handleDragLeave = () => {
  dropTargetIndex.value = null
}

// 放置
const handleDrop = (index, event) => {
  event.preventDefault()
  
  // 检查是否是从常用参考图拖拽过来的
  const commonImageId = event.dataTransfer.getData('common-reference-image-id')
  if (commonImageId) {
    console.log('[拖拽替换] 从常用参考图替换，目标索引:', index, '图片ID:', commonImageId)
    // 替换为常用参考图
    replaceWithCommonImage(index, commonImageId)
  } else if (draggedImageIndex.value !== null && draggedImageIndex.value !== index) {
    // 重新排序
    console.log('[拖拽排序] 从索引', draggedImageIndex.value, '移动到', index)
    reorderImages(draggedImageIndex.value, index)
  }
  
  dropTargetIndex.value = null
  draggedImageIndex.value = null
}

// 拖拽结束
const handleDragEnd = () => {
  draggedImageIndex.value = null
  dropTargetIndex.value = null
  console.log('[拖拽结束] 清理状态')
}

// 重新排序图片
const reorderImages = (fromIndex, toIndex) => {
  console.log('[重新排序] 从', fromIndex, '到', toIndex)
  
  // 重新排序 uploadedImages 数组
  const [movedImage] = uploadedImages.value.splice(fromIndex, 1)
  uploadedImages.value.splice(toIndex, 0, movedImage)
  
  // 重新排序 uploadedFiles 数组 (关键：保持与API发送的顺序一致)
  const [movedFile] = uploadedFiles.value.splice(fromIndex, 1)
  uploadedFiles.value.splice(toIndex, 0, movedFile)
  
  console.log('[重新排序完成] 新顺序:', uploadedImages.value.map((img, i) => `${i}: ${img.name}`))
}

// 用常用参考图替换指定位置的图片
const replaceWithCommonImage = async (targetIndex, commonImageId) => {
  try {
    const commonImage = commonReferenceImages.value.find(img => img.id === parseInt(commonImageId))
    if (!commonImage) {
      console.error('[替换失败] 找不到常用参考图:', commonImageId)
      return
    }
    
    console.log('[替换图片] 用常用参考图替换索引', targetIndex, ':', commonImage.originalName)

    // 使用原始URL或当前URL（优先使用原始URL）
    const imageUrl = commonImage.originalUrl || commonImage.url

    // 使用代理接口获取图片
    const proxyUrl = needsProxyDownload(imageUrl)
      ? `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      : imageUrl

    const response = await fetch(proxyUrl, {
      headers: needsProxyDownload(imageUrl)
        ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        : {}
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const blob = await response.blob()
    const file = new File([blob], commonImage.originalName || commonImage.filename, {
      type: blob.type || 'image/png'
    })
    
    // 替换指定位置的图片
    const imageData = {
      id: commonImage.id,
      dbId: commonImage.id,
      url: commonImage.url,
      file: file,
      name: commonImage.originalName || commonImage.filename
    }
    
    uploadedImages.value.splice(targetIndex, 1, imageData)
    uploadedFiles.value.splice(targetIndex, 1, file)
    
    console.log('[替换成功] 位置', targetIndex, '已替换为:', imageData.name)
    ElMessage.success('参考图已替换')
  } catch (error) {
    console.error('[替换失败]:', error)
    ElMessage.error('替换参考图失败: ' + error.message)
  }
}

// 视频生成相关方法
const beforeVideoUpload = (file) => {
  console.log('beforeVideoUpload 被调用:', file)
  
  const isValidType = imageTypes.split(',').some(type => file.type === type.trim())
  if (!isValidType) {
    console.log('文件类型无效:', file.type)
    ElMessage.error('只支持 JPG、PNG、GIF、WebP 格式的图片！')
    return false
  }
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    console.log('文件过大:', file.size)
    ElMessage.error('图片大小不能超过 10MB！')
    return false
  }
  
  console.log('文件验证通过，返回 false 以触发 on-change 事件')
  // 当 auto-upload="false" 时，需要返回 false 来阻止自动上传
  // 文件会通过 on-change 事件处理
  return false
}

const handleVideoFileChange = (file, fileList, type) => {
  console.log('视频文件变化:', { file, fileList, type })
  
  if (type === 'first') {
    firstFrameFileList.value = fileList
    console.log('首帧文件列表更新:', firstFrameFileList.value)
  } else if (type === 'last') {
    lastFrameFileList.value = fileList
    console.log('尾帧文件列表更新:', lastFrameFileList.value)
  }
}

const handleVideoFileRemove = (file, fileList, type) => {
  if (type === 'first') {
    firstFrameFileList.value = fileList
  } else if (type === 'last') {
    lastFrameFileList.value = fileList
  }
}

const resetVideoForm = () => {
  firstFrameFileList.value = []
  lastFrameFileList.value = []
  videoSelectedModelId.value = null
  videoAutoDownload.value = true
  // 重置新增的变量，并释放 Object URL 防止内存泄漏
  if (firstFramePreview.value && firstFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(firstFramePreview.value)
  }
  if (lastFramePreview.value && lastFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(lastFramePreview.value)
  }
  firstFrameFile.value = null
  firstFramePreview.value = ''
  lastFrameFile.value = null
  lastFramePreview.value = ''
  videoDuration.value = 5
  videoResolution.value = '720p'
  videoRatio.value = '16:9'
  videoWatermark.value = false
  videoCameraFixed.value = false
  videoReturnLastFrame.value = false
  videoSeed.value = null
  // 重置VEO3专用参数
  videoEnhancePrompt.value = true
  videoEnableUpsample.value = false
  // 重置Wan专用参数
  videoNegativePrompt.value = ''
  videoPromptExtend.value = false
  videoSize.value = '1920x1080'
  // 注意：不清除 generationBatches，用户需要手动清除各批次
}

// 处理首帧图片上传
const handleFirstFrameUpload = (file) => {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请上传图片文件')
    return false
  }

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过10MB')
    return false
  }

  firstFrameFile.value = file
  // 释放之前的 Object URL 防止内存泄漏
  if (firstFramePreview.value && firstFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(firstFramePreview.value)
  }
  // 使用 Object URL 代替 Base64，大幅减少内存占用
  firstFramePreview.value = URL.createObjectURL(file)
  return false
}

// 处理尾帧图片上传
const handleLastFrameUpload = (file) => {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请上传图片文件')
    return false
  }

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过10MB')
    return false
  }

  lastFrameFile.value = file
  // 释放之前的 Object URL 防止内存泄漏
  if (lastFramePreview.value && lastFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(lastFramePreview.value)
  }
  // 使用 Object URL 代替 Base64，大幅减少内存占用
  lastFramePreview.value = URL.createObjectURL(file)
  return false
}

// 互换首尾帧图片
const swapFirstLastFrames = () => {
  if (!firstFrameFile.value || !lastFrameFile.value) {
    ElMessage.warning('请先上传首帧和尾帧图片')
    return
  }

  // 交换文件对象
  const tempFile = firstFrameFile.value
  firstFrameFile.value = lastFrameFile.value
  lastFrameFile.value = tempFile

  // 交换预览URL
  const tempPreview = firstFramePreview.value
  firstFramePreview.value = lastFramePreview.value
  lastFramePreview.value = tempPreview

  ElMessage.success('首尾帧已互换')
  console.log('[互换首尾帧] 完成')
}

  const handleVideoGeneration = async () => {
  // 检查冷却状态
  if (videoGenerateCooldown.value) {
    ElMessage.warning('请稍候再试，避免频繁点击')
    return
  }
  
  // 获取视频提示词内容
  let promptText = ''
  if (videoMultilineTagInputRef.value) {
    promptText = videoMultilineTagInputRef.value.getFullText()
  } else if (videoPromptTags.value.length > 0) {
    // 备用方案：手动处理视频标签映射
    const mappedTags = videoPromptTags.value.map(tag => videoTagMapping.value[tag] || tag)
    promptText = mappedTags.join(', ')
  } else {
    promptText = prompt.value
  }
  
  console.log('视频生成参数检查:', {
    promptText: promptText.trim(),
    videoSelectedModelId: videoSelectedModelId.value,
    firstFrameFile: firstFrameFile.value,
    lastFrameFile: lastFrameFile.value,
    videoDuration: videoDuration.value,
    videoResolution: videoResolution.value,
    videoRatio: videoRatio.value
  })
  
  // 基本检查：提示词、模型选择和首帧图片
  if (!promptText.trim()) {
    ElMessage.warning('请填写提示词')
    return
  }
  
  if (!videoSelectedModelId.value) {
    ElMessage.warning('请选择视频模型')
    return
  }
  
  // 如果模型必须要首帧图片，则检查是否已上传（仅image-to-video模式必须）
  if (firstFrameRequired.value && !firstFrameFile.value) {
    ElMessage.warning('请上传首帧图片')
    return
  }

  // 启动冷却计时器（2秒）
  videoGenerateCooldown.value = true
  setTimeout(() => {
    videoGenerateCooldown.value = false
  }, 2000)

  // 创建新批次
  const batchId = `batch_video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const videoTask = {
    id: `video_task_${Date.now()}`,
    status: 'pending',
    imageUrl: '',
    videoUrl: '',
    index: 1,
    progress: 0,
    isVideo: true
  }
  
  const newBatch = {
    id: batchId,
    type: 'video',
    timestamp: new Date(),
    status: 'pending',
    tasks: [videoTask],
    results: [],
    prompt: promptText.trim(),
    tags: promptTags.value || [], // 保存当前标签
    selectedCommonPrompts: Array.from(selectedCommonPromptIds.value), // 保存常用提示词ID
    params: {
      modelDbId: videoSelectedModelId.value,
      duration: videoDuration.value,
      resolution: videoResolution.value,
      ratio: videoRatio.value
    }
  }
  
  // 将新批次添加到数组开头（最新的在上面）
  generationBatches.value.unshift(newBatch)

  // 限制批次数量，删除最旧的批次
  if (generationBatches.value.length > MAX_BATCHES) {
    const removed = generationBatches.value.splice(MAX_BATCHES)
    console.log(`[内存优化] 删除${removed.length}个旧批次，当前批次数: ${generationBatches.value.length}`)
  }

  try {
    // 创建一个pending任务卡片（兼容旧代码）
    generationTasks.value = [videoTask]
    
    // 更新批次状态为处理中
    newBatch.status = 'processing'
    videoTask.status = 'processing'
    
    // 准备请求数据
    const requestData = {
      prompt: promptText.trim(),
      modelDbId: videoSelectedModelId.value, // 使用数据库ID
      duration: videoDuration.value,
      resolution: videoResolution.value,
      ratio: videoRatio.value,
      watermark: videoWatermark.value,
      camerafixed: videoCameraFixed.value,
      return_last_frame: videoReturnLastFrame.value, // 使用下划线命名
      seed: videoSeed.value,
      auto_download: videoAutoDownload.value,
      enhance_prompt: videoEnhancePrompt.value, // VEO3专用
      enable_upsample: videoEnableUpsample.value, // VEO3专用
      negative_prompt: videoNegativePrompt.value, // Wan专用：负面提示词
      prompt_extend: videoPromptExtend.value, // Wan专用：提示词重写
      size: videoSize.value, // Wan专用：具体分辨率
      hd: videoHd.value, // Sora2专用：HD 高清
      aspect_ratio: videoAspectRatio.value // Sora2专用：宽高比
    }

    // Sora2角色客串参数
    if (isSoraModel.value && characterVideoUrl.value && characterStartTime.value !== null && characterEndTime.value !== null) {
      const duration = characterEndTime.value - characterStartTime.value
      if (duration >= 1 && duration <= 3) {
        requestData.characterUrl = characterVideoUrl.value
        requestData.characterTimestamps = `${characterStartTime.value},${characterEndTime.value}`
        console.log('[视频生成] 使用角色客串:', requestData.characterUrl, requestData.characterTimestamps)
      } else {
        ElMessage.warning('角色客串时间范围需要在1-3秒之间')
      }
    }

    // 根据上传的图片数量决定生成类型
    if (firstFrameFile.value && lastFrameFile.value) {
      // 首尾帧生成
      console.log('使用首尾帧生成模式')
      requestData.firstFrame = firstFrameFile.value
      requestData.lastFrame = lastFrameFile.value
      requestData.generation_type = 'first_last_frame'
    } else if (firstFrameFile.value) {
      // 普通参考图生成
      console.log('使用首帧参考图生成模式')
      requestData.firstFrame = firstFrameFile.value
      requestData.generation_type = 'reference'
    } else {
      // 纯文本生成
      console.log('使用纯文本生成模式')
      requestData.generation_type = 'text_only'
    }

    // 更新任务状态为处理中
    generationTasks.value[0].status = 'processing'
    
    // 调用视频生成API（提交任务）
    const response = await generateVideo(requestData)
    
    if (response.taskId) {
      // 根据模型和参数显示不同的等待提示
      let estimatedTime = '3-5分钟';
      if (isSoraModel.value) {
        if (videoHd.value) {
          estimatedTime = '10-15分钟';
        } else if (videoDuration.value === '25') {
          estimatedTime = '5-8分钟';
        } else if (videoDuration.value === '15') {
          estimatedTime = '3-5分钟';
        } else {
          estimatedTime = '1-3分钟';
        }
        ElMessage.success({
          message: `Sora2任务已提交！预计需要 ${estimatedTime}，请耐心等待...`,
          duration: 5000
        });
      } else {
        ElMessage.success('视频生成任务已提交，请等待...');
      }
      
      // 根据模型类型动态设置轮询参数
      let maxAttempts = 60 // 默认最多轮询60次（5分钟）
      const interval = 5000 // 每5秒查询一次
      
      // 针对Sora2模型增加轮询次数
      if (isSoraModel.value) {
        if (videoHd.value) {
          // HD模式：需要额外8分钟，总共约12-15分钟
          maxAttempts = 180 // 180次 * 5秒 = 15分钟
          console.log('[视频轮询] Sora2 HD模式，最多轮询180次（约15分钟）')
        } else if (videoDuration.value === '25') {
          // 25秒模式：需要约8分钟
          maxAttempts = 120 // 120次 * 5秒 = 10分钟
          console.log('[视频轮询] Sora2 25秒模式，最多轮询120次（约10分钟）')
        } else if (videoDuration.value === '15') {
          // 15秒模式：需要约5分钟
          maxAttempts = 100 // 100次 * 5秒 = 8.3分钟
          console.log('[视频轮询] Sora2 15秒模式，最多轮询100次（约8分钟）')
        } else {
          // 10秒模式：需要约3分钟
          maxAttempts = 80 // 80次 * 5秒 = 6.7分钟
          console.log('[视频轮询] Sora2 10秒模式，最多轮询80次（约7分钟）')
        }
      }
      
      for (let i = 0; i < maxAttempts; i++) {
        // 检查轮询是否被取消
        if (pollingController.value.cancelled) {
          console.log('[视频轮询] 轮询已取消')
          return
        }

        await new Promise(resolve => setTimeout(resolve, interval))
        
        try {
          const resultResponse = await getVideoResult(response.taskId)
          console.log(`[视频轮询] 第${i + 1}次查询:`, {
            status: resultResponse.status,
            hasResult: !!resultResponse.result,
            fullResponse: resultResponse
          })
          
          // 检查多种可能的成功状态
          const isCompleted = resultResponse.status === 'completed' || 
                             resultResponse.status === 'success' ||
                             resultResponse.status === 'SUCCESS'
          
          if (isCompleted && resultResponse.result) {
            const result = resultResponse.result
            
            // 更新任务状态为完成
            generationTasks.value[0].status = 'completed'
            generationTasks.value[0].videoUrl = result.url
            generationTasks.value[0].progress = 100
            
            const videoResult = {
              url: result.url,
              isVideo: true,
              thumbnail: result.thumbnail,
              duration: result.duration,
              resolution: result.resolution,
              ratio: result.ratio,
              fps: result.fps,
              seed: result.seed,
              timestamp: new Date().toISOString()
            }
            
            // 将视频结果添加到生成结果中
            generatedImages.value = [videoResult]
            
            // 更新批次状态和结果
            if (newBatch) {
              newBatch.tasks[0].status = 'completed'
              newBatch.tasks[0].videoUrl = result.url
              newBatch.tasks[0].progress = 100
              newBatch.results = [videoResult]
              newBatch.status = 'completed'
              console.log('[批次更新] 视频批次已完成:', {
                batchId: newBatch.id,
                status: newBatch.status,
                hasResults: newBatch.results.length > 0
              })
            } else {
              console.warn('[批次更新] 警告：找不到批次对象')
            }
            
            // 保存到历史记录
            try {
              await saveToHistoryAutomatically()
              console.log('视频历史记录已保存')
            } catch (historyError) {
              console.error('保存视频历史记录失败:', historyError)
              // 不影响主流程，只记录错误
            }
            
            ElMessage.success('视频生成成功！')
            
            // 根据开关状态决定是否自动下载
            if (autoDownloadEnabled.value && result.url) {
              console.log('[自动下载] 视频生成完成，准备下载')
              setTimeout(async () => {
                try {
                  await downloadVideo(result.url, `video_${Date.now()}`)
                  ElMessage.success('视频已自动下载')
                } catch (downloadError) {
                  console.error('[自动下载] 下载失败:', downloadError)
                }
              }, 1000) // 延迟1秒后自动下载
            }
            
            break
          } else if (resultResponse.status === 'failed' || 
                     resultResponse.status === 'FAILED' || 
                     resultResponse.status === 'FAILURE') {
            // 立即标记任务失败并跳出循环
            const errorMessage = resultResponse.error || resultResponse.message || '视频生成失败'
            
            generationTasks.value[0].status = 'failed'
            generationTasks.value[0].error = errorMessage
            
            // 更新批次状态
            if (newBatch) {
              newBatch.tasks[0].status = 'failed'
              newBatch.tasks[0].error = errorMessage
              newBatch.status = 'failed'
              console.log('[批次更新] 视频批次失败:', {
                batchId: newBatch.id,
                status: newBatch.status,
                error: errorMessage
              })
            }
            
            ElMessage.error('视频生成失败：' + errorMessage)
            console.log('[视频轮询] 检测到失败状态，停止轮询')
            return // 直接返回，停止轮询
          }
          // 继续等待...
        } catch (pollError) {
          console.error('查询视频结果失败:', pollError)
          // 如果是failed状态导致的错误，直接抛出，不继续轮询
          if (pollError.message && pollError.message.includes('视频生成失败')) {
            throw pollError
          }
          // 其他错误（如网络错误），只在最后一次尝试时抛出
          if (i === maxAttempts - 1) {
            throw new Error('查询视频结果超时')
          }
        }
      }
      
      // 如果循环结束仍未完成，标记为超时失败
      if (generationTasks.value.length > 0 && generationTasks.value[0].status !== 'completed') {
        const timeoutMinutes = Math.round((maxAttempts * interval) / 60000)
        console.warn(`[视频生成] 轮询超时（${timeoutMinutes}分钟），但任务可能仍在后台处理`)
        
        let timeoutMessage = `查询超时（已等待${timeoutMinutes}分钟），请稍后查看历史记录`
        if (isSoraModel.value) {
          timeoutMessage += '\n提示：Sora2生成时间较长，任务可能仍在处理中'
        }
        
        generationTasks.value[0].status = 'failed'
        generationTasks.value[0].error = timeoutMessage
        
        if (newBatch) {
          newBatch.tasks[0].status = 'failed'
          newBatch.tasks[0].error = '查询超时，请稍后查看历史记录'
          newBatch.status = 'failed'
        }
        
        ElMessage.warning('查询超时，视频可能仍在生成中，请稍后查看历史记录')
      }
    } else {
      // 标记任务为失败
      generationTasks.value[0].status = 'failed'
      generationTasks.value[0].error = response.message || '视频生成失败'
      
      // 更新批次状态
      if (newBatch) {
        newBatch.tasks[0].status = 'failed'
        newBatch.tasks[0].error = response.message || '视频生成失败'
        newBatch.status = 'failed'
      }
      
      ElMessage.error(response.message || '视频生成失败')
    }
  } catch (error) {
    console.error('视频生成失败:', error)
    
    // 标记任务为失败
    if (generationTasks.value.length > 0) {
      generationTasks.value[0].status = 'failed'
      generationTasks.value[0].error = error.message || '未知错误'
    }
    
    // 更新批次状态
    if (newBatch) {
      newBatch.tasks[0].status = 'failed'
      newBatch.tasks[0].error = error.message || '未知错误'
      newBatch.status = 'failed'
    }
    
    ElMessage.error('视频生成失败：' + (error.message || '未知错误'))
  }
}

// 下载视频
const downloadVideo = async (videoUrl, filename) => {
  try {
    if (!videoUrl) {
      throw new Error('视频URL为空')
    }
    
    if (!filename) {
      filename = `video_${Date.now()}`
    }
    
    console.log('[下载视频] 开始下载:', { videoUrl, filename })
    ElMessage.info('正在准备下载视频...')
    
    // 判断是否需要通过代理下载视频，避免CORS问题
    let fetchUrl = videoUrl
    const fetchOptions = {}
    
    if (needsProxyDownload(videoUrl)) {
      // 使用代理接口避免CORS
      fetchUrl = `/api/proxy-image?url=${encodeURIComponent(videoUrl)}`
      fetchOptions.headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
      console.log('[下载视频] 使用代理下载')
    } else {
      console.log('[下载视频] 直接下载')
    }
    
    // 使用fetch下载视频文件
    const response = await fetch(fetchUrl, fetchOptions)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    console.log('[下载视频] 获取Blob成功:', { size: blob.size, type: blob.type })
    
    const blobUrl = URL.createObjectURL(blob)
    
    // 创建一个临时链接并点击它
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `${filename}.mp4`
    link.target = '_self'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 清理blob URL
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
    }, 100)
    
    ElMessage.success('视频下载成功')
    return true
  } catch (error) {
    console.error('[下载视频] 失败:', error)
    ElMessage.error('视频下载失败: ' + (error.message || '未知错误'))
    throw error
  }
}

// 处理常用参考图选择
const handleReferenceImageSelect = async (selectedImages) => {
  if (selectedImages && selectedImages.length > 0) {
    // 添加选中的图片到上传列表
    for (const image of selectedImages) {
      // 检查图片是否已经存在（根据数据库ID）
      const existingImage = uploadedImages.value.find(img => img.dbId === image.id)
      if (existingImage) {
        console.log(`图片 ${image.originalName || image.filename} 已存在，跳过`)
        continue
      }

      try {
        // 获取正确的图片URL
        const imageUrl = image.oss_url || image.ossUrl || image.url || image.originalUrl

        // 使用代理接口获取图片，避免CORS问题
        const proxyUrl = needsProxyDownload(imageUrl)
          ? `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
          : imageUrl

        const response = await fetch(proxyUrl)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const blob = await response.blob()

        // 确保有正确的MIME类型和文件扩展名
        let mimeType = blob.type || 'image/png'
        let fileName = image.originalName || image.original_name || image.filename || image.name || '参考图'

        // 如果MIME类型为空或无效，根据URL或默认设置为png
        if (!mimeType || !mimeType.startsWith('image/')) {
          mimeType = 'image/png'
        }

        // 确保文件名有正确的扩展名
        if (!fileName.includes('.')) {
          const extension = mimeType.split('/')[1] || 'png'
          fileName = `${fileName}.${extension}`
        }

        const file = new File([blob], fileName, {
          type: mimeType
        })

        const imageData = {
          id: image.id || (Date.now() + Math.random()), // 优先使用数据库ID
          dbId: image.id, // 保存数据库ID用于历史记录
          url: imageUrl,
          file: file,
          name: fileName
        }

        uploadedImages.value.push(imageData)
        uploadedFiles.value.push(file)
      } catch (error) {
        console.error('获取参考图失败:', error)
        ElMessage.error(`获取参考图 ${image.originalName || image.filename} 失败`)
      }
    }
    
    showReferenceManager.value = false
    ElMessage.success(`已添加 ${selectedImages.length} 张参考图`)
  }
}

// 取消参考图选择
const handleReferenceImageCancel = () => {
  showReferenceManager.value = false
}

// 参考图更新后的处理（上传/删除后触发）
const handleReferenceImagesUpdated = () => {
  console.log('[常用参考图] 检测到图片更新，触发增量更新')
  // 延迟100ms执行，确保后端数据库已更新
  setTimeout(() => {
    incrementalUpdateReferenceImages()
  }, 100)
}

// 计算属性：显示的参考图（支持分类过滤和最近使用的在前）
const displayedReferenceImages = computed(() => {
  let filteredImages = commonReferenceImages.value

  // 按分类过滤（使用分类名称，而不是ID）
  if (activeReferenceCategoryId.value !== 'all') {
    filteredImages = commonReferenceImages.value.filter(img =>
      img.categoryName === activeReferenceCategoryId.value
    )
  }

  // 合并最近使用的图片和其他图片，去重
  const recentIds = recentUsedImages.value.map(img => img.id)
  const otherImages = filteredImages.filter(img => !recentIds.includes(img.id))

  const combinedImages = [...recentUsedImages.value, ...otherImages]

  // 折叠状态下只显示前16张
  const maxDisplay = isReferenceIconsCollapsed.value ? 16 : combinedImages.length

  return combinedImages.slice(0, maxDisplay)
})

// 计算属性：获取当前选择的视频模型
const selectedVideoModel = computed(() => {
  if (!videoSelectedModelId.value || videoModels.value.length === 0) {
    return null
  }
  return videoModels.value.find(model => model.id === videoSelectedModelId.value)
})

// 计算属性：当前模型是否支持首帧图片
const supportsFirstFrame = computed(() => {
  return selectedVideoModel.value?.mode === 'image-to-video'
})

// 计算属性：首帧图片是否必须（图生视频模式首帧必须）
const firstFrameRequired = computed(() => {
  return selectedVideoModel.value?.mode === 'image-to-video'
})

// 计算属性：当前模型是否支持尾帧图片
const supportsLastFrame = computed(() => {
  return selectedVideoModel.value?.features?.supportLastFrame === true
})

// 检测是否选中了VEO3模型
const isVeoModel = computed(() => {
  if (!videoSelectedModelId.value || !videoModels.value.length) {
    return false
  }
  const selectedModel = videoModels.value.find(m => m.id === videoSelectedModelId.value)
  return selectedModel?.provider === 'google'
})

// 检测是否选中了豆包模型
const isDoubaoModel = computed(() => {
  if (!videoSelectedModelId.value || !videoModels.value.length) {
    return false
  }
  const selectedModel = videoModels.value.find(m => m.id === videoSelectedModelId.value)
  return selectedModel?.provider === 'doubao'
})

// 检测是否选中了阿里Wan模型
const isWanModel = computed(() => {
  if (!videoSelectedModelId.value || !videoModels.value.length) {
    return false
  }
  const selectedModel = videoModels.value.find(m => m.id === videoSelectedModelId.value)
  return selectedModel?.provider === 'ali'
})

const isSoraModel = computed(() => {
  if (!videoSelectedModelId.value || !videoModels.value.length) {
    return false
  }
  const selectedModel = videoModels.value.find(m => m.id === videoSelectedModelId.value)
  return selectedModel?.provider === 'sora'
})

const isSoraPro = computed(() => {
  if (!videoSelectedModelId.value || !videoModels.value.length) {
    return false
  }
  const selectedModel = videoModels.value.find(m => m.id === videoSelectedModelId.value)
  return selectedModel?.model_id === 'sora-2-pro'
})

// 角色客串时间范围验证提示
const characterTimeRangeHint = computed(() => {
  if (!characterStartTime.value || !characterEndTime.value) {
    return ''
  }

  const duration = characterEndTime.value - characterStartTime.value

  if (characterStartTime.value >= characterEndTime.value) {
    return '⚠️ 结束时间必须大于开始时间'
  }

  if (duration < 1) {
    return '⚠️ 时间范围至少需要1秒'
  }

  if (duration > 3) {
    return '⚠️ 时间范围最多3秒'
  }

  return `✓ 时间范围: ${duration.toFixed(1)}秒`
})

// 监听视频模型切换，自动设置 Sora2 的默认参数
watch(videoSelectedModelId, (newModelId) => {
  if (!newModelId || !videoModels.value.length) return
  
  const selectedModel = videoModels.value.find(m => m.id === newModelId)
  if (selectedModel?.provider === 'sora') {
    console.log('[App.vue] 切换到 Sora2 模型，设置默认参数')
    // Sora2 默认参数
    videoDuration.value = 10 // Sora2 最小时长是 10 秒
    videoAspectRatio.value = '16:9'
    videoHd.value = false
  } else {
    // 其他模型的默认参数
    if (videoDuration.value === 10 && selectedModel?.provider !== 'sora') {
      videoDuration.value = 5 // 恢复默认 5 秒
    }
  }
})

// 检查是否有图片批次正在处理
const hasProcessingImageBatch = computed(() => {
  return generationBatches.value.some(
    batch => batch.type === 'image' && (batch.status === 'pending' || batch.status === 'processing')
  )
})

// 检查是否有视频批次正在处理
const hasProcessingVideoBatch = computed(() => {
  const hasProcessing = generationBatches.value.some(
    batch => batch.type === 'video' && (batch.status === 'pending' || batch.status === 'processing')
  )
  
  return hasProcessing
})

// 检查是否有任何完成的结果（包括部分完成）
const hasAnyResults = computed(() => {
  return generationBatches.value.some(batch => {
    // 检查批次状态
    if (batch.status !== 'completed' && batch.status !== 'partial') {
      return false
    }

    // 对于视频批次，检查 results
    if (batch.type === 'video') {
      return batch.results && batch.results.length > 0
    }

    // 对于图片批次，检查 tasks 中是否有完成的任务
    if (batch.type === 'image') {
      return batch.tasks && batch.tasks.some(task => task.status === 'completed' && task.imageUrl)
    }

    return false
  })
})

// 监控视频批次状态变化（用于调试）
watch(
  () => generationBatches.value.filter(b => b.type === 'video'),
  (newVideoBatches, oldVideoBatches) => {
    if (newVideoBatches.length > 0) {
      console.log('[批次监控] 视频批次状态:', newVideoBatches.map(b => ({
        id: b.id.substring(0, 20) + '...',
        status: b.status,
        tasksStatus: b.tasks.map(t => t.status),
        hasResults: b.results.length
      })))
      console.log('[批次监控] hasProcessingVideoBatch =', hasProcessingVideoBatch.value)
    }
  },
  { deep: true }
)

// Watch for model selection changes and update imageSize based on provider
watch(selectedModelId, (newModelId) => {
  if (!newModelId) return
  
  const config = currentParamConfig.value
  if (config.options.length > 0) {
    // Try to find a matching default value or use the first option
    const defaultOption = config.options.find(opt => 
      opt.value === '1:1' || opt.value === '1024x1024'
    ) || config.options[0]
    
    imageSize.value = defaultOption.value
    
    console.log('[模型切换] 更新参数配置:', {
      provider: currentProvider.value,
      paramType: config.paramType,
      newSize: imageSize.value
    })
  }
})

// 🔧 新增：监听生成模式变化，自动切换到支持的模型
watch(generationMode, (newMode) => {
  // 如果是视频模式，不需要处理图像模型
  if (newMode === 'image-to-video') {
    return
  }
  
  // 检查当前选中的模型是否支持新模式
  const currentModel = availableModels.value.find(m => m.id === selectedModelId.value)
  if (!currentModel) {
    return
  }
  
  const supportedModes = currentModel.supported_modes || 'both'
  const isSupported = supportedModes === 'both' || supportedModes === newMode
  
  if (!isSupported) {
    // 当前模型不支持新模式，切换到第一个支持的模型
    const filteredModels = filteredAvailableModels.value
    if (filteredModels.length > 0) {
      // 优先选择默认模型
      const defaultModel = filteredModels.find(m => m.is_default)
      selectedModelId.value = defaultModel ? defaultModel.id : filteredModels[0].id
      
      console.log('[模式切换] 自动切换模型:', {
        mode: newMode,
        oldModel: currentModel.name,
        newModel: availableModels.value.find(m => m.id === selectedModelId.value)?.name
      })
    }
  }
})

// 视频生成计算属性
const videoCanGenerate = computed(() => {
  // 直接从视频 MultilineTagInput 组件获取提示词内容
  let promptText = ''
  if (videoMultilineTagInputRef.value) {
    promptText = videoMultilineTagInputRef.value.getFullText()
  } else if (videoPromptTags.value.length > 0) {
    // 备用方案：手动处理视频标签映射
    const mappedTags = videoPromptTags.value.map(tag => videoTagMapping.value[tag] || tag)
    promptText = mappedTags.join(', ')
  } else {
    promptText = prompt.value
  }
  
  const promptValid = promptText.trim()
  const modelSelected = videoSelectedModelId.value
  const hasFirstFrame = firstFrameFile.value !== null
  
  // 检查基本条件：有提示词、选择了模型
  // 如果模型必须要首帧图片（仅image-to-video模式），则还要检查是否有首帧图片
  let canGenerate = promptValid && modelSelected
  if (firstFrameRequired.value && canGenerate) {
    canGenerate = canGenerate && hasFirstFrame
  }
  
  console.log('videoCanGenerate 详细状态:', {
    promptText,
    promptValid,
    videoSelectedModelId: videoSelectedModelId.value,
    modelSelected,
    hasFirstFrame,
    canGenerate,
    videoModels: videoModels.value.length,
    videoModelsLoaded: videoModelsLoaded.value
  })
  
  return canGenerate
})


// 切换参考图折叠状态
const toggleReferenceIconsCollapse = () => {
  isReferenceIconsCollapsed.value = !isReferenceIconsCollapsed.value
}

// 设置活动的参考图分类
const setActiveReferenceCategory = (categoryId) => {
  activeReferenceCategoryId.value = categoryId
}


// 获取参考图分类图片数量
const getReferenceCategoryImageCount = (categoryId) => {
  if (categoryId === 'all') {
    return commonReferenceImages.value.length
  }
  return commonReferenceImages.value.filter(img =>
    img.categoryName === categoryId
  ).length
}

// 获取参考图分类列表
const fetchReferenceCategories = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) return

    const response = await fetch('/api/reference-images/categories', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    if (response.ok) {
      const data = await response.json()

      // 新API返回 { success: true, categories: [...] }
      const userCats = data.categories || []

      // 过滤系统分类，转换为对象格式
      const filteredCategories = userCats.filter(categoryName => {
        // 确保转换为字符串
        const name = String(categoryName || '').trim()
        return name && !SYSTEM_REFERENCE_CATEGORY_NAMES.has(name)
      }).map(name => ({ id: String(name), name: String(name) }))

      referenceCategories.value = [
        { id: 'all', name: '全部' },
        ...filteredCategories
      ]
      if (!referenceCategories.value.some(category => category.id === activeReferenceCategoryId.value)) {
        activeReferenceCategoryId.value = 'all'
      }
    }
  } catch (error) {
    console.error('获取参考图分类失败:', error)
  }
}

// 获取常用参考图列表（优化：智能缓存+增量更新）
const fetchCommonReferenceImages = async () => {
  try {
    isLoadingReferenceImages.value = true
    const token = localStorage.getItem('token')
    if (!token) {
      console.log('[常用参考图] 未登录，跳过加载')
      isLoadingReferenceImages.value = false
      return
    }

    // 检查缓存是否有效（5分钟内）
    const cacheKey = 'commonReferenceImagesCache'
    const cacheTimestampKey = 'commonReferenceImagesCacheTimestamp'
    const cachedData = localStorage.getItem(cacheKey)
    const cacheTimestamp = localStorage.getItem(cacheTimestampKey)
    const now = Date.now()
    const cacheValidDuration = 5 * 60 * 1000 // 5分钟

    // 如果内存中已有数据且缓存有效，直接返回
    if (commonReferenceImages.value.length > 0 &&
        cacheTimestamp &&
        (now - parseInt(cacheTimestamp)) < cacheValidDuration) {
      console.log('[常用参考图] 使用内存缓存，跳过加载')
      return
    }

    // 如果有localStorage缓存且有效，先使用缓存数据
    if (cachedData && cacheTimestamp && (now - parseInt(cacheTimestamp)) < cacheValidDuration) {
      try {
        const cached = JSON.parse(cachedData)
        commonReferenceImages.value = cached
        console.log('[常用参考图] 使用localStorage缓存，数量:', cached.length)
        isLoadingReferenceImages.value = false

        // 后台增量更新（非阻塞）
        incrementalUpdateReferenceImages()
        return
      } catch (error) {
        console.error('[常用参考图] 解析缓存失败:', error)
      }
    }

    // 完整加载
    console.log('[常用参考图] 开始完整加载')
    const response = await fetch('/api/reference-images/list', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      const images = data.images || []
      const serverTimestamp = data.timestamp || Date.now()

      // 处理图片数据
      const processedImages = images.map(img => {
        const imageUrl = img.oss_url || img.ossUrl || img.url
        const thumbnailUrl = img.thumbnail_url || img.thumbnailUrl || imageUrl

        let displayUrl = thumbnailUrl
        if (needsProxyDownload(thumbnailUrl)) {
          displayUrl = `/api/proxy-image?url=${encodeURIComponent(thumbnailUrl)}`
        }

        return {
          ...img,
          id: img.id,
          url: displayUrl,
          originalUrl: imageUrl,
          ossUrl: imageUrl,
          thumbnailUrl: thumbnailUrl,
          originalName: img.original_name || img.originalName || img.name,
          name: img.name,
          categoryId: img.category_id,
          categoryName: img.category,
          lastUsed: localStorage.getItem(`lastUsed_${img.id}`) || 0
        }
      }).sort((a, b) => b.lastUsed - a.lastUsed)

      commonReferenceImages.value = processedImages
      console.log('[常用参考图] 完整加载完成，总数:', processedImages.length)

      // 保存到缓存
      try {
        localStorage.setItem(cacheKey, JSON.stringify(processedImages))
        localStorage.setItem(cacheTimestampKey, now.toString())
        // 保存同步时间戳，供下次增量更新使用
        localStorage.setItem('commonReferenceImagesLastSync', serverTimestamp.toString())
      } catch (error) {
        console.warn('[常用参考图] 缓存保存失败（可能超出配额）:', error)
      }

      updateRecentUsedImages()
      await fetchReferenceCategories()
    } else {
      console.error('[常用参考图] 加载失败:', response.status)
    }
  } catch (error) {
    console.error('[常用参考图] 加载异常:', error)
  } finally {
    isLoadingReferenceImages.value = false
  }
}

// 增量更新常用参考图（后台非阻塞）
const incrementalUpdateReferenceImages = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) return

    // 获取上次同步的时间戳
    const lastSyncTimestampKey = 'commonReferenceImagesLastSync'
    const lastSyncTimestamp = localStorage.getItem(lastSyncTimestampKey)

    // 获取当前缓存中的ID列表（用于检测删除）
    const currentIds = commonReferenceImages.value.map(img => img.id)

    // 构建API URL，如果有上次同步时间，使用增量查询
    let apiUrl = '/api/reference-images/list'
    if (lastSyncTimestamp) {
      apiUrl += `?since=${lastSyncTimestamp}`
      console.log(`[常用参考图] 增量查询，since=${new Date(parseInt(lastSyncTimestamp)).toISOString()}`)
    }

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      const serverImages = data.images || []
      const serverTimestamp = data.timestamp || Date.now()

      // 如果是增量查询，serverImages只包含新增/更新的图片
      if (lastSyncTimestamp && serverImages.length === 0) {
        console.log('[常用参考图] 无更新')
        // 更新同步时间戳
        localStorage.setItem(lastSyncTimestampKey, serverTimestamp.toString())
        return
      }

      // 处理新增/更新的图片
      const processedImages = serverImages.map(img => {
        const imageUrl = img.oss_url || img.ossUrl || img.url
        const thumbnailUrl = img.thumbnail_url || img.thumbnailUrl || imageUrl

        let displayUrl = thumbnailUrl
        if (needsProxyDownload(thumbnailUrl)) {
          displayUrl = `/api/proxy-image?url=${encodeURIComponent(thumbnailUrl)}`
        }

        return {
          ...img,
          id: img.id,
          url: displayUrl,
          originalUrl: imageUrl,
          ossUrl: imageUrl,
          thumbnailUrl: thumbnailUrl,
          originalName: img.original_name || img.originalName || img.name,
          name: img.name,
          categoryId: img.category_id,
          categoryName: img.category,
          lastUsed: localStorage.getItem(`lastUsed_${img.id}`) || 0
        }
      })

      // 找出新增和更新的图片
      const existingIds = commonReferenceImages.value.map(img => img.id)
      const newImages = processedImages.filter(img => !existingIds.includes(img.id))
      const updatedImages = processedImages.filter(img => existingIds.includes(img.id))

      // 更新现有图片
      if (updatedImages.length > 0) {
        commonReferenceImages.value = commonReferenceImages.value.map(img => {
          const updated = updatedImages.find(u => u.id === img.id)
          return updated || img
        })
      }

      // 添加新图片
      if (newImages.length > 0) {
        commonReferenceImages.value = [...newImages, ...commonReferenceImages.value]
      }

      // 检测已删除的图片（需要对比所有ID）
      // 注意：增量查询不能直接检测删除，需要定期全量查询或使用其他机制
      // 这里简化处理：每次增量更新后，不检测删除，依赖定期的完整加载

      if (newImages.length > 0 || updatedImages.length > 0) {
        console.log(`[常用参考图] 增量更新: 新增${newImages.length}张，更新${updatedImages.length}张`)

        // 重新排序
        commonReferenceImages.value = commonReferenceImages.value
          .sort((a, b) => b.lastUsed - a.lastUsed)

        // 更新缓存
        try {
          const cacheKey = 'commonReferenceImagesCache'
          const cacheTimestampKey = 'commonReferenceImagesCacheTimestamp'
          localStorage.setItem(cacheKey, JSON.stringify(commonReferenceImages.value))
          localStorage.setItem(cacheTimestampKey, Date.now().toString())
          localStorage.setItem(lastSyncTimestampKey, serverTimestamp.toString())
        } catch (error) {
          console.warn('[常用参考图] 增量更新缓存失败:', error)
        }

        updateRecentUsedImages()
      } else {
        console.log('[常用参考图] 无更新')
        // 更新同步时间戳
        localStorage.setItem(lastSyncTimestampKey, serverTimestamp.toString())
      }
    }
  } catch (error) {
    console.error('[常用参考图] 增量更新失败:', error)
  }
}

// 更新最近使用的图片列表
const updateRecentUsedImages = () => {
  const recentIds = []
  const recentImages = []
  
  // 从localStorage获取最近使用的图片ID
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('lastUsed_')) {
      const imageId = key.replace('lastUsed_', '')
      recentIds.push({ id: imageId, timestamp: parseInt(localStorage.getItem(key)) })
    }
  }
  
  // 按时间排序，取前8个
  recentIds.sort((a, b) => b.timestamp - a.timestamp)
  const topRecentIds = recentIds.slice(0, 8).map(item => item.id)
  
  // 从常用参考图中找到对应的图片
  topRecentIds.forEach(id => {
    const image = commonReferenceImages.value.find(img => img.id === id)
    if (image) {
      recentImages.push(image)
    }
  })
  
  recentUsedImages.value = recentImages
}

// 处理参考图加载错误
const handleReferenceImageError = (event, image) => {
  console.error('[参考图加载失败]', {
    imageId: image.id,
    url: image.url,
    originalUrl: image.originalUrl,
    thumbnailUrl: image.thumbnailUrl,
    name: image.originalName || image.filename
  })
  // 尝试使用原始URL
  if (event.target.src !== image.originalUrl && image.originalUrl) {
    console.log('[参考图] 尝试使用原始URL:', image.originalUrl)
    event.target.src = image.originalUrl
  }
}

// 处理参考图加载成功
const handleReferenceImageLoad = (image) => {
  console.log('[参考图加载成功]', {
    imageId: image.id,
    name: image.originalName || image.filename
  })
}

// 点击常用参考图图标自动置入
const insertCommonReferenceImage = async (image) => {
  try {
    // 检查图片是否已经存在（根据数据库ID）
    const existingImage = uploadedImages.value.find(img => img.dbId === image.id || img.id === image.id)
    if (existingImage) {
      console.log(`图片 ${image.originalName || image.filename} 已存在，跳过`)
      ElMessage.info('该图片已在列表中')
      return
    }

    // 使用原始URL或当前URL（优先使用原始URL）
    const imageUrl = image.originalUrl || image.url

    // 使用代理接口获取图片，避免CORS问题
    const proxyUrl = needsProxyDownload(imageUrl)
      ? `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      : imageUrl

    const response = await fetch(proxyUrl, {
      headers: needsProxyDownload(imageUrl)
        ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        : {}
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const blob = await response.blob()
    
    // 确保有正确的MIME类型和文件扩展名
    let mimeType = blob.type || 'image/png'
    let fileName = image.originalName || image.filename || '参考图'
    
    // 如果MIME类型为空或无效，根据URL或默认设置为png
    if (!mimeType || !mimeType.startsWith('image/')) {
      mimeType = 'image/png'
    }
    
    // 确保文件名有正确的扩展名
    if (!fileName.includes('.')) {
      const extension = mimeType.split('/')[1] || 'png'
      fileName = `${fileName}.${extension}`
    }
    
    const file = new File([blob], fileName, {
      type: mimeType
    })
    
    const imageData = {
      id: image.id || (Date.now() + Math.random()), // 优先使用数据库ID
      dbId: image.id, // 保存数据库ID用于历史记录
      url: image.url,
      file: file,
      name: image.originalName || image.filename
    }
    
    uploadedImages.value.push(imageData)
    uploadedFiles.value.push(file)
    
    // 记录使用时间
    localStorage.setItem(`lastUsed_${image.id}`, Date.now().toString())
    updateRecentUsedImages()
    
    ElMessage.success('参考图已添加')
  } catch (error) {
    console.error('添加参考图失败:', error)
    ElMessage.error('添加参考图失败')
  }
}

// 获取可用模型列表
const fetchAvailableModels = async () => {
  try {
    const response = await getAvailableModels()
    if (response.success) {
      availableModels.value = response.data.models
      
      // 设置默认模型
      const defaultModel = availableModels.value.find(model => model.is_default)
      if (defaultModel) {
        selectedModelId.value = defaultModel.id
      } else if (availableModels.value.length > 0) {
        selectedModelId.value = availableModels.value[0].id
      }
    }
  } catch (error) {
    console.error('获取模型列表失败:', error)
    ElMessage.error('获取模型列表失败')
  }
}

// 获取视频模型列表
const fetchVideoModels = async () => {
  try {
    console.log('开始获取视频模型列表...')
    console.log('当前认证状态:', {
      isLoggedIn: isLoggedIn.value,
      token: localStorage.getItem('token') ? '存在' : '不存在'
    })
    
    videoModelsLoading.value = true
    const response = await getVideoModels()
    console.log('视频模型API响应:', response)
    
    if (response.success) {
      videoModels.value = response.models
      videoModelsLoaded.value = true
      console.log('视频模型列表:', videoModels.value)
      
      // 设置默认视频模型
      const defaultModel = videoModels.value.find(model => model.is_default)
      if (defaultModel) {
        videoSelectedModelId.value = defaultModel.id
        console.log('设置默认视频模型:', defaultModel, 'ID:', defaultModel.id)
      } else if (videoModels.value.length > 0) {
        videoSelectedModelId.value = videoModels.value[0].id
        console.log('设置第一个视频模型:', videoModels.value[0], 'ID:', videoModels.value[0].id)
      }
      
      console.log('最终 videoSelectedModelId:', videoSelectedModelId.value)
    } else {
      console.error('视频模型API返回失败:', response)
      ElMessage.warning('视频模型加载失败，请稍后重试')
    }
  } catch (error) {
    console.error('获取视频模型列表失败:', error)

    // 显示错误消息
    ElMessage.error('视频模型加载失败，请检查数据库配置')

    console.error('错误详情:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    })
  } finally {
    videoModelsLoading.value = false
  }
}

// 模型选择变化处理
const onModelChange = (modelId) => {
  const selectedModel = availableModels.value.find(model => model.id === modelId)
  if (selectedModel) {
    ElMessage.success(`已选择模型: ${selectedModel.name}`)
  }
}

// 生成图片
const generateImage = async () => {
  // 检查冷却状态
  if (imageGenerateCooldown.value) {
    ElMessage.warning('请稍候再试，避免频繁点击')
    return
  }
  
  // 获取完整的提示词内容（包括标签映射和输入文本）
  let finalPrompt = ''
  let originalPrompt = '' // 仅用户输入的原始内容，不包括标签映射

  if (multilineTagInputRef.value) {
    // 使用组件的getFullText方法获取完整内容（发送给AI）
    finalPrompt = multilineTagInputRef.value.getFullText()
    // 只获取手动输入的文本内容，不包括标签映射
    originalPrompt = multilineTagInputRef.value.inputText || ''
  } else if (promptTags.value.length > 0) {
    // 备用方案：手动处理标签映射
    const mappedTags = promptTags.value.map(tag => tagMapping.value[tag] || tag)
    finalPrompt = mappedTags.join(', ')
    originalPrompt = prompt.value
  } else {
    finalPrompt = prompt.value
    originalPrompt = prompt.value
  }

  console.log('[生成图片] 提示词信息:', {
    finalPrompt: finalPrompt.substring(0, 100) + '...',
    originalPrompt: originalPrompt.substring(0, 100) + '...',
    tags: promptTags.value,
    selectedCommonPrompts: Array.from(selectedCommonPromptIds.value)
  })
  
  // 检查提示词是否为空
  if (!finalPrompt.trim()) {
    ElMessage.warning('请输入提示词')
    return
  }

  if (generationMode.value === 'image-to-image' && uploadedImages.value.length === 0) {
    ElMessage.warning('请上传参考图片')
    return
  }

  // 启动冷却计时器（2秒）
  imageGenerateCooldown.value = true
  setTimeout(() => {
    imageGenerateCooldown.value = false
  }, 2000)

  // 创建新批次
  const batchId = `batch_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const taskCount = generateQuantity.value
  const tasks = []
  
  // 为每个任务创建占位符
  for (let i = 0; i < taskCount; i++) {
    tasks.push({
      id: `task_${Date.now()}_${i}`,
      status: 'pending', // pending, processing, completed, failed
      imageUrl: '',
      index: i + 1,
      progress: 0,
      downloaded: false // 初始化下载标记
    })
  }
  
  const newBatch = {
    id: batchId,
    type: 'image',
    timestamp: new Date(),
    status: 'pending',
    tasks: tasks,
    results: [],
    prompt: finalPrompt, // 完整提示词（用于发送给AI和显示）
    originalPrompt: originalPrompt, // 原始提示词（仅用户输入，用于保存到提示词卡片）
    tags: promptTags.value || [], // 保存当前标签
    selectedCommonPrompts: Array.from(selectedCommonPromptIds.value), // 保存常用提示词ID
    selectedReferenceImages: uploadedImages.value
      .filter(img => img.dbId && typeof img.dbId === 'number')
      .map(img => img.dbId), // 保存参考图数据库ID
    params: {
      size: imageSize.value,
      quantity: generateQuantity.value,
      mode: generationMode.value,
      modelId: selectedModelId.value
    }
  }

  console.log('[创建批次] 批次元数据:', {
    batchId,
    tags: newBatch.tags,
    selectedCommonPrompts: newBatch.selectedCommonPrompts,
    selectedReferenceImages: newBatch.selectedReferenceImages
  })
  
  // 将新批次添加到数组开头（最新的在上面）
  generationBatches.value.unshift(newBatch)

  // 限制批次数量，删除最旧的批次
  if (generationBatches.value.length > MAX_BATCHES) {
    const removed = generationBatches.value.splice(MAX_BATCHES)
    console.log(`[内存优化] 删除${removed.length}个旧批次，当前批次数: ${generationBatches.value.length}`)
  }
  
  // 设置兼容变量（用于历史记录保存等功能）
  generatedImages.value = []
  completedTasks.value = 0
  generationTasks.value = tasks

  try {
    console.log('发送给AI的完整提示词:', finalPrompt)
    
    // 过滤掉undefined和null值
    const validFiles = uploadedFiles.value.filter(file => file !== undefined && file !== null)
    console.log('原始uploadedFiles:', uploadedFiles.value)
    console.log('过滤后的validFiles:', validFiles)
    
    const result = await generateImages({
      prompt: finalPrompt,
      size: imageSize.value,
      paramType: currentParamConfig.value.paramType,
      quantity: generateQuantity.value,
      mode: generationMode.value,
      modelId: selectedModelId.value,
      images: validFiles, // 传递过滤后的图片
      imageSize: imageResolution.value
    })

    console.log('生成任务提交结果:', result)

    // 更新批次状态为处理中，并更新所有任务状态
    const batch = generationBatches.value.find(b => b.id === batchId)
    if (batch) {
      batch.status = 'processing'
      // 同时更新所有任务状态为 processing
      batch.tasks.forEach(task => {
        if (task.status === 'pending') {
          task.status = 'processing'
        }
      })
    }

    if (result.taskId) {
      // 轮询查询结果，传入批次ID
      await pollGenerationResult(result.taskId, batchId)
    } else {
      throw new Error('任务提交失败')
    }
    
  } catch (error) {
    console.error('生成图片失败:', error)
    
    // 标记所有任务为失败
    generationTasks.value.forEach(task => {
      task.status = 'failed'
      task.error = error.message || '未知错误'
    })
    
    // 更新批次状态为失败
    const batch = generationBatches.value.find(b => b.id === batchId)
    if (batch) {
      batch.status = 'failed'
      batch.tasks.forEach(task => {
        task.status = 'failed'
        task.error = error.message || '未知错误'
      })
    }
    
    // 显示错误消息
    ElMessage.error('生成图片失败: ' + (error.message || '未知错误'))
  }
}

// 轮询查询生成结果 - 优化轮询策略以支持慢速图片生成
const pollGenerationResult = async (taskId, batchId = null) => {
  const maxAttempts = 360 // 增加到360次，每5秒一次，最多30分钟
  const pollingInterval = 5000 // 固定5秒轮询间隔
  let lastStatus = null
  let lastImageCount = 0 // 跟踪已显示的图片数量

  // 查找对应的批次
  const batch = batchId ? generationBatches.value.find(b => b.id === batchId) : null

  for (let i = 0; i < maxAttempts; i++) {
    // 检查轮询是否被取消
    if (pollingController.value.cancelled) {
      console.log('[图片轮询] 轮询已取消')
      return
    }

    try {
      const result = await getGenerationResult(taskId)
      console.log(`查询结果 (${i + 1}/${maxAttempts}, 间隔${pollingInterval/1000}秒):`, result)

      // 如果状态发生变化，记录日志
      if (result.status !== lastStatus) {
        console.log(`任务状态变化: ${lastStatus} -> ${result.status}`)
        lastStatus = result.status
      }

      // 获取当前已生成的图片
      const currentImages = result.results || []
      const targetTasks = batch ? batch.tasks : generationTasks.value

      // 检查是否有新图片生成
      if (currentImages.length > lastImageCount) {
        console.log(`发现新图片: ${currentImages.length - lastImageCount}张`)

        // 处理新生成的图片（从lastImageCount开始的部分）
        for (let j = lastImageCount; j < currentImages.length; j++) {
          const image = currentImages[j]
          const taskIndex = j

          if (taskIndex < targetTasks.length) {
            if (image.url && !image.error) {
              // 成功的图片 - 立即更新UI
              targetTasks[taskIndex].status = 'completed'
              targetTasks[taskIndex].imageUrl = image.url
              targetTasks[taskIndex].progress = 100

              // 如果是最新批次，立即添加到显示列表
              if (!batch || generationBatches.value[0]?.id === batchId) {
                // 添加到generatedImages用于显示
                const newImage = {
                  url: image.url,
                  index: image.index,
                  timestamp: image.timestamp
                }
                generatedImages.value.push(newImage)
                completedTasks.value++
              }

              // 如果开启了自动下载，且该图片未下载过
              if (autoDownloadEnabled.value && !targetTasks[taskIndex].downloaded) {
                console.log(`[自动下载] 准备下载第 ${taskIndex + 1} 张图片`)
                targetTasks[taskIndex].downloaded = true // 标记为已下载，避免重复下载

                // 延迟一点时间再下载，避免并发过多
                setTimeout(async () => {
                  try {
                    await downloadImage(image.url, `image_${Date.now()}_${taskIndex + 1}`)
                    console.log(`[自动下载] 第 ${taskIndex + 1} 张图片下载成功`)
                  } catch (downloadError) {
                    console.error(`[自动下载] 第 ${taskIndex + 1} 张图片下载失败:`, downloadError)
                    targetTasks[taskIndex].downloaded = false // 下载失败，重置标记
                  }
                }, 500 * (taskIndex % 3)) // 错开下载时间，每3张为一组
              }
            } else {
              // 失败的图片
              targetTasks[taskIndex].status = 'failed'
              targetTasks[taskIndex].error = image.error || '生成失败'
            }
          }
        }

        // 更新批次结果（如果有批次）
        if (batch) {
          batch.results = currentImages.filter(img => img.url && !img.error).map(img => ({
            url: img.url,
            index: img.index,
            timestamp: img.timestamp
          }))

          // 更新批次进度
          if (result.progress) {
            batch.progress = result.progress
          }
        }

        lastImageCount = currentImages.length
      }

      // 检查是否完成
      if (result.status === 'completed' || result.status === 'partial' || result.status === 'failed') {
        console.log('生成任务完成，最终状态:', result.status)
        console.log(`最终结果: 成功${result.successCount}/${result.totalCount}`)

        // 更新批次最终状态
        if (batch) {
          batch.status = result.status
          batch.progress = 100

          // 确保所有任务状态都更新
          const totalCount = result.totalCount || targetTasks.length
          for (let k = currentImages.length; k < totalCount; k++) {
            if (k < targetTasks.length && targetTasks[k].status === 'pending') {
              targetTasks[k].status = 'failed'
              targetTasks[k].error = '任务未执行'
            }
          }
        }

        // 自动保存到历史记录
        console.log('[图片生成] 准备保存到历史记录')
        try {
          await saveToHistoryAutomatically()
          console.log('[图片生成] 历史记录保存完成')
        } catch (historyError) {
          console.error('[图片生成] 保存历史记录失败:', historyError)
        }

        // 根据结果显示不同的消息
        if (result.status === 'completed') {
          ElMessage.success(`成功生成${result.successCount || 0}张图片！`)
        } else if (result.status === 'partial') {
          ElMessage.warning(`部分生成完成：成功${result.successCount || 0}张，失败${(result.totalCount || 0) - (result.successCount || 0)}张`)
        } else {
          ElMessage.error(`图片生成失败`)
        }

        // 生成结束，退出轮询
        return
      } else if (result.status === 'failed') {
        // 任务失败
        console.error('生成失败:', result.error)
        ElMessage.error('生成图片失败: ' + (result.error || '未知错误'))

        if (batch) {
          batch.status = 'failed'
        }

        return
      }

      // 等待下一次轮询
      await new Promise(resolve => setTimeout(resolve, pollingInterval))
    } catch (error) {
      console.error(`轮询查询失败 (${i + 1}/${maxAttempts}):`, error)

      // 如果是网络错误，继续重试
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, pollingInterval))
      } else {
        // 达到最大重试次数
        ElMessage.error('查询生成结果超时，请刷新页面重试')

        if (batch) {
          batch.status = 'failed'
        }
      }
    }
  }

  // 超时处理
  console.error('轮询超时，未能获取最终结果')
  ElMessage.error('生成超时，请检查网络连接或联系技术支持')

  if (batch) {
    batch.status = 'failed'
  }
}

// 辅助函数：判断URL是否需要通过代理下载（避免CORS）
const needsProxyDownload = (url) => {
  return (
    url.includes('creatimage.oss-cn-beijing.aliyuncs.com') || // 阿里云OSS
    url.includes('tos-cn-beijing.volces.com') || // 字节跳动OSS (豆包)
    url.includes('ark-content-generation') || // 字节跳动方舟
    (url.startsWith('http') && !url.includes('localhost')) // 其他外部URL
  )
}

// 根据比例标签获取对应的CSS类
const getRatioClass = (label) => {
  // 先检查是否包含比例符号（如 1:1, 16:9）
  if (label.includes('1:1')) return 'ratio-1-1'
  if (label.includes('16:9')) return 'ratio-16-9'
  if (label.includes('9:16')) return 'ratio-9-16'
  if (label.includes('4:3')) return 'ratio-4-3'
  if (label.includes('3:4')) return 'ratio-3-4'
  if (label.includes('3:2')) return 'ratio-3-2'
  if (label.includes('2:3')) return 'ratio-2-3'
  if (label.includes('21:9')) return 'ratio-21-9'
  if (label.includes('9:21')) return 'ratio-9-21'
  if (label.includes('4:5')) return 'ratio-4-5'
  if (label.includes('5:4')) return 'ratio-5-4'

  // 如果是像素尺寸（如 1024x1024, 1792x1024），从中提取比例
  const sizeMatch = label.match(/(\d+)x(\d+)/)
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1])
    const height = parseInt(sizeMatch[2])

    // 计算宽高比
    const ratio = width / height

    // 根据比例返回对应的CSS类
    if (Math.abs(ratio - 1) < 0.1) return 'ratio-1-1'        // 1:1 (正方形)
    if (Math.abs(ratio - 16/9) < 0.1) return 'ratio-16-9'    // 16:9 (横图)
    if (Math.abs(ratio - 9/16) < 0.1) return 'ratio-9-16'    // 9:16 (竖图)
    if (Math.abs(ratio - 4/3) < 0.1) return 'ratio-4-3'      // 4:3 (横图)
    if (Math.abs(ratio - 3/4) < 0.1) return 'ratio-3-4'      // 3:4 (竖图)
    if (Math.abs(ratio - 3/2) < 0.1) return 'ratio-3-2'      // 3:2 (横图)
    if (Math.abs(ratio - 2/3) < 0.1) return 'ratio-2-3'      // 2:3 (竖图)
    if (Math.abs(ratio - 21/9) < 0.1) return 'ratio-21-9'    // 21:9 (超宽)
    if (Math.abs(ratio - 9/21) < 0.1) return 'ratio-9-21'    // 9:21 (超窄)
    if (Math.abs(ratio - 4/5) < 0.1) return 'ratio-4-5'      // 4:5 (竖图)
    if (Math.abs(ratio - 5/4) < 0.1) return 'ratio-5-4'      // 5:4 (横图)

    // 如果宽度大于高度，返回横图样式，否则返回竖图样式
    if (ratio > 1) return 'ratio-16-9'
    if (ratio < 1) return 'ratio-9-16'
  }

  return 'ratio-1-1'
}

// 重置表单
const resetForm = () => {
  prompt.value = ''
  promptTags.value = []
  videoPromptTags.value = [] // 清空视频提示词标签
  uploadedImages.value = [] // 修复：使用正确的变量名
  generatedImages.value = []
  uploadedFiles.value = [] // 清除文件引用
  imageSize.value = '1024x1792'
  generateQuantity.value = 1
  generationMode.value = 'text-to-image'
  uploadRef.value?.clearFiles()
  
  // 清空多行标签输入组件的内容
  if (multilineTagInputRef.value) {
    multilineTagInputRef.value.clearTags()
    multilineTagInputRef.value.setInputText('')
  }
  
  // 清空视频多行标签输入组件的内容
  if (videoMultilineTagInputRef.value) {
    videoMultilineTagInputRef.value.clearTags()
    videoMultilineTagInputRef.value.setInputText('')
  }
  
  // 重置任务状态
  generationTasks.value = []
  completedTasks.value = 0
  // 注意：不清除 generationBatches，用户需要手动清除各批次
}

// ==================== 批次管理辅助函数 ====================

// 格式化时间戳显示
const formatTimestamp = (date) => {
  return new Date(date).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取批次状态文本
// 简化错误信息，避免超出容器
const getSimplifiedError = (error) => {
  if (!error) return '生成出错或违规，请重试'
  
  // 统一简化为简短提示
  return '生成出错或违规，请重试'
}

const getBatchStatusText = (batch) => {
  if (!batch.tasks || batch.tasks.length === 0) {
    return '无任务'
  }
  
  const completed = batch.tasks.filter(t => t.status === 'completed').length
  const failed = batch.tasks.filter(t => t.status === 'failed').length
  const total = batch.tasks.length
  
  if (batch.status === 'completed') {
    return `已完成 ${completed}/${total}`
  }
  if (batch.status === 'partial') {
    // 🔧 简化：不显示失败个数
    return `已完成 ${completed}/${total}`
  }
  if (batch.status === 'failed') {
    return `失败 ${failed}/${total}`
  }
  if (batch.status === 'processing') {
    return `进行中 ${completed}/${total}`
  }
  return `等待中 ${completed}/${total}`
}

// 获取批次的模型名称
const getBatchModelName = (batch) => {
  if (!batch.params) return null
  
  // 图片生成模式
  if (batch.type === 'image' && batch.params.modelId) {
    const model = availableModels.value.find(m => m.id === batch.params.modelId)
    return model?.name || null
  }
  
  // 视频生成模式
  if (batch.type === 'video' && batch.params.modelDbId) {
    const model = videoModels.value.find(m => m.id === batch.params.modelDbId)
    return model?.name || null
  }
  
  return null
}

// 移除指定批次
const removeBatch = (batchId) => {
  const index = generationBatches.value.findIndex(b => b.id === batchId)
  if (index !== -1) {
    const batch = generationBatches.value[index]

    // 如果是视频批次，释放视频相关的 Object URL
    if (batch.type === 'video' && batch.results) {
      batch.results.forEach(result => {
        if (result.url && result.url.startsWith('blob:')) {
          URL.revokeObjectURL(result.url)
          console.log('[内存清理] 释放视频 Object URL:', result.url)
        }
      })
    }

    generationBatches.value.splice(index, 1)
    ElMessage.success('批次已移除')
  }
}

// 清除所有批次
const clearAllBatches = () => {
  if (generationBatches.value.length === 0) {
    ElMessage.info('暂无批次')
    return
  }

  // 释放所有视频批次的 Object URL
  generationBatches.value.forEach(batch => {
    if (batch.type === 'video' && batch.results) {
      batch.results.forEach(result => {
        if (result.url && result.url.startsWith('blob:')) {
          URL.revokeObjectURL(result.url)
          console.log('[内存清理] 释放视频 Object URL:', result.url)
        }
      })
    }
  })

  generationBatches.value = []
  ElMessage.success('已清除所有批次')
}

// ==================== 下载相关函数 ====================

// 下载单张图片
const downloadSingleImage = async (image, index) => {
  try {
    ElMessage.info('正在准备下载...')
    
    const downloadUrl = image.originalUrl || image.url
    
    // 根据URL类型选择下载方式
    let response
    if (needsProxyDownload(downloadUrl)) {
      // 使用代理API下载，避免CORS问题
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(downloadUrl)}`
      response = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
    } else {
      // 直接下载本地图片
      response = await fetch(downloadUrl)
    }
    
    if (!response.ok) {
      throw new Error('获取图片失败')
    }
    
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    
    // 创建下载链接
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `generated-image-${index + 1}-${Date.now()}.png`
    link.target = '_self' // 确保在当前窗口下载
    
    // 触发下载
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 清理blob URL
    URL.revokeObjectURL(blobUrl)
    
    ElMessage.success(`第${index + 1}张图片下载成功！`)
  } catch (error) {
    console.error('下载失败:', error)
    ElMessage.error('下载失败: ' + (error.message || '未知错误'))
  }
}

// 统一下载所有结果（图片和视频）
const downloadAllResults = async () => {
  // 收集所有完成批次的结果（包括部分完成）
  const allResults = []
  generationBatches.value.forEach(batch => {
    if ((batch.status === 'completed' || batch.status === 'partial') && batch.results && batch.results.length > 0) {
      batch.results.forEach(result => {
        allResults.push({
          ...result,
          type: batch.type
        })
      })
    }
  })
  
  if (allResults.length === 0) {
    ElMessage.warning('没有可下载的内容')
    return
  }
  
  try {
    ElMessage.info('正在准备批量下载...')
    let imageCount = 0
    let videoCount = 0
    let failCount = 0
    
    for (let i = 0; i < allResults.length; i++) {
      const result = allResults[i]

      try {
        if (result.isVideo || result.type === 'video') {
          // 下载视频
          await downloadVideo(result.url, `video-${videoCount + 1}`)
          videoCount++
        } else {
          // 下载图片
          const downloadUrl = result.originalUrl || result.url

          if (!downloadUrl) {
            console.error(`第${i + 1}项没有有效的URL`)
            failCount++
            continue
          }

          console.log(`下载第${i + 1}项, URL:`, downloadUrl, '需要代理:', needsProxyDownload(downloadUrl))

          // 根据URL类型选择下载方式，避免CORS问题
          const fetchUrl = needsProxyDownload(downloadUrl)
            ? `/api/proxy-image?url=${encodeURIComponent(downloadUrl)}`
            : downloadUrl

          const response = await fetch(fetchUrl, needsProxyDownload(downloadUrl) ? {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          } : {})

          if (!response.ok) {
            console.error(`第${i + 1}项下载失败, 状态码:`, response.status, '响应URL:', fetchUrl)
            throw new Error(`HTTP ${response.status}`)
          }

          const blob = await response.blob()
          console.log(`第${i + 1}项blob类型:`, blob.type, '大小:', blob.size)

          // 放宽验证条件，允许octet-stream（某些代理可能不返回正确的content-type）
          if (blob.size === 0) {
            throw new Error('文件为空')
          }

          const blobUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = `image-${imageCount + 1}-${Date.now()}.png`
          link.target = '_self'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(blobUrl)
          imageCount++
        }
      } catch (error) {
        console.error(`下载第${i + 1}项失败:`, error)
        failCount++
      }

      // 添加延迟避免浏览器阻止多个下载
      if (i < allResults.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    if (imageCount > 0 || videoCount > 0) {
      let msg = '成功下载'
      if (imageCount > 0) msg += `${imageCount}张图片`
      if (videoCount > 0) msg += `${imageCount > 0 ? '，' : ''}${videoCount}个视频`
      if (failCount > 0) msg += `，${failCount}项失败`
      ElMessage.success(msg)
    } else {
      ElMessage.error('所有内容下载失败')
    }
  } catch (error) {
    console.error('批量下载失败:', error)
    ElMessage.error('批量下载失败: ' + (error.message || '未知错误'))
  }
}

// 清空所有生成结果（只清空显示，不删除历史数据）
const clearAllResults = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空生成结果面板吗？（不会删除历史记录）',
      '清空确认',
      {
        confirmButtonText: '确定清空',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 只清空显示的批次数组，不影响历史记录数据库
    generationBatches.value = []
    generatedImages.value = []

    ElMessage.success('已清空生成结果面板')
  } catch (error) {
    // 用户取消操作
  }
}

// 下载所有图片（向后兼容）
const downloadAllImages = async () => {
  if (generatedImages.value.length === 0) {
    ElMessage.warning('没有可下载的图片')
    return
  }

  try {
    ElMessage.info('正在准备批量下载...')
    const results = []
    
    for (let i = 0; i < generatedImages.value.length; i++) {
      const image = generatedImages.value[i]
      
      try {
        // 始终使用原始链接（FAL链接），确保下载原图
        const downloadUrl = image.originalUrl || image.url
        
        console.log(`下载第${i + 1}张图片: ${downloadUrl}`)
        
        // 根据URL类型选择下载方式，避免CORS问题
        let response
        if (needsProxyDownload(downloadUrl)) {
          // 使用代理API下载，避免CORS问题
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(downloadUrl)}`
          console.log(`[批量下载] 使用代理: ${proxyUrl}`)
          response = await fetch(proxyUrl, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          })
        } else {
          // 直接下载本地图片
          console.log(`[批量下载] 直接下载: ${downloadUrl}`)
          response = await fetch(downloadUrl)
        }
        
      if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const blob = await response.blob()
        
        // 验证blob类型
        if (!blob.type.startsWith('image/')) {
          throw new Error('不是有效的图片文件')
        }
        
      const blobUrl = URL.createObjectURL(blob)
      
      // 创建下载链接
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `generated-image-${i + 1}-${Date.now()}.png`
        link.target = '_self'
      
      // 触发下载
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // 清理blob URL
      URL.revokeObjectURL(blobUrl)
        
        results.push({ index: i + 1, success: true })
        console.log(`第${i + 1}张图片下载成功`)
        
      } catch (error) {
        console.error(`下载第${i + 1}张图片失败:`, error)
        results.push({ 
          index: i + 1, 
          success: false, 
          error: error.message 
        })
      }
      
      // 添加延迟避免浏览器阻止多个下载
      if (i < generatedImages.value.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length
    
    if (successCount > 0) {
      ElMessage.success(`成功下载${successCount}张图片${failCount > 0 ? `，${failCount}张失败` : ''}`)
    } else {
      ElMessage.error('所有图片下载失败')
    }
    
  } catch (error) {
    console.error('批量下载失败:', error)
    ElMessage.error('批量下载失败: ' + (error.message || '未知错误'))
  }
}

// 保存图片到本地
const saveImageToLocal = async (imageUrl) => {
  try {
    // 获取图片数据
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error('获取图片失败')
    }
    
    const blob = await response.blob()
    
    // 创建本地blob URL
    const localUrl = URL.createObjectURL(blob)
    
    // 保存blob到本地存储（可选，用于持久化）
    const timestamp = Date.now()
    const fileName = `generated-image-${timestamp}.png`
    
    // 将blob URL和文件名存储到本地，以便后续使用
    const imageData = {
      url: localUrl,
      fileName: fileName,
      blob: blob,
      timestamp: timestamp
    }
    
    // 存储到sessionStorage（页面刷新后失效，但避免内存泄漏）
    sessionStorage.setItem(`image_${timestamp}`, JSON.stringify({
      url: localUrl,
      fileName: fileName,
      timestamp: timestamp
    }))
    
    return localUrl
  } catch (error) {
    console.error('保存图片到本地失败:', error)
    throw new Error('保存图片到本地失败: ' + error.message)
  }
}

// 自动保存到历史记录
const saveToHistoryAutomatically = async () => {
  console.log('[历史记录] saveToHistoryAutomatically 被调用')
  console.log('[历史记录] generationBatches.value.length:', generationBatches.value.length)

  // ✅ 改为检查最新的批次而不是只检查 generatedImages
  const latestBatch = generationBatches.value.length > 0 ? generationBatches.value[0] : null

  console.log('[历史记录] latestBatch:', latestBatch ? { id: latestBatch.id, type: latestBatch.type, isHistory: latestBatch.isHistory, tasksCount: latestBatch.tasks?.length } : null)

  if (!latestBatch || latestBatch.isHistory) {
    // 没有批次或者是历史记录批次，不保存
    console.log('[历史记录] 跳过保存：', !latestBatch ? '无批次' : '是历史记录批次')
    return
  }

  console.log('[历史记录] historyPanelRef.value:', !!historyPanelRef.value)
  
    // 检测是否是视频生成
  const isVideoGeneration = latestBatch.type === 'video'
    
    // 获取完整的提示词内容（根据生成类型使用不同的提示词源）
    let fullPrompt = ''
    if (isVideoGeneration) {
      // 视频生成使用videoMultilineTagInputRef
      if (videoMultilineTagInputRef.value) {
        fullPrompt = videoMultilineTagInputRef.value.getAllOriginalContent() || videoMultilineTagInputRef.value.getFullText()
      } else if (videoPromptTags.value.length > 0) {
        const mappedTags = videoPromptTags.value.map(tag => videoTagMapping.value[tag] || tag)
        fullPrompt = mappedTags.join(', ')
      }
      console.log('[历史记录] 视频生成提示词:', fullPrompt)
    } else {
      // 图片生成使用multilineTagInputRef
      if (multilineTagInputRef.value) {
        fullPrompt = multilineTagInputRef.value.getAllOriginalContent()
      } else {
        fullPrompt = prompt.value
      }
    }
  
  // ✅ 从批次的tasks构建完整的generatedImages数组（包括成功和失败的）
  const allGeneratedImages = latestBatch.tasks.map(task => {
    if (task.status === 'completed' && task.imageUrl) {
      // 成功的图片
      return {
        url: task.imageUrl,
        index: task.index,
        timestamp: Date.now()
      }
    } else if (task.status === 'failed') {
      // 失败的图片，保存错误信息
      return {
        error: task.error || '生成失败',
        index: task.index,
        timestamp: Date.now()
      }
    }
    return null
  }).filter(Boolean)
    
    const historyItem = {
    prompt: fullPrompt || latestBatch.prompt,
    mode: isVideoGeneration ? 'video-generation' : (latestBatch.params?.mode || generationMode.value),
    size: isVideoGeneration ? `${videoResolution.value} (${videoRatio.value})` : (latestBatch.params?.size || imageSize.value),
    quantity: isVideoGeneration ? 1 : latestBatch.tasks.length,
    generatedImages: allGeneratedImages, // ✅ 包含成功和失败的完整列表
      referenceImages: uploadedImages.value
        .filter(img => img.url && !img.url.startsWith('blob:')) // 过滤掉 blob URL
        .map(img => ({
        url: img.url,
        name: img.name
      })),
    // 🔧 保存标签、常用提示词选择状态和参考图ID
    tags: promptTags.value, // 新增：保存标签
    selectedCommonPrompts: Array.from(selectedCommonPromptIds.value),
    selectedReferenceImages: uploadedImages.value
      .filter(img => img.dbId && typeof img.dbId === 'number') // 只保存有效的参考图数据库ID
      .map(img => img.dbId),
      timestamp: Date.now()
    }
    
    console.log('[历史记录] 准备保存:', {
      mode: historyItem.mode,
      isVideo: isVideoGeneration,
      totalResults: allGeneratedImages.length,
      successResults: allGeneratedImages.filter(img => img.url).length,
      failedResults: allGeneratedImages.filter(img => img.error).length,
      selectedCommonPrompts: historyItem.selectedCommonPrompts,
      selectedReferenceImages: historyItem.selectedReferenceImages,
      uploadedImagesDetail: uploadedImages.value.map(img => ({
        id: img.id,
        dbId: img.dbId,
        name: img.name,
        hasDbId: !!img.dbId
      }))
    })

    // 调用历史记录组件的添加方法
    console.log('[历史记录] 调用 historyPanelRef.value.addHistoryItem')
    if (historyPanelRef.value && typeof historyPanelRef.value.addHistoryItem === 'function') {
      historyPanelRef.value.addHistoryItem(historyItem)
      console.log('[历史记录] addHistoryItem 调用成功')
    } else {
      console.error('[历史记录] historyPanelRef 不可用或 addHistoryItem 方法不存在:', {
        refExists: !!historyPanelRef.value,
        hasMethod: historyPanelRef.value ? typeof historyPanelRef.value.addHistoryItem : 'ref不存在'
      })
    }
}

// 保存到历史记录（保留原有函数，但不再手动调用）

// 辅助函数：转义正则表达式特殊字符
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 从历史记录加载
const loadFromHistory = async (historyItem) => {
  console.log('[加载历史记录]', historyItem)
  console.log('[加载历史记录] tags字段:', historyItem.tags, ', 类型:', typeof historyItem.tags)
  console.log('[加载历史记录] selectedCommonPrompts字段:', historyItem.selectedCommonPrompts)
  console.log('[加载历史记录] selectedReferenceImages字段:', historyItem.selectedReferenceImages)
  
  // 检查是否是视频模式
  if (historyItem.mode === 'video-generation') {
    console.log('[加载视频历史] 视频模式，开始加载参数')
    
    // 切换到视频生成模式
    generationMode.value = 'image-to-video'
    
    // 清空视频相关状态
    firstFrameFile.value = null
    firstFramePreview.value = ''
    lastFrameFile.value = null
    lastFramePreview.value = ''
    
    // 加载视频提示词
    console.log('[加载视频历史] 提示词:', historyItem.prompt)
    console.log('[加载视频历史] videoMultilineTagInputRef:', videoMultilineTagInputRef.value)
    
    if (historyItem.prompt) {
      if (videoMultilineTagInputRef.value) {
        videoMultilineTagInputRef.value.setFullText(historyItem.prompt)
        console.log('[加载视频历史] 提示词已设置通过ref')
      } else {
        // 备用：直接设置到prompt变量
        prompt.value = historyItem.prompt
        console.log('[加载视频历史] 提示词已设置到prompt变量')
      }
    }
    
    // 加载视频模型
    // 优先从 modelId 读取（数据库存储的字段），备用从 videoData.videoModelId
    console.log('[加载视频历史] modelId检查:', {
      hasModelId: !!historyItem.modelId,
      modelId: historyItem.modelId,
      modelIdType: typeof historyItem.modelId,
      hasVideoData: !!historyItem.videoData,
      videoDataModelId: historyItem.videoData?.videoModelId,
      currentVideoModels: videoModels.value.map(m => ({ id: m.id, name: m.name }))
    })

    if (historyItem.modelId) {
      // 确保转换为数字（如果是数字字符串）
      const modelId = typeof historyItem.modelId === 'string' ? parseInt(historyItem.modelId) : historyItem.modelId
      videoSelectedModelId.value = modelId
      console.log('[加载视频历史] 视频模型已设置:', modelId, '(原始值:', historyItem.modelId, ')')
    } else if (historyItem.videoData && historyItem.videoData.videoModelId) {
      const modelId = typeof historyItem.videoData.videoModelId === 'string' ? parseInt(historyItem.videoData.videoModelId) : historyItem.videoData.videoModelId
      videoSelectedModelId.value = modelId
      console.log('[加载视频历史] 视频模型已设置（从videoData）:', modelId, '(原始值:', historyItem.videoData.videoModelId, ')')
    }
    
    // 加载视频参数
    if (historyItem.videoData) {
      if (historyItem.videoData.duration) {
        videoDuration.value = historyItem.videoData.duration
      }
      if (historyItem.videoData.resolution) {
        videoResolution.value = historyItem.videoData.resolution
      }
      if (historyItem.videoData.ratio) {
        videoRatio.value = historyItem.videoData.ratio
      }
    }
    
    // 加载参考图（如果有）
    console.log('[加载视频历史] 检查参考图:', {
      hasReferenceImages: !!historyItem.referenceImages,
      count: historyItem.referenceImages?.length,
      referenceImages: historyItem.referenceImages
    })
    
    if (historyItem.referenceImages && historyItem.referenceImages.length > 0) {
      console.log('[加载视频历史] 开始加载参考图:', historyItem.referenceImages)
      
      for (const refImage of historyItem.referenceImages) {
        try {
          if (!refImage || !refImage.url) {
            console.warn('[加载视频历史] 跳过无效参考图:', refImage)
            continue
          }
          
          console.log('[加载视频历史] 加载参考图:', { type: refImage.type, url: refImage.url })
          
          // 使用代理接口获取图片
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(refImage.url)}`
          const response = await fetch(proxyUrl, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          })
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          const blob = await response.blob()
          const file = new File([blob], refImage.name || 'referenceImage.png', {
            type: blob.type || 'image/png'
          })
          
          console.log('[加载视频历史] Blob转换成功:', { size: blob.size, type: blob.type })
          
          // 根据类型加载到对应的位置
          if (refImage.type === 'first') {
            firstFrameFile.value = file
            firstFramePreview.value = URL.createObjectURL(blob)
            console.log('[加载视频历史] 首帧参考图已设置')
          } else if (refImage.type === 'last') {
            lastFrameFile.value = file
            lastFramePreview.value = URL.createObjectURL(blob)
            console.log('[加载视频历史] 尾帧参考图已设置')
          }
          
          console.log('[加载视频历史] 参考图加载成功:', refImage.type)
        } catch (error) {
          console.error('[加载视频历史] 参考图加载失败:', error)
          ElMessage.warning(`参考图加载失败: ${error.message}`)
        }
      }
    } else {
      console.log('[加载视频历史] 无参考图数据（文生视频或旧记录）')
    }
    
    // 加载生成的视频到结果区
    if (historyItem.generatedImages && historyItem.generatedImages.length > 0) {
      const videoResult = historyItem.generatedImages[0]
      
      // 创建视频批次
      const batchId = `batch_video_history_${Date.now()}`
      const newBatch = {
        id: batchId,
        type: 'video',
        timestamp: new Date(historyItem.createdAt),
        status: 'completed',
        tasks: [{
          id: `task_${Date.now()}`,
          status: 'completed',
          index: 1
        }],
        results: [{
          isVideo: true,
          url: videoResult.url,
          duration: videoResult.duration || historyItem.videoData?.duration || '10',
          resolution: videoResult.resolution || historyItem.videoData?.resolution || '1080p',
          ratio: videoResult.ratio || historyItem.videoData?.ratio || '16:9',
          seed: videoResult.seed || historyItem.videoData?.seed,
          timestamp: new Date(historyItem.createdAt).getTime()
        }],
        prompt: historyItem.prompt,
        tags: historyItem.tags || [], // 保存标签
        selectedCommonPrompts: historyItem.selectedCommonPrompts || [], // 保存常用提示词
        params: {
          modelId: historyItem.videoData?.videoModelId,
          duration: historyItem.videoData?.duration,
          resolution: historyItem.videoData?.resolution
        }
      }
      
      generationBatches.value.unshift(newBatch)
    }
    
    // 不显示提示，由 HistoryPanel 统一显示
    return
  }
  
  // 图片模式处理
  // 只在数据为空时才加载，避免重复加载
  const loadPromises = []
  if (commonPrompts.value.length === 0) {
    loadPromises.push(loadCommonPrompts())
  }
  if (userPrompts.value.length === 0) {
    loadPromises.push(loadUserPrompts())
  }

  // 并行加载，提高速度
  if (loadPromises.length > 0) {
    await Promise.all(loadPromises)
  }

  // 清空当前状态
  promptTags.value = []
  prompt.value = ''
  selectedCommonPromptIds.value.clear()

  // 清空多行输入组件（如果存在）
  if (multilineTagInputRef.value) {
    multilineTagInputRef.value.clearTags()
    multilineTagInputRef.value.setInputText('')
  }

  // 等待 DOM 更新
  await nextTick()

  // 🔧 新增：先恢复标签
  if (historyItem.tags && historyItem.tags.length > 0) {
    console.log('[历史记录加载] 恢复标签:', historyItem.tags)
    promptTags.value = historyItem.tags

    if (multilineTagInputRef.value) {
      historyItem.tags.forEach(tag => {
        multilineTagInputRef.value.addTag(tag)
      })
    }
    console.log('[历史记录加载] 已恢复', historyItem.tags.length, '个标签')
  } else {
    console.log('[历史记录加载] 警告：此历史记录没有tags字段，可能是旧版本记录')
  }

  // 🔧 优化：先恢复常用提示词选择状态，再处理手动输入的提示词
  if (historyItem.selectedCommonPrompts && historyItem.selectedCommonPrompts.length > 0) {
    console.log('[历史记录加载] 恢复常用提示词:', historyItem.selectedCommonPrompts)
    
    // 确保常用提示词已加载
    if (commonPrompts.value.length === 0) {
      await loadCommonPrompts()
    }
    
    // 恢复选择状态
    historyItem.selectedCommonPrompts.forEach(promptId => {
      selectedCommonPromptIds.value.add(promptId)
    })
    
    console.log('[历史记录加载] 已恢复', selectedCommonPromptIds.value.size, '个常用提示词')

    // 从完整提示词中移除常用提示词和标签映射的内容，只保留用户手动输入的部分
    let manualPrompt = historyItem.prompt || ''

    // 获取所有选中的常用提示词内容
    const selectedCommonPromptTexts = historyItem.selectedCommonPrompts
      .map(id => {
        const commonPrompt = commonPrompts.value.find(cp => cp.id === id)
        return commonPrompt?.content || ''
      })
      .filter(text => text.length > 0)

    // 获取所有标签映射的内容
    const tagMappingTexts = (historyItem.tags || [])
      .map(tag => tagMapping.value[tag] || '')
      .filter(text => text.length > 0)

    // 从完整提示词中移除所有常用提示词的内容
    for (const commonText of selectedCommonPromptTexts) {
      // 尝试精确匹配并移除（包括可能的逗号和空格）
      manualPrompt = manualPrompt.replace(new RegExp(`${escapeRegExp(commonText)}\\s*,?\\s*`, 'g'), '')
      manualPrompt = manualPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(commonText)}\\s*`, 'g'), '')
    }

    // 从完整提示词中移除所有标签映射的内容
    for (const tagText of tagMappingTexts) {
      manualPrompt = manualPrompt.replace(new RegExp(`${escapeRegExp(tagText)}\\s*,?\\s*`, 'g'), '')
      manualPrompt = manualPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(tagText)}\\s*`, 'g'), '')
    }
    
    // 清理多余的逗号和空格
    manualPrompt = manualPrompt
      .replace(/,\s*,/g, ',')  // 连续的逗号
      .replace(/^\s*,\s*/, '')  // 开头的逗号
      .replace(/,\s*$/, '')     // 结尾的逗号
      .trim()
    
    console.log('[历史记录加载] 分离后的手动提示词:', manualPrompt)
    
    // 设置手动输入的提示词（不包含常用提示词和标签映射）
    if (multilineTagInputRef.value) {
      multilineTagInputRef.value.setInputText(manualPrompt)
    } else {
      prompt.value = manualPrompt
    }
  } else {
    // 旧版本记录，没有常用提示词选择信息
    // 检查是否有标签信息，如果有则尝试分离标签映射
    if (historyItem.tags && historyItem.tags.length > 0) {
      // 有标签但没有常用提示词，只需要移除标签映射的内容
      let manualPrompt = historyItem.prompt || ''

      // 获取所有标签映射的内容
      const tagMappingTexts = (historyItem.tags || [])
        .map(tag => tagMapping.value[tag] || '')
        .filter(text => text.length > 0)

      // 从完整提示词中移除所有标签映射的内容
      for (const tagText of tagMappingTexts) {
        manualPrompt = manualPrompt.replace(new RegExp(`${escapeRegExp(tagText)}\\s*,?\\s*`, 'g'), '')
        manualPrompt = manualPrompt.replace(new RegExp(`,?\\s*${escapeRegExp(tagText)}\\s*`, 'g'), '')
      }

      // 清理多余的逗号和空格
      manualPrompt = manualPrompt
        .replace(/,\s*,/g, ',')  // 连续的逗号
        .replace(/^\s*,\s*/, '')  // 开头的逗号
        .replace(/,\s*$/, '')     // 结尾的逗号
        .trim()

      console.log('[历史记录加载] 分离标签后的手动提示词:', manualPrompt)

      if (manualPrompt) {
        if (multilineTagInputRef.value) {
          multilineTagInputRef.value.setInputText(manualPrompt)
        } else {
          prompt.value = manualPrompt
        }
      }
    } else {
      // 旧版本记录：既没有标签也没有常用提示词，直接使用完整 prompt
      console.log('[历史记录加载] 旧版本记录，直接使用完整提示词')
      const fullPrompt = historyItem.prompt || ''

      if (multilineTagInputRef.value) {
        multilineTagInputRef.value.setInputText(fullPrompt)
      } else {
        prompt.value = fullPrompt
      }
    }
  }
  
  imageSize.value = historyItem.size
  generationMode.value = historyItem.mode
  generateQuantity.value = historyItem.quantity || 1
  
  // 清空当前的上传图片
  uploadedImages.value = []
  uploadedFiles.value = []
  
  // 🔧 优先使用 selectedReferenceImages（参考图ID列表）
  if (historyItem.mode === 'image-to-image') {
    // 方案1：如果有参考图ID列表，通过ID加载
    if (historyItem.selectedReferenceImages && historyItem.selectedReferenceImages.length > 0) {
      console.log('[历史记录加载] 通过ID加载参考图:', historyItem.selectedReferenceImages)
      
      try {
        const loadedImages = await loadReferenceImagesByIds(historyItem.selectedReferenceImages)
        console.log('[历史记录加载] 参考图加载成功:', loadedImages.length, '张')
      } catch (error) {
        console.error('[历史记录加载] 通过ID加载参考图失败:', error)
        ElMessage.warning('参考图加载失败')
      }
    }
    // 方案2：兼容旧格式，使用 referenceImages URL列表
    else if (historyItem.referenceImages && historyItem.referenceImages.length > 0) {
      console.log('[历史记录加载] 通过URL加载参考图（旧格式）')
      
    for (const refImage of historyItem.referenceImages) {
      try {
        // 检查URL是否有效
        if (!refImage || !refImage.url) {
            console.warn('[历史记录加载] 跳过无效的参考图:', refImage)
            continue
          }
          
          // 过滤掉无效的URL
          if (refImage.url.includes('undefined') || refImage.url.startsWith('blob:')) {
            console.warn('[历史记录加载] 跳过无效的参考图URL:', refImage.url)
          continue
        }
        
        // 使用代理接口获取图片，避免CORS问题
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(refImage.url)}`
        const response = await fetch(proxyUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const blob = await response.blob()
        
        // 确保有正确的MIME类型和文件扩展名
        let mimeType = blob.type || 'image/png'
        let fileName = refImage.name || '历史参考图'
        
        // 如果MIME类型为空或无效，根据URL或默认设置为png
        if (!mimeType || !mimeType.startsWith('image/')) {
          mimeType = 'image/png'
        }
        
        // 确保文件名有正确的扩展名
        if (!fileName.includes('.')) {
          const extension = mimeType.split('/')[1] || 'png'
          fileName = `${fileName}.${extension}`
        }
        
        const file = new File([blob], fileName, {
          type: mimeType
        })
        
      const imageData = {
        id: Date.now() + Math.random(),
        url: refImage.url,
          file: file, // 现在有文件引用，可以用于生成
        name: refImage.name || '历史参考图'
      }
        
      uploadedImages.value.push(imageData)
        uploadedFiles.value.push(file) // 同时添加到uploadedFiles数组
      } catch (error) {
        console.error('加载历史参考图失败:', error)
        // 如果加载失败，仍然添加到uploadedImages用于显示，但不会有文件引用
        const imageData = {
          id: Date.now() + Math.random(),
          url: refImage.url,
          file: null,
          name: refImage.name || '历史参考图'
        }
        uploadedImages.value.push(imageData)
        uploadedFiles.value.push(null) // 保持数组同步
      }
    }
    }
    // 方案3：兼容旧格式单张参考图
    else if (historyItem.referenceImage) {
    try {
      // 使用代理接口获取图片，避免CORS问题
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(historyItem.referenceImage)}`
      const response = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const blob = await response.blob()
      
      // 确保有正确的MIME类型和文件扩展名
      let mimeType = blob.type || 'image/png'
      let fileName = '历史参考图'
      
      // 如果MIME类型为空或无效，根据URL或默认设置为png
      if (!mimeType || !mimeType.startsWith('image/')) {
        mimeType = 'image/png'
      }
      
      // 确保文件名有正确的扩展名
      if (!fileName.includes('.')) {
        const extension = mimeType.split('/')[1] || 'png'
        fileName = `${fileName}.${extension}`
      }
      
      const file = new File([blob], fileName, {
        type: mimeType
      })
      
      const imageData = {
        id: Date.now() + Math.random(),
        url: historyItem.referenceImage,
        file: file, // 现在有文件引用，可以用于生成
        name: '历史参考图'
      }
      
      uploadedImages.value.push(imageData)
      uploadedFiles.value.push(file) // 同时添加到uploadedFiles数组
    } catch (error) {
        console.error('[历史记录加载] 加载历史参考图失败:', error)
      // 如果加载失败，仍然添加到uploadedImages用于显示，但不会有文件引用
    const imageData = {
      id: Date.now() + Math.random(),
      url: historyItem.referenceImage,
      file: null,
      name: '历史参考图'
    }
    uploadedImages.value.push(imageData)
    uploadedFiles.value.push(null) // 保持数组同步
      }
    }
  }
  
  // 加载生成的作品
  let loadedImages = []
  if (historyItem.generatedImages) {
    loadedImages = historyItem.generatedImages
    // 只将成功的图片赋值给 generatedImages（用于其他功能）
    generatedImages.value = historyItem.generatedImages.filter(img => img.url && !img.error)
  } else if (historyItem.generatedImage) {
    // 兼容旧格式
    loadedImages = [{
      url: historyItem.generatedImage,
      index: 1,
      timestamp: historyItem.timestamp
    }]
    generatedImages.value = loadedImages
  }
  
  // ✅ 创建批次对象，使历史记录能在生成结果面板显示
  if (loadedImages.length > 0) {
    const historyBatchId = `batch_history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // ✅ 正确处理成功和失败的图片
    const tasks = loadedImages.map((img, index) => {
      // 检查图片是否失败（包含error字段且没有url）
      const hasFailed = img.error || (!img.url && !img.isVideo)

      return {
        id: `task_history_${Date.now()}_${index}`,
        status: hasFailed ? 'failed' : 'completed', // ✅ 根据是否有error设置状态
        imageUrl: img.url || null,
        ossUrl: img.oss_url || img.ossUrl || img.url || null, // ✅ 保存OSS URL
        originalUrl: img.url || null, // ✅ 保存原始URL
        index: img.index || (index + 1),
        progress: hasFailed ? 0 : 100,
        error: img.error || null, // ✅ 保存错误信息
        downloaded: false // 历史记录不算已下载
      }
    })
    
    // 计算成功和失败的数量
    const successCount = tasks.filter(t => t.status === 'completed').length
    const failedCount = tasks.filter(t => t.status === 'failed').length
    
    // ✅ 根据成功失败情况设置批次状态
    let batchStatus = 'completed'
    if (successCount === 0) {
      batchStatus = 'failed' // 全部失败
    } else if (failedCount > 0) {
      batchStatus = 'partial' // 部分失败
    }
    
    const historyBatch = {
      id: historyBatchId,
      type: 'image',
      timestamp: new Date(historyItem.timestamp || Date.now()),
      status: batchStatus, // ✅ 使用计算出的状态
      tasks: tasks,
      results: loadedImages.filter(img => img.url && !img.error), // 只包含成功的结果
      prompt: historyItem.prompt || '',
      originalPrompt: historyItem.originalPrompt || historyItem.prompt || '', // 保存原始提示词
      tags: historyItem.tags || [], // 保存标签
      selectedCommonPrompts: historyItem.selectedCommonPrompts || [], // 保存常用提示词
      selectedReferenceImages: historyItem.selectedReferenceImages || [], // 保存参考图ID
      params: {
        size: historyItem.size || imageSize.value,
        quantity: loadedImages.length,
        mode: historyItem.mode || generationMode.value,
        modelId: historyItem.modelId || selectedModelId.value
      },
      isHistory: true // 标记为历史记录批次
    }
    
    // 将历史批次添加到批次列表顶部
    generationBatches.value.unshift(historyBatch)
    completedTasks.value = successCount
    
    console.log('[历史记录] 已创建批次对象:', {
      batchId: historyBatch.id,
      status: batchStatus,
      success: successCount,
      failed: failedCount,
      total: loadedImages.length
    })
  }
  
  showHistory.value = false
  ElMessage.success('历史记录已加载到生成结果面板')
}

// 处理提示词选择
const handleSelectPrompt = async (promptData) => {
  try {
    console.log('[提示词加载] ========== 开始加载提示词 ==========')
    console.log('[提示词加载] 提示词ID:', promptData.id)
    console.log('[提示词加载] 提示词标题:', promptData.title)
    console.log('[提示词加载] 提示词内容:', promptData.content)
    console.log('[提示词加载] 封面图URL:', promptData.coverImageUrl)
    console.log('[提示词加载] 参考图URL:', promptData.referenceImage)
    console.log('[提示词加载] 完整数据:', JSON.stringify(promptData, null, 2))

    // 1. 彻底清空当前状态
  promptTags.value = []
  prompt.value = ''
  selectedCommonPromptIds.value.clear()
  uploadedImages.value = []
  uploadedFiles.value = []

  console.log('[提示词加载] 已清空当前状态')
  
    // 清空多行输入组件（如果存在）
    if (multilineTagInputRef.value) {
      multilineTagInputRef.value.clearTags()
      multilineTagInputRef.value.setInputText('')
    }
    
    // 2. 恢复生成模式和参数
  generationMode.value = promptData.generation_mode || 'text-to-image'
  imageSize.value = promptData.image_size || '1024x1792'
  generateQuantity.value = promptData.generate_quantity || 1
  
    // 3. 恢复模型选择
    if (promptData.model_id) {
      selectedModelId.value = parseInt(promptData.model_id)
    }
    
    // 4. 等待 DOM 更新
    await nextTick()
    
    // 5. 恢复标签
  if (promptData.tags) {
    try {
      const tags = JSON.parse(promptData.tags)
      promptTags.value = tags
        
        if (multilineTagInputRef.value) {
          tags.forEach(tag => {
            multilineTagInputRef.value.addTag(tag)
          })
        }
    } catch (error) {
      console.error('解析标签失败:', error)
      promptTags.value = []
    }
  }
  
    // 6. 恢复提示词内容
  if (promptData.content && multilineTagInputRef.value) {
    multilineTagInputRef.value.setInputText(promptData.content)
    console.log('[提示词加载] 提示词内容已恢复')
  }
  
    // 7. 恢复选择的常用提示词
  if (promptData.selected_common_prompts) {
    try {
      console.log('[提示词加载] 开始恢复常用提示词选择')
      const selectedIds = JSON.parse(promptData.selected_common_prompts)
      console.log('[提示词加载] 解析到的常用提示词ID:', selectedIds)

      // 如果常用提示词数据为空，先加载
      if (commonPrompts.value.length === 0) {
        console.log('[提示词加载] 常用提示词列表为空，开始加载...')
        await loadCommonPrompts()
        console.log('[提示词加载] 常用提示词加载完成，共', commonPrompts.value.length, '个')
      }

      selectedIds.forEach(id => {
        selectedCommonPromptIds.value.add(id)
        const prompt = commonPrompts.value.find(p => p.id === id)
        if (prompt) {
          console.log('[提示词加载] 恢复常用提示词:', prompt.name, '内容:', prompt.content)
        } else {
          console.warn('[提示词加载] 未找到ID为', id, '的常用提示词')
        }
      })
      console.log('[提示词加载] 常用提示词选择已恢复，共', selectedIds.length, '个')
    } catch (error) {
      console.error('[提示词加载] 解析常用提示词选择失败:', error)
    }
  } else {
    console.log('[提示词加载] 无常用提示词选择需要恢复')
  }
  
    // 8. 恢复参考图（异步加载，不阻塞主流程）
  if (promptData.selected_reference_images) {
    try {
      const selectedImageIds = JSON.parse(promptData.selected_reference_images)
        console.log('[提示词加载] 需要加载的参考图IDs:', selectedImageIds)
        
        // 异步加载参考图，不阻塞主流程
        if (selectedImageIds && selectedImageIds.length > 0) {
          loadReferenceImagesByIds(selectedImageIds).catch(err => {
            console.error('[提示词加载] 加载参考图失败:', err)
          })
        }
    } catch (error) {
      console.error('解析参考图选择失败:', error)
    }
  }
  
  showPromptManager.value = false
  ElMessage.success('提示词已加载')
    console.log('[提示词加载] 加载完成')
  } catch (error) {
    console.error('[提示词加载] 加载失败:', error)
    ElMessage.error('加载提示词失败: ' + (error.message || '未知错误'))
  }
}

// 根据ID列表加载参考图
const loadReferenceImagesByIds = async (imageIds) => {
  try {
    console.log('[参考图加载] 开始加载参考图:', imageIds)

    // 通过API获取参考图详情并下载
    for (const imageId of imageIds) {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/reference-images/${imageId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const refImage = result.data
            const imageUrl = refImage.oss_url || refImage.url

            // 下载图片
            try {
              const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
              const imageResponse = await fetch(proxyUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              })

              if (!imageResponse.ok) {
                throw new Error(`下载失败: ${imageResponse.status}`)
              }

              const blob = await imageResponse.blob()
              const mimeType = blob.type || 'image/png'
              const fileName = refImage.original_name || refImage.name || '参考图'
              const file = new File([blob], fileName, { type: mimeType })

              // 添加到uploadedImages和uploadedFiles
              const imageData = {
                id: refImage.id,
                dbId: refImage.id, // 保存数据库ID用于历史记录
                url: imageUrl,
                file: file,
                name: fileName
              }

              uploadedImages.value.push(imageData)
              uploadedFiles.value.push(file)

              console.log('[参考图加载] 加载成功:', fileName)
            } catch (downloadError) {
              console.error(`[参考图加载] 下载图片 ${imageId} 失败:`, downloadError)
              // 即使下载失败，也添加基本信息（但没有file）
              uploadedImages.value.push({
                id: refImage.id,
                dbId: refImage.id,
                url: imageUrl,
                file: null,
                name: refImage.name || refImage.original_name || '参考图'
              })
              uploadedFiles.value.push(null)
            }
          }
        }
      } catch (err) {
        console.error(`[参考图加载] 加载图片 ${imageId} 失败:`, err)
      }
    }

    console.log('[参考图加载] 完成，已加载', uploadedImages.value.length, '张参考图')
    return uploadedImages.value
  } catch (error) {
    console.error('[参考图加载] 加载失败:', error)
    throw error
  }
}

// 选择用户提示词
const selectUserPrompt = async (userPrompt) => {
  console.log('[选择提示词] 开始加载:', userPrompt.title)
  console.log('[选择提示词] 完整数据:', JSON.stringify(userPrompt, null, 2))

  // 清空当前状态
  promptTags.value = []
  prompt.value = ''
  selectedCommonPromptIds.value.clear()
  uploadedImages.value = []
  uploadedFiles.value = []

  // 恢复生成模式和其他设置
  generationMode.value = userPrompt.generation_mode || 'text-to-image'
  imageSize.value = userPrompt.image_size || '1024x1792'
  generateQuantity.value = userPrompt.generate_quantity || 1

  // 等待组件就绪
  await nextTick()
  console.log('[选择提示词] 组件就绪，multilineTagInputRef:', !!multilineTagInputRef.value)

  // 恢复标签和手动输入
  if (userPrompt.tags) {
    try {
      const tags = JSON.parse(userPrompt.tags)
      if (Array.isArray(tags) && tags.length > 0) {
        promptTags.value = tags
        // 由于autoConvertToTags为false，需要手动设置标签
        if (multilineTagInputRef.value) {
          // 先清空现有标签
          multilineTagInputRef.value.clearTags()
          // 逐个添加标签
          tags.forEach(tag => {
            multilineTagInputRef.value.addTag(tag)
          })
          console.log('[选择提示词] 标签已恢复:', tags.length, '个')
        } else {
          console.warn('[选择提示词] multilineTagInputRef 未准备好')
        }
      } else {
        console.log('[选择提示词] 标签数组为空')
      }
    } catch (error) {
      console.error('解析标签失败:', error)
      promptTags.value = []
    }
  } else {
    console.log('[选择提示词] 无标签数据，tags字段值:', userPrompt.tags)
  }

  // 恢复提示词内容
  if (userPrompt.content && multilineTagInputRef.value) {
    multilineTagInputRef.value.setInputText(userPrompt.content)
    console.log('[选择提示词] 提示词内容已恢复')
  }

  // 恢复选择的常用提示词
  if (userPrompt.selected_common_prompts) {
    try {
      console.log('[选择提示词] 开始恢复常用提示词选择')
      const selectedIds = JSON.parse(userPrompt.selected_common_prompts)
      console.log('[选择提示词] 解析到的常用提示词ID:', selectedIds)

      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        // 如果常用提示词数据为空，先加载
        if (commonPrompts.value.length === 0) {
          console.log('[选择提示词] 常用提示词列表为空，开始加载...')
          await loadCommonPrompts()
          console.log('[选择提示词] 常用提示词加载完成，共', commonPrompts.value.length, '个')
        }

        selectedIds.forEach(id => {
          selectedCommonPromptIds.value.add(id)
          const prompt = commonPrompts.value.find(p => p.id === id)
          if (prompt) {
            console.log('[选择提示词] 恢复常用提示词:', prompt.name, '内容:', prompt.content)
          } else {
            console.warn('[选择提示词] 未找到ID为', id, '的常用提示词')
          }
        })
        console.log('[选择提示词] 常用提示词已恢复:', selectedIds.length, '个')
      } else {
        console.log('[选择提示词] 常用提示词数组为空')
      }
    } catch (error) {
      console.error('[选择提示词] 解析常用提示词选择失败:', error)
    }
  }
  
  // 恢复参考图 - 支持多张参考图
  // 首先尝试从 selected_reference_images 字段加载（数据库ID数组）
  if (userPrompt.selected_reference_images) {
    try {
      const imageIds = JSON.parse(userPrompt.selected_reference_images)
      if (Array.isArray(imageIds) && imageIds.length > 0) {
        console.log('[选择提示词] 通过数据库ID加载', imageIds.length, '张参考图，IDs:', imageIds)

        // 通过ID加载参考图
        try {
          const loadedImages = await loadReferenceImagesByIds(imageIds)
          console.log('[选择提示词] 参考图加载成功:', loadedImages.length, '张')
        } catch (error) {
          console.error('[选择提示词] 通过ID加载参考图失败:', error)
          ElMessage.warning('部分参考图加载失败')
        }
      }
    } catch (error) {
      console.error('解析 selected_reference_images 失败:', error)
    }
  }
  // 如果没有 selected_reference_images 或加载失败，尝试使用旧的 referenceImageUrl（单张）
  else if (userPrompt.referenceImageUrl) {
    console.log('[选择提示词] 从 referenceImageUrl 加载单张参考图')
    try {
      // 使用代理接口获取图片，避免CORS问题
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(userPrompt.referenceImageUrl)}`
      const response = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      let mimeType = blob.type || 'image/png'
      let fileName = '参考图'

      if (!mimeType || !mimeType.startsWith('image/')) {
        mimeType = 'image/png'
      }

      if (!fileName.includes('.')) {
        const extension = mimeType.split('/')[1] || 'png'
        fileName = `${fileName}.${extension}`
      }

      const file = new File([blob], fileName, {
        type: mimeType
      })

      const imageData = {
        id: Date.now() + Math.random(),
        url: userPrompt.referenceImageUrl,
        file: file,
        name: fileName
      }

      uploadedImages.value.push(imageData)
      uploadedFiles.value.push(file)
      console.log('[选择提示词] 参考图加载成功')
    } catch (error) {
      console.error('加载参考图失败:', error)
      ElMessage.warning('参考图加载失败，可能无法用于生成')
    }
  }

  console.log('[选择提示词] 加载完成')
  ElMessage.success('提示词已加载')
}

// 编辑用户提示词
const editUserPrompt = (userPrompt) => {
  showPromptManager.value = true
  // 可以传递编辑的提示词ID给PromptManager组件
}

// 删除用户提示词
const deleteUserPrompt = async (promptId) => {
  try {
    await ElMessageBox.confirm('确定要删除这个提示词吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    // 从localStorage中删除
    const savedPrompts = JSON.parse(localStorage.getItem('promptManager') || '[]')
    const updatedPrompts = savedPrompts.filter(p => p.id !== promptId)
    localStorage.setItem('promptManager', JSON.stringify(updatedPrompts))
    
    // 更新本地数据
    userPrompts.value = updatedPrompts
    
    ElMessage.success('提示词已删除')
  } catch (error) {
    // 用户取消删除
  }
}

// 处理图片加载错误
const handleImageError = (event) => {
  event.target.style.display = 'none'
  if (event.target.nextElementSibling) {
    event.target.nextElementSibling.style.display = 'flex'
  }
}

// 处理用户提示词更新
const handleUserPromptsUpdated = async () => {
  console.log('[用户提示词更新] 收到更新事件，重新加载提示词列表')
  await loadUserPrompts()
  console.log('[用户提示词更新] 提示词列表已重新加载，共', userPrompts.value.length, '个')
}

// 处理批量生成
const handleBatchGenerate = async () => {
  // 过滤出非空的提示词
  const validPrompts = batchPrompts.value.filter(p => p && p.trim() !== '')

  if (validPrompts.length === 0) {
    ElMessage.warning('请至少输入一个提示词')
    return
  }

  console.log('[批量生成] 开始批量生成:', {
    promptCount: validPrompts.length,
    mode: generationMode.value
  })

  // 保存本次批量输入到历史记录
  lastBatchPrompts.value = [...validPrompts]

  // 关闭对话框
  showBatchPromptDialog.value = false

  // 保存当前的提示词内容和常用提示词选择
  const originalPrompt = multilineTagInputRef.value ?
    multilineTagInputRef.value.getAllOriginalContent() :
    prompt.value
  const originalCommonPromptIds = new Set(selectedCommonPromptIds.value)

  ElMessage.success(`开始批量提交 ${validPrompts.length} 个任务，每个任务间隔2秒`)

  // 依次提交每个任务（不等待完成）
  for (let i = 0; i < validPrompts.length; i++) {
    const currentPrompt = validPrompts[i]

    console.log(`[批量生成] 提交第 ${i + 1}/${validPrompts.length} 个任务: ${currentPrompt}`)
    ElMessage.info(`提交第 ${i + 1}/${validPrompts.length} 个任务`)

    // 恢复常用提示词选择（确保每个批量任务都带上用户选择的常用提示词）
    selectedCommonPromptIds.value = new Set(originalCommonPromptIds)

    // 更新提示词内容（只更新文本，不清空标签）
    if (multilineTagInputRef.value) {
      // 不使用 clearTags()，直接设置文本内容
      multilineTagInputRef.value.setInputText(currentPrompt)
    } else {
      prompt.value = currentPrompt
    }

    // 等待DOM更新
    await nextTick()

    // 根据模式调用对应的生成方法（不使用await，直接提交）
    if (generationMode.value === 'image-to-video') {
      handleVideoGeneration().catch(err => {
        console.error(`[批量生成] 第 ${i + 1} 个任务提交失败:`, err)
      })
    } else {
      generateImage().catch(err => {
        console.error(`[批量生成] 第 ${i + 1} 个任务提交失败:`, err)
      })
    }

    // 等待2秒再提交下一个任务，避免并发
    if (i < validPrompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  // 恢复原始提示词
  if (multilineTagInputRef.value) {
    multilineTagInputRef.value.clearTags()
    multilineTagInputRef.value.setInputText(originalPrompt)
  } else {
    prompt.value = originalPrompt
  }

  // 常用提示词选择保持不变（已经在循环中恢复了）

  // 清空批量输入
  batchPrompts.value = Array(10).fill('')

  ElMessage.success(`批量任务已全部提交，共 ${validPrompts.length} 个任务`)
}

// 加载上一次批量输入
const loadLastBatchPrompts = () => {
  if (lastBatchPrompts.value.length === 0) {
    ElMessage.warning('没有上一次的批量输入记录')
    return
  }

  // 清空当前输入
  batchPrompts.value = Array(10).fill('')

  // 加载上一次的输入
  lastBatchPrompts.value.forEach((prompt, index) => {
    if (index < 10) {
      batchPrompts.value[index] = prompt
    }
  })

  ElMessage.success(`已加载上一次的 ${lastBatchPrompts.value.length} 个提示词`)
}

// 从AI提示词生成器填入批量输入表单
const handleFillBatchPrompts = (prompts) => {
  // 清空当前输入
  batchPrompts.value = Array(10).fill('')

  // 填入新的提示词（最多10个）
  prompts.slice(0, 10).forEach((prompt, index) => {
    batchPrompts.value[index] = prompt
  })

  // 打开批量输入对话框
  showBatchPromptDialog.value = true
}

// 从批量输入历史加载提示词
const handleLoadBatchPromptHistory = (prompts) => {
  // 清空当前输入
  batchPrompts.value = Array(10).fill('')

  // 填入历史提示词（最多10个）
  prompts.slice(0, 10).forEach((prompt, index) => {
    batchPrompts.value[index] = prompt
  })

  ElMessage.success(`已加载 ${prompts.length} 个提示词`)
}

// 处理提示词分页切换
const handlePromptsPageChange = (page) => {
  promptsCurrentPage.value = page
  console.log('[提示词分页] 切换到第', page, '页')
}

// 处理多行标签输入变化
const handlePromptChange = (newTags) => {
  promptTags.value = newTags
  // 同步更新 prompt 变量（保持向后兼容）
  // 使用getAllOriginalContent获取完整内容
  if (multilineTagInputRef.value) {
    prompt.value = multilineTagInputRef.value.getAllOriginalContent()
  } else {
    prompt.value = newTags.join(', ')
  }
}

// 处理视频多行标签输入变化
const handleVideoPromptChange = (newTags) => {
  videoPromptTags.value = newTags
  // 同步更新视频提示词变量
  if (videoMultilineTagInputRef.value) {
    // 这里可以添加视频提示词的处理逻辑
    console.log('视频提示词变化:', videoMultilineTagInputRef.value.getAllOriginalContent())
  }
}

// InputTag 相关方法（保留用于向后兼容）
// 处理标签变化
const handlePromptTagsChange = (newTags) => {
  promptTags.value = newTags
  // 同步更新 prompt 变量（保持向后兼容）
  prompt.value = newTags.join(', ')
}

// 处理添加标签
const handleAddTag = (tag) => {
  // 可以在这里添加自定义逻辑
  console.log('添加标签:', tag)
}

// 处理移除标签
const handleRemoveTag = (tag) => {
  // 检查是否是常用提示词标签，如果是则更新选中状态
  const commonPrompt = commonPrompts.value.find(p => p.name === tag)
  if (commonPrompt) {
    selectedCommonPromptIds.value.delete(commonPrompt.id)
  }
  console.log('移除标签:', tag)
}

// 添加常用提示词
const addCommonPrompt = (commonPrompt, promptId) => {
  // 切换选中状态
  if (selectedCommonPromptIds.value.has(promptId)) {
    // 如果已选中，则取消选中
    selectedCommonPromptIds.value.delete(promptId)
    // 从标签数组中移除
    const commonPromptObj = commonPrompts.value.find(p => p.id === promptId)
    if (commonPromptObj) {
      const index = promptTags.value.findIndex(tag => tag === commonPromptObj.name)
      if (index > -1) {
        promptTags.value.splice(index, 1)
      }
    }
  } else {
    // 如果未选中，则选中并添加到标签数组
    selectedCommonPromptIds.value.add(promptId)
    const commonPromptObj = commonPrompts.value.find(p => p.id === promptId)
    if (commonPromptObj && !promptTags.value.includes(commonPromptObj.name)) {
      promptTags.value.push(commonPromptObj.name)
    }
  }
}

// 添加视频常用提示词
const addVideoCommonPrompt = (videoPrompt, promptId) => {
  // 切换选中状态
  if (selectedVideoPromptIds.value.has(promptId)) {
    // 如果已选中，则取消选中
    selectedVideoPromptIds.value.delete(promptId)
    // 从标签数组中移除
    const videoPromptObj = videoCommonPrompts.value.find(p => p.id === promptId)
    if (videoPromptObj) {
      const index = videoPromptTags.value.findIndex(tag => tag === videoPromptObj.name)
      if (index > -1) {
        videoPromptTags.value.splice(index, 1)
      }
    }
  } else {
    // 如果未选中，则选中并添加到标签数组
    selectedVideoPromptIds.value.add(promptId)
    const videoPromptObj = videoCommonPrompts.value.find(p => p.id === promptId)
    if (videoPromptObj && !videoPromptTags.value.includes(videoPromptObj.name)) {
      videoPromptTags.value.push(videoPromptObj.name)
    }
  }
}

// 从提示词文本中移除指定内容
const removePromptFromText = (promptToRemove) => {
  if (!prompt.value.trim()) return
  
  // 移除精确匹配的内容
  let updatedPrompt = prompt.value
    .replace(new RegExp(promptToRemove + ',\\s*', 'g'), '') // 移除 "内容, "
    .replace(new RegExp(',\\s*' + promptToRemove, 'g'), '') // 移除 ", 内容"
    .replace(new RegExp('^' + promptToRemove + '$', 'g'), '') // 移除单独的内容
    .trim()
  
  // 清理多余的逗号
  updatedPrompt = updatedPrompt.replace(/,\s*,/g, ',').replace(/^,|,$/g, '')
  
  prompt.value = updatedPrompt
}

// 处理图片点击
const handleImageClick = (imageData) => {
  console.log('图片点击:', imageData)
  
  // 直接使用传入的图片数据打开预览
  currentPreviewImage.value = imageData.src
  currentPreviewTitle.value = imageData.title || '生成的图片'
  showImageModal.value = true
  
  // 查找图片所属的批次
  let foundBatch = null
  let imageIndexInBatch = -1
  
  for (const batch of generationBatches.value) {
    if (batch.results && batch.results.length > 0) {
      const index = batch.results.findIndex(img => img.url === imageData.src)
      if (index !== -1) {
        foundBatch = batch
        imageIndexInBatch = index
        break
      }
    }
  }
  
  if (foundBatch) {
    // 找到了所属批次，设置当前批次的上下文
    currentViewingBatchId.value = foundBatch.id
    currentBatchImages.value = foundBatch.results
    currentImageIndex.value = imageIndexInBatch
    console.log('[大图预览] 批次:', foundBatch.id, '索引:', imageIndexInBatch, '总数:', foundBatch.results.length)
  } else {
    // 未找到批次（可能是历史记录加载的图片），使用全局列表
    currentViewingBatchId.value = null
    currentBatchImages.value = generatedImages.value
    const imageIndex = generatedImages.value.findIndex(img => img.url === imageData.src)
    currentImageIndex.value = imageIndex !== -1 ? imageIndex : -1
    console.log('[大图预览] 使用全局列表，索引:', currentImageIndex.value)
  }
  
  // 重置缩放和旋转
  imageScale.value = 1
  imageRotation.value = 0
  imagePosition.value = { x: 0, y: 0 }
}


// 自动下载单张图片（简化版本）
const downloadImage = async (imageUrl, filename = null) => {
  try {
    if (!imageUrl) {
      throw new Error('图片URL为空')
    }

    // 生成文件名
    if (!filename) {
      filename = `image_${Date.now()}`
    }

    console.log('[自动下载] 开始下载图片:', { imageUrl, filename })

    // 判断是否需要通过代理下载
    let fetchUrl = imageUrl
    const fetchOptions = {}

    if (needsProxyDownload(imageUrl)) {
      // 使用代理接口避免CORS
      fetchUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      fetchOptions.headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }

    // 使用fetch下载图片文件
    const response = await fetch(fetchUrl, fetchOptions)
    if (!response.ok) {
      throw new Error('获取图片失败')
    }

    const blob = await response.blob()

    // 获取文件扩展名
    const contentType = blob.type
    let extension = '.png' // 默认扩展名
    if (contentType) {
      const match = contentType.match(/image\/(\w+)/)
      if (match) {
        extension = `.${match[1]}`
      }
    }

    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.includes('.') ? filename : `${filename}${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log('[自动下载] 图片下载完成:', a.download)
    return true
  } catch (error) {
    console.error('[自动下载] 图片下载失败:', error)
    throw error
  }
}

// 处理图片下载
const handleImageDownload = async (imageData) => {
  try {
    // 找到对应的图片数据，优先使用originalUrl
    const imageIndex = generatedImages.value.findIndex(img => img.url === imageData.src)
    const downloadUrl = imageIndex !== -1 && generatedImages.value[imageIndex].originalUrl 
      ? generatedImages.value[imageIndex].originalUrl 
      : imageData.src
    
    console.log(`下载图片，使用URL: ${downloadUrl}`)
    
    // 根据URL类型选择下载方式
    let response
    if (needsProxyDownload(downloadUrl)) {
      // 使用代理API下载图片，避免CORS问题
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(downloadUrl)}`
      console.log(`[下载] 使用代理下载: ${proxyUrl}`)
      response = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
    } else {
      // 直接下载本地图片
      console.log(`[下载] 直接下载: ${downloadUrl}`)
      response = await fetch(downloadUrl)
    }
    
    if (!response.ok) {
      throw new Error('获取图片失败')
    }
    
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    
    // 创建下载链接
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = imageData.title || `image-${Date.now()}.png`
    link.target = '_self' // 确保在当前窗口下载
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 清理blob URL
    URL.revokeObjectURL(blobUrl)
    
    ElMessage.success('下载成功')
  } catch (error) {
    console.error('下载失败:', error)
    ElMessage.error('下载失败')
  }
}

// 处理图片预览
const handleImagePreview = (imageData) => {
  const previewWindow = window.open('', '_blank', 'width=800,height=600')
  previewWindow.document.write(`
    <html>
      <head>
        <title>图片预览 - ${imageData.title}</title>
        <style>
          body { margin: 0; padding: 20px; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
          img { max-width: 100%; max-height: 100%; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-radius: 8px; }
        </style>
      </head>
      <body>
        <img src="${imageData.src}" alt="${imageData.title}" />
      </body>
    </html>
  `)
}

// 获取当前使用的完整提示词
const getCurrentPrompt = () => {
  if (multilineTagInputRef.value) {
    // 使用组件的getAllOriginalContent方法获取完整内容（包括标签映射和手动输入）
    return multilineTagInputRef.value.getAllOriginalContent()
  } else if (promptTags.value.length > 0) {
    // 备用方案：手动处理标签映射
    const mappedTags = promptTags.value.map(tag => tagMapping.value[tag] || tag)
    return mappedTags.join(', ')
  } else {
    return prompt.value
  }
}

// 处理添加到提示词管理
const handleAddToPrompts = async (imageData) => {
  try {
    console.log('[handleAddToPrompts] 接收到的imageData:', imageData)
    console.log('[handleAddToPrompts] imageData详细信息:', {
      src: imageData.src,
      ossUrl: imageData.ossUrl,
      url: imageData.url,
      originalUrl: imageData.originalUrl,
      所有属性: Object.keys(imageData)
    })

    // 使用自定义对话框组件
    const result = await showAddPromptDialogForm(imageData)

    if (result) {
      const { title, content } = result

      if (!title || !content) {
        ElMessage.warning('请输入完整的标题和内容')
        return
      }

      const token = localStorage.getItem('token')

      if (token) {
        // 已登录，使用API保存到服务器
        // 修复：传递参考图URL而不是生成结果图URL
        const referenceImageUrl = uploadedImages.value.length > 0 ? uploadedImages.value[0].url : null

        // 修复：使用历史记录中保存的OSS链接作为封面
        // imageData对象可能包含以下字段：src(显示URL), ossUrl(OSS链接), url(原始URL)
        // 优先使用 ossUrl,其次使用 url,最后使用 src
        const coverImageUrl = imageData.ossUrl || imageData.url || imageData.src

        console.log('[保存提示词] 封面图URL:', {
          ossUrl: imageData.ossUrl,
          url: imageData.url,
          src: imageData.src,
          selected: coverImageUrl
        })

        // 构造批次元数据对象
        const batchMetadata = {
          tags: imageData.tags,
          selectedCommonPrompts: imageData.selectedCommonPrompts,
          selectedReferenceImages: imageData.selectedReferenceImages
        }

        console.log('[保存提示词] 传递批次元数据:', batchMetadata)

        await savePromptToServerWithImage(title, content, referenceImageUrl, coverImageUrl, batchMetadata)
      } else {
        // 未登录，使用本地存储
        // 修复：传递参考图URL而不是生成结果图URL
        const referenceImageUrl = uploadedImages.value.length > 0 ? uploadedImages.value[0].url : null
        // 修复：封面使用生成结果图
        const coverImageUrl = imageData.src // 使用生成结果图作为封面
        await savePromptToLocalWithImage(title, content, referenceImageUrl, coverImageUrl)
      }

      ElMessage.success('已添加到提示词管理')

      // 修复：保存成功后立即刷新提示词列表
      await loadUserPrompts()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('添加到提示词失败:', error)
      ElMessage.error('添加失败')
    }
  }
}

// 根据提示词内容自动生成标题
const generateTitleFromPrompt = (prompt) => {
  if (!prompt || prompt.trim() === '') {
    return '未命名提示词'
  }

  // 清理提示词，移除多余的空格和换行
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ')

  // 提取前30个字符作为标题
  let title = cleanPrompt.substring(0, 30)

  // 如果提示词超过30个字符，添加省略号
  if (cleanPrompt.length > 30) {
    // 尝试在标点符号处截断
    const punctuations = ['.', ',', '。', '，', '、']
    let bestCutPoint = -1

    for (const punct of punctuations) {
      const index = title.lastIndexOf(punct)
      if (index > 15 && index < title.length) { // 至少保留15个字符
        bestCutPoint = index + 1
        break
      }
    }

    if (bestCutPoint > 0) {
      title = title.substring(0, bestCutPoint).trim()
    } else {
      // 尝试在空格处截断
      const lastSpace = title.lastIndexOf(' ')
      if (lastSpace > 15) {
        title = title.substring(0, lastSpace).trim()
      }
    }

    title += '...'
  }

  return title
}

// 显示添加提示词对话框
const showAddPromptDialogForm = (imageData) => {
  return new Promise((resolve, reject) => {
    // 根据提示词内容自动生成标题
    const autoGeneratedTitle = generateTitleFromPrompt(imageData.prompt)

    // 创建对话框容器
    const dialogContainer = document.createElement('div')
    dialogContainer.innerHTML = `
      <div class="add-prompt-dialog-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div class="add-prompt-dialog" style="
          background: white;
          border-radius: 8px;
          padding: 24px;
          width: 500px;
          max-width: 90vw;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        ">
          <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #303133;">添加到提示词管理</h3>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #606266;">标题</label>
            <input type="text" id="prompt-title" placeholder="请输入提示词标题" style="
              width: 100%;
              padding: 12px;
              border: 1px solid #dcdfe6;
              border-radius: 4px;
              font-size: 14px;
              box-sizing: border-box;
            " value="${autoGeneratedTitle}">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #606266;">内容</label>
            <textarea id="prompt-content" placeholder="请输入提示词内容" style="
              width: 100%;
              padding: 12px;
              border: 1px solid #dcdfe6;
              border-radius: 4px;
              font-size: 14px;
              height: 120px;
              resize: vertical;
              box-sizing: border-box;
              font-family: inherit;
            ">${imageData.prompt || '请描述这张图片的提示词'}</textarea>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button id="cancel-btn" style="
              padding: 8px 16px;
              border: 1px solid #dcdfe6;
              background: white;
              color: #606266;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">取消</button>
            <button id="confirm-btn" style="
              padding: 8px 16px;
              border: none;
              background: #00B8E6;
              color: white;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">确定</button>
          </div>
        </div>
      </div>
    `
    
    document.body.appendChild(dialogContainer)
    
    const titleInput = dialogContainer.querySelector('#prompt-title')
    const contentInput = dialogContainer.querySelector('#prompt-content')
    const cancelBtn = dialogContainer.querySelector('#cancel-btn')
    const confirmBtn = dialogContainer.querySelector('#confirm-btn')
    
    // 聚焦到标题输入框
    titleInput.focus()
    
    // 取消按钮事件
    cancelBtn.onclick = () => {
      document.body.removeChild(dialogContainer)
      reject('cancel')
    }
    
    // 确定按钮事件
    confirmBtn.onclick = () => {
      const title = titleInput.value.trim()
      const content = contentInput.value.trim()
      
      if (!title || !content) {
        ElMessage.warning('请输入完整的标题和内容')
        return
      }
      
      document.body.removeChild(dialogContainer)
      resolve({ title, content })
    }
    
    // 回车键事件
    const handleKeydown = (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        confirmBtn.click()
      } else if (e.key === 'Escape') {
        cancelBtn.click()
      }
    }
    
    document.addEventListener('keydown', handleKeydown)
    
    // 清理事件监听器
    const cleanup = () => {
      document.removeEventListener('keydown', handleKeydown)
    }
    
    cancelBtn.addEventListener('click', cleanup)
    confirmBtn.addEventListener('click', cleanup)
  })
}

// 保存提示词到服务器（带图片）
const savePromptToServerWithImage = async (title, content, referenceImageUrl, coverImageUrl, batchMetadata = null) => {
  const token = localStorage.getItem('token')
  const formData = new FormData()

  formData.append('title', title)
  formData.append('content', content)

  // 添加模型ID
  if (selectedModelId.value) {
    formData.append('modelId', selectedModelId.value)
  }

  // 保存当前的状态信息
  // 优先使用从批次传来的元数据，否则使用当前状态
  const tags = (batchMetadata && batchMetadata.tags) || promptTags.value || []
  const selectedCommonPrompts = (batchMetadata && batchMetadata.selectedCommonPrompts) || Array.from(selectedCommonPromptIds.value)
  // 保存参考图的数据库ID列表（如果有的话）
  const selectedReferenceImageIds = (batchMetadata && batchMetadata.selectedReferenceImages) ||
    uploadedImages.value
      .filter(img => img.dbId && typeof img.dbId === 'number')
      .map(img => img.dbId)

  console.log('[保存提示词到服务器] 元数据:', {
    tags,
    selectedCommonPrompts,
    selectedReferenceImageIds,
    fromBatch: !!batchMetadata
  })

  formData.append('tags', JSON.stringify(tags))
  formData.append('selectedCommonPrompts', JSON.stringify(selectedCommonPrompts))
  formData.append('selectedReferenceImages', JSON.stringify(selectedReferenceImageIds))
  formData.append('generationMode', generationMode.value)
  formData.append('imageSize', imageSize.value)
  formData.append('generateQuantity', generateQuantity.value.toString())
  
  // 如果有参考图URL，直接传递URL
  if (referenceImageUrl) {
    formData.append('referenceImageUrl', referenceImageUrl)
  }
  
  // 如果有封面图URL，传递封面图URL
  if (coverImageUrl) {
    formData.append('coverImageUrl', coverImageUrl)
  }
  
  const response = await fetch('/api/prompts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '保存失败')
  }
}

// 保存提示词到本地存储（带图片）
const savePromptToLocalWithImage = async (title, content, referenceImageUrl, coverImageUrl) => {
      // 获取现有的提示词列表
      const existingPrompts = JSON.parse(localStorage.getItem('promptManager') || '[]')
      
      // 创建新的提示词项
      const newPrompt = {
        id: Date.now().toString(),
        title: title,
        content: content,
        // 修复：封面使用生成结果图，但保存参考图链接
        referenceImage: coverImageUrl || referenceImageUrl, // 封面优先使用生成结果图
        referenceImageUrl: referenceImageUrl, // 保存参考图链接用于点击时加载
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      
      // 添加到列表
      existingPrompts.unshift(newPrompt)
      
      // 保存到本地存储
      localStorage.setItem('promptManager', JSON.stringify(existingPrompts))
}

// 格式化图片时间
const formatImageTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) { // 1分钟内
    return '刚刚'
  } else if (diff < 3600000) { // 1小时内
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) { // 1天内
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    return date.toLocaleDateString()
  }
}

// 获取图片角标
const getImageBadges = (image) => {
  const badges = []
  
  if (image.index) {
    badges.push({
      text: `${image.index}号`,
      type: 'primary'
    })
  }
  
  if (image.timestamp) {
    const now = Date.now()
    const diff = now - image.timestamp
    if (diff < 60000) { // 1分钟内
      badges.push({
        text: '新',
        type: 'success'
      })
    }
  }
  
  return badges
}

// 从常用提示词更新标签映射
const updateTagMappingFromCommonPrompts = (commonPromptsData) => {
  // 创建新的映射对象，完全清空之前的映射
  const newTagMapping = {}
  
  // 将数据库中的常用提示词添加到映射中
  commonPromptsData.forEach(prompt => {
    if (prompt.title && prompt.content) {
      newTagMapping[prompt.title] = prompt.content
    }
  })

  // 更新标签映射
  tagMapping.value = newTagMapping
  
  console.log('标签映射已更新:', newTagMapping)
}

// 从视频常用提示词更新标签映射
const updateVideoTagMappingFromCommonPrompts = (videoPromptsData) => {
  // 创建新的映射对象，完全清空之前的映射
  const newVideoTagMapping = {}
  
  // 将数据库中的视频常用提示词添加到映射中
  videoPromptsData.forEach(prompt => {
    if (prompt.title && prompt.content) {
      newVideoTagMapping[prompt.title] = prompt.content
    }
  })

  // 更新视频标签映射
  videoTagMapping.value = newVideoTagMapping
  
  console.log('视频标签映射已更新:', newVideoTagMapping)
}

// 加载常用提示词（优化：添加缓存）
const loadCommonPrompts = async () => {
  try {
    // 如果已经加载过，直接返回
    if (commonPrompts.value.length > 0) {
      console.log('[常用提示词] 已缓存，跳过加载')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      // 如果没有token，使用默认提示词
      commonPrompts.value = [
        {
          id: '1',
          name: '金属框眼镜',
          content: 'Her thin-framed glasses add a touch of sophistication.',
          createdAt: Date.now() - 86400000
        },
        {
          id: '2',
          name: '人物还原',
          content: 'Please fully restore the facial features and hairstyles of the individuals in the uploaded images.',
          createdAt: Date.now() - 172800000
        },
        {
          id: '3',
          name: '马尾辫绿色丝带',
          content: 'Her dark hair is pulled back in a low ponytail and tied with a silky dark green scarf with a subtle floral or leaf pattern, tied in a soft bow.',
          createdAt: Date.now() - 259200000
        }
      ]
      // 从默认提示词更新标签映射
      updateTagMappingFromCommonPrompts(commonPrompts.value.map(prompt => ({
        title: prompt.name,
        content: prompt.content
      })))
      return
    }

    // 从服务器API加载常用提示词
    const response = await fetch('/api/prompts/common', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        // 转换服务器数据格式为前端格式
        commonPrompts.value = result.data.map(prompt => ({
          id: prompt.id.toString(),
          name: prompt.title,
          content: prompt.content,
          createdAt: new Date(prompt.created_at).getTime(),
          updatedAt: new Date(prompt.updated_at).getTime()
        }))
        
        // 更新标签映射：将数据库中的常用提示词内容映射到标签显示文本
        updateTagMappingFromCommonPrompts(result.data)
        
        // 同时更新localStorage作为缓存
      localStorage.setItem('commonPrompts', JSON.stringify(commonPrompts.value))
      } else {
        throw new Error(result.message || '加载常用提示词失败')
      }
    } else if (response.status === 401) {
      // 认证失败，清除缓存并重新登录
      clearAllUserCache()
      isLoggedIn.value = false
      currentUser.value = null
      ElMessage.error('登录已过期，请重新登录')
    } else {
      throw new Error('网络请求失败')
    }
  } catch (error) {
    console.error('加载常用提示词失败:', error)
    
    // 如果API调用失败，尝试从localStorage加载作为备用
    try {
      const savedPrompts = localStorage.getItem('commonPrompts')
      if (savedPrompts) {
        commonPrompts.value = JSON.parse(savedPrompts)
        // 从缓存的常用提示词更新标签映射
        updateTagMappingFromCommonPrompts(commonPrompts.value.map(prompt => ({
          title: prompt.name,
          content: prompt.content
        })))
        ElMessage.warning('已从本地缓存加载常用提示词')
      } else {
        // 使用默认提示词
        commonPrompts.value = [
          {
            id: '1',
            name: '金属框眼镜',
            content: 'Her thin-framed glasses add a touch of sophistication.',
            createdAt: Date.now() - 86400000
          },
          {
            id: '2',
            name: '人物还原',
            content: 'Please fully restore the facial features and hairstyles of the individuals in the uploaded images.',
            createdAt: Date.now() - 172800000
          },
          {
            id: '3',
            name: '马尾辫绿色丝带',
            content: 'Her dark hair is pulled back in a low ponytail and tied with a silky dark green scarf with a subtle floral or leaf pattern, tied in a soft bow.',
            createdAt: Date.now() - 259200000
          }
        ]
        // 从默认提示词更新标签映射
        updateTagMappingFromCommonPrompts(commonPrompts.value.map(prompt => ({
          title: prompt.name,
          content: prompt.content
        })))
      }
    } catch (localError) {
      console.error('从本地缓存加载失败:', localError)
    commonPrompts.value = []
    }
  }
}

// 加载视频常用提示词
const loadVideoCommonPrompts = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      // 如果没有token，使用默认视频提示词
      videoCommonPrompts.value = [
        {
          id: 'v1',
          name: '奔跑',
          content: 'running, dynamic movement, motion blur, energetic',
          createdAt: Date.now() - 86400000
        },
        {
          id: 'v2',
          name: '微笑',
          content: 'smiling, happy expression, cheerful, joyful',
          createdAt: Date.now() - 172800000
        },
        {
          id: 'v3',
          name: '微风',
          content: 'gentle breeze, wind effect, flowing movement, natural',
          createdAt: Date.now() - 259200000
        },
        {
          id: 'v4',
          name: '阳光',
          content: 'sunlight, bright lighting, warm atmosphere, golden hour',
          createdAt: Date.now() - 345600000
        },
        {
          id: 'v5',
          name: '草地',
          content: 'grass field, green landscape, natural environment, outdoor',
          createdAt: Date.now() - 432000000
        },
        {
          id: 'v6',
          name: '慢动作',
          content: 'slow motion, cinematic effect, dramatic timing, smooth',
          createdAt: Date.now() - 518400000
        }
      ]
      // 从默认视频提示词更新标签映射
      updateVideoTagMappingFromCommonPrompts(videoCommonPrompts.value.map(prompt => ({
        title: prompt.name,
        content: prompt.content
      })))
      return
    }
    
    // 从服务器API加载视频常用提示词
    const response = await fetch('/api/prompts/video-common', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        // 转换服务器数据格式为前端格式
        videoCommonPrompts.value = result.data.map(prompt => ({
          id: prompt.id.toString(),
          name: prompt.title,
          content: prompt.content,
          createdAt: new Date(prompt.created_at).getTime(),
          updatedAt: new Date(prompt.updated_at).getTime()
        }))
        
        // 更新标签映射：将数据库中的视频常用提示词内容映射到标签显示文本
        updateVideoTagMappingFromCommonPrompts(result.data)
        
        // 同时更新localStorage作为缓存
        localStorage.setItem('videoCommonPrompts', JSON.stringify(videoCommonPrompts.value))
      } else {
        throw new Error(result.message || '加载视频常用提示词失败')
      }
    } else if (response.status === 401) {
      // 认证失败，清除缓存并重新登录
      clearAllUserCache()
      isLoggedIn.value = false
      currentUser.value = null
      ElMessage.error('登录已过期，请重新登录')
    } else if (response.status === 404) {
      // API端点不存在，静默处理，使用默认值
      console.log('视频常用提示词API端点不存在，将使用默认值')
    } else {
      throw new Error('网络请求失败')
    }
  } catch (error) {
    // 静默处理错误，不显示错误消息
    console.log('加载视频常用提示词时遇到问题，使用备用方案:', error.message)
    
    // 如果API调用失败，尝试从localStorage加载作为备用
    try {
      const savedPrompts = localStorage.getItem('videoCommonPrompts')
      if (savedPrompts) {
        videoCommonPrompts.value = JSON.parse(savedPrompts)
        // 从缓存的视频常用提示词更新标签映射
        updateVideoTagMappingFromCommonPrompts(videoCommonPrompts.value.map(prompt => ({
          title: prompt.name,
          content: prompt.content
        })))
        // 静默处理，不显示警告消息
        console.log('已从本地缓存加载视频常用提示词')
      } else {
        // 使用默认视频提示词
        videoCommonPrompts.value = [
          {
            id: 'v1',
            name: '奔跑',
            content: 'running, dynamic movement, motion blur, energetic',
            createdAt: Date.now() - 86400000
          },
          {
            id: 'v2',
            name: '微笑',
            content: 'smiling, happy expression, cheerful, joyful',
            createdAt: Date.now() - 172800000
          },
          {
            id: 'v3',
            name: '微风',
            content: 'gentle breeze, wind effect, flowing movement, natural',
            createdAt: Date.now() - 259200000
          },
          {
            id: 'v4',
            name: '阳光',
            content: 'sunlight, bright lighting, warm atmosphere, golden hour',
            createdAt: Date.now() - 345600000
          },
          {
            id: 'v5',
            name: '草地',
            content: 'grass field, green landscape, natural environment, outdoor',
            createdAt: Date.now() - 432000000
          },
          {
            id: 'v6',
            name: '慢动作',
            content: 'slow motion, cinematic effect, dramatic timing, smooth',
            createdAt: Date.now() - 518400000
          }
        ]
        // 从默认视频提示词更新标签映射
        updateVideoTagMappingFromCommonPrompts(videoCommonPrompts.value.map(prompt => ({
          title: prompt.name,
          content: prompt.content
        })))
      }
    } catch (localError) {
      console.error('从本地缓存加载失败:', localError)
      videoCommonPrompts.value = []
    }
  }
}

// 处理常用提示词更新
const handleCommonPromptsUpdated = (updatedPrompts) => {
  console.log('[常用提示词更新] 收到更新事件:', updatedPrompts.length, '个提示词')

  // 设置删除更新标志
  isUpdatingFromDelete.value = true

  // 更新常用提示词列表
  commonPrompts.value = updatedPrompts

  // 🔧 修复：重新构建标签映射，确保修改后的提示词内容生效
  const newTagMapping = {}
  updatedPrompts.forEach(prompt => {
    if (prompt.name && prompt.content) {
      newTagMapping[prompt.name] = prompt.content
    }
  })
  tagMapping.value = newTagMapping
  console.log('[常用提示词更新] 标签映射已更新:', Object.keys(newTagMapping).length, '个映射')

  // 🔧 修复：同步更新localStorage缓存
  try {
    localStorage.setItem('commonPrompts', JSON.stringify(updatedPrompts))
    console.log('[常用提示词更新] localStorage缓存已更新')
  } catch (error) {
    console.error('[常用提示词更新] 更新localStorage失败:', error)
  }

  // 清理已删除提示词的选中状态
  const currentPromptIds = new Set(updatedPrompts.map(p => p.id))
  const selectedIdsToRemove = []

  selectedCommonPromptIds.value.forEach(id => {
    if (!currentPromptIds.has(id)) {
      selectedIdsToRemove.push(id)
    }
  })

  // 移除已删除提示词的选中状态
  selectedIdsToRemove.forEach(id => {
    selectedCommonPromptIds.value.delete(id)
    console.log('[常用提示词更新] 移除已删除提示词的选中状态:', id)
  })

  // 清理标签数组中已删除的常用提示词
  const currentPromptNames = new Set(updatedPrompts.map(p => p.name))
  const originalTags = [...promptTags.value] // 保存原始标签数组

  promptTags.value = promptTags.value.filter(tag => {
    // 保留非常用提示词标签，或者仍然存在的常用提示词标签
    const isCommonPrompt = originalTags.some(t => t === tag) && commonPrompts.value.some(p => p.name === tag)
    return !isCommonPrompt || currentPromptNames.has(tag)
  })

  console.log('[常用提示词更新] 标签数组已清理，剩余', promptTags.value.length, '个标签')

  // 手动同步选中状态，避免watch监听器的干扰
  syncSelectedStateFromTags()

  // 重置删除更新标志
  isUpdatingFromDelete.value = false

  console.log('[常用提示词更新] 更新完成')
}

// 处理视频常用提示词更新
const handleVideoCommonPromptsUpdated = (updatedPrompts) => {
  // 更新视频常用提示词列表
  videoCommonPrompts.value = updatedPrompts
  
  // 清理已删除提示词的选中状态
  const currentPromptIds = new Set(updatedPrompts.map(p => p.id))
  const selectedIdsToRemove = []
  
  selectedVideoPromptIds.value.forEach(id => {
    if (!currentPromptIds.has(id)) {
      selectedIdsToRemove.push(id)
    }
  })
  
  // 移除已删除提示词的选中状态
  selectedIdsToRemove.forEach(id => {
    selectedVideoPromptIds.value.delete(id)
  })
  
  // 清理标签数组中已删除的视频常用提示词
  const currentPromptNames = new Set(updatedPrompts.map(p => p.name))
  
  videoPromptTags.value = videoPromptTags.value.filter(tag => {
    // 保留非常用提示词标签，或者仍然存在的常用提示词标签
    return !videoCommonPrompts.value.some(p => p.name === tag) || currentPromptNames.has(tag)
  })
  
  // 重新加载视频常用提示词列表
  loadVideoCommonPrompts()
}

// 弹窗相关方法
const closeImageModal = () => {
  showImageModal.value = false
}

// 打开视频预览
const openVideoPreview = (video) => {
  currentPreviewVideo.value = {
    url: video.url || '',
    duration: video.duration || '',
    resolution: video.resolution || '',
    ratio: video.ratio || ''
  }
  showVideoModal.value = true
}

// 关闭视频预览
const closeVideoModal = () => {
  // 主动释放视频资源，防止内存泄漏
  if (previewVideoElement.value) {
    try {
      // 暂停视频播放
      previewVideoElement.value.pause()
      // 清空视频源，释放内存
      previewVideoElement.value.src = ''
      previewVideoElement.value.load()
      console.log('[视频预览] 已释放视频资源')
    } catch (error) {
      console.error('[视频预览] 释放资源失败:', error)
    }
  }

  showVideoModal.value = false
  // 清空当前预览视频
  currentPreviewVideo.value = {
    url: '',
    duration: '',
    resolution: '',
    ratio: ''
  }
}

// 视频加载完成事件处理
const handleVideoLoadedData = () => {
  console.log('[视频预览] 视频加载完成')
}

const prevImage = () => {
  if (currentImageIndex.value > 0 && currentBatchImages.value.length > 0) {
    currentImageIndex.value--
    currentPreviewImage.value = currentBatchImages.value[currentImageIndex.value].url
    currentPreviewTitle.value = `生成的图片 ${currentImageIndex.value + 1}`
    console.log('[大图翻页] 上一张:', currentImageIndex.value + 1, '/', currentBatchImages.value.length)
    // 重置缩放和旋转
    imageScale.value = 1
    imageRotation.value = 0
    imagePosition.value = { x: 0, y: 0 }
  }
}

const nextImage = () => {
  if (currentImageIndex.value < currentBatchImages.value.length - 1 && currentBatchImages.value.length > 0) {
    currentImageIndex.value++
    currentPreviewImage.value = currentBatchImages.value[currentImageIndex.value].url
    currentPreviewTitle.value = `生成的图片 ${currentImageIndex.value + 1}`
    console.log('[大图翻页] 下一张:', currentImageIndex.value + 1, '/', currentBatchImages.value.length)
    // 重置缩放和旋转
    imageScale.value = 1
    imageRotation.value = 0
    imagePosition.value = { x: 0, y: 0 }
  }
}

const zoomIn = () => {
  imageScale.value = Math.min(imageScale.value * 1.2, 5)
}

const zoomOut = () => {
  imageScale.value = Math.max(imageScale.value / 1.2, 0.1)
}

const resetZoom = () => {
  imageScale.value = 1
  imageRotation.value = 0
  imagePosition.value = { x: 0, y: 0 }
}

const rotateLeft = () => {
  imageRotation.value -= 90
}

const rotateRight = () => {
  imageRotation.value += 90
}

const handleImageWheel = (event) => {
  event.preventDefault()
  if (event.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
}

const startDrag = (event) => {
  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  
  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y
  
  imagePosition.value.x += deltaX
  imagePosition.value.y += deltaY
  
  dragStart.value = { x: event.clientX, y: event.clientY }
}

const endDrag = () => {
  isDragging.value = false
}

const downloadCurrentImage = async () => {
  const image = currentBatchImages.value[currentImageIndex.value]
  if (image) {
    try {
      // 优先使用原生链接（FAL链接），如果没有则使用OSS链接
      const downloadUrl = image.originalUrl || image.url
      
      console.log(`下载当前图片: ${downloadUrl}`)
      
      // 根据URL类型选择下载方式，避免CORS问题
      let response
      if (needsProxyDownload(downloadUrl)) {
        // 使用代理API下载，避免CORS问题
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(downloadUrl)}`
        console.log(`[大图下载] 使用代理: ${proxyUrl}`)
        response = await fetch(proxyUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      } else {
        // 直接下载本地图片
        console.log(`[大图下载] 直接下载: ${downloadUrl}`)
        response = await fetch(downloadUrl)
      }
      
      if (!response.ok) {
        throw new Error('获取图片失败')
      }
      
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `generated-image-${currentImageIndex.value + 1}-${Date.now()}.png`
      link.target = '_self'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(blobUrl)
      
      ElMessage.success('下载成功')
    } catch (error) {
      console.error('下载失败:', error)
      ElMessage.error('下载失败')
    }
  }
}

// 保存当前图片为提示词
const saveCurrentImageAsPrompt = async () => {
  // 🔧 修复：确保获取当前正在预览的图片
  const image = currentBatchImages.value[currentImageIndex.value]
  if (!image) {
    ElMessage.warning('无法获取当前图片信息')
    console.error('[保存提示词] 无法获取图片:', {
      currentImageIndex: currentImageIndex.value,
      batchImagesLength: currentBatchImages.value.length,
      currentViewingBatchId: currentViewingBatchId.value
    })
    return
  }

  // 查找图片所属的批次，获取提示词
  let batchPrompt = ''
  let batchParams = null
  let batchTags = []
  let batchSelectedCommonPrompts = []
  let batchSelectedReferenceImages = []

  if (currentViewingBatchId.value) {
    const batch = generationBatches.value.find(b => b.id === currentViewingBatchId.value)
    if (batch) {
      // 使用 originalPrompt（仅用户输入）而不是 prompt（完整提示词）
      batchPrompt = batch.originalPrompt || batch.prompt || ''
      batchParams = batch.params || null
      batchTags = batch.tags || []
      batchSelectedCommonPrompts = batch.selectedCommonPrompts || []
      batchSelectedReferenceImages = batch.selectedReferenceImages || []
      console.log('[保存提示词] 找到批次:', {
        batchId: batch.id,
        prompt: batchPrompt,
        params: batchParams,
        tags: batchTags,
        selectedCommonPrompts: batchSelectedCommonPrompts
      })
    } else {
      console.warn('[保存提示词] 未找到批次:', currentViewingBatchId.value)
    }
  }

  // 如果找不到批次提示词，尝试使用全局prompt（仅原始内容）
  if (!batchPrompt) {
    if (multilineTagInputRef.value) {
      batchPrompt = multilineTagInputRef.value.getAllOriginalContent()
    } else {
      batchPrompt = prompt.value
    }
    console.log('[保存提示词] 使用全局提示词（原始内容）')
  }

  // 🔧 修复：构造完整的图片数据，包含OSS URL和原始URL，以及批次元数据
  const imageData = {
    src: image.url, // 显示URL
    ossUrl: image.ossUrl || image.oss_url, // OSS存储URL
    originalUrl: image.originalUrl, // 原始URL（FAL等）
    prompt: batchPrompt,
    title: currentPreviewTitle.value || `生成的图片 ${currentImageIndex.value + 1}`,
    // 保存批次参数，用于恢复生成配置
    params: batchParams,
    // 保存批次元数据
    tags: batchTags,
    selectedCommonPrompts: batchSelectedCommonPrompts,
    selectedReferenceImages: batchSelectedReferenceImages
  }

  console.log('[保存提示词] 完整图片数据:', {
    src: imageData.src,
    ossUrl: imageData.ossUrl,
    originalUrl: imageData.originalUrl,
    prompt: imageData.prompt,
    title: imageData.title,
    hasParams: !!imageData.params,
    tags: imageData.tags,
    selectedCommonPrompts: imageData.selectedCommonPrompts
  })

  // 调用已有的添加到提示词函数
  await handleAddToPrompts(imageData)
}

// 再次修改：将图片发送到图生图
const handleEditAgain = async () => {
  const image = currentBatchImages.value[currentImageIndex.value]
  if (!image) {
    ElMessage.warning('无法获取当前图片信息')
    return
  }

  // 查找图片所属的批次，获取提示词和模型信息
  let batchPrompt = ''
  let batchModelId = null

  if (currentViewingBatchId.value) {
    const batch = generationBatches.value.find(b => b.id === currentViewingBatchId.value)
    if (batch) {
      batchPrompt = batch.prompt || ''
      batchModelId = batch.params?.modelId || null
      console.log('[再次修改] 找到批次:', {
        batchId: batch.id,
        prompt: batchPrompt,
        modelId: batchModelId
      })
    }
  }

  // 如果找不到批次提示词，尝试使用全局prompt
  if (!batchPrompt && prompt.value) {
    batchPrompt = prompt.value
  }

  try {
    const imageUrl = image.originalUrl || image.url

    // 优化：直接使用URL，不需要下载转换
    // 先关闭预览弹窗，提升响应速度
    closeImageModal()

    // 切换到图生图模式
    generationMode.value = 'image-to-image'

    // 设置提示词
    if (batchPrompt) {
      prompt.value = batchPrompt
    }

    // 如果有模型ID，切换到对应模型
    if (batchModelId) {
      // 确保转换为数字类型，因为el-select的value是数字
      selectedModelId.value = typeof batchModelId === 'string' ? parseInt(batchModelId) : batchModelId
      console.log('[再次修改] 设置模型ID:', {
        原始值: batchModelId,
        类型: typeof batchModelId,
        转换后: selectedModelId.value
      })
    }

    // 清空现有参考图并添加加载占位符
    uploadedImages.value = []
    const imageId = Date.now()
    const placeholderData = {
      id: imageId,
      loading: true,
      name: '加载中...'
    }
    uploadedImages.value.push(placeholderData)

    // 后台异步下载图片
    let blob, file

    try {
      // 方法1: 尝试直接fetch下载
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit'
      })

      if (!response.ok) {
        throw new Error('Fetch failed')
      }

      blob = await response.blob()
      file = new File([blob], `reference_${Date.now()}.png`, { type: blob.type || 'image/png' })
    } catch (fetchError) {
      console.log('[再次修改] Fetch失败，尝试使用Canvas方法:', fetchError)

      // 方法2: 使用Canvas转换（适用于同源或已加载的图片）
      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })

      // 创建canvas并绘制图片
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // 转换为blob
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })

      file = new File([blob], `reference_${Date.now()}.png`, { type: 'image/png' })
    }

    // 更新为实际图片数据
    const imageData = {
      id: imageId,
      file: file,
      url: URL.createObjectURL(blob),
      name: file.name,
      loading: false
    }
    uploadedImages.value[0] = imageData

    ElMessage.success('图片已添加到图生图，可以修改提示词后重新生成')

    console.log('[再次修改] 完成:', {
      mode: generationMode.value,
      prompt: prompt.value,
      modelId: selectedModelId.value,
      referenceImagesCount: uploadedImages.value.length
    })
  } catch (error) {
    console.error('[再次修改] 失败:', error)
    ElMessage.error('添加图片失败: ' + error.message)
  }
}

// 生成视频：将图片发送到AI视频生成板块
const handleGenerateVideo = async () => {
  const image = currentBatchImages.value[currentImageIndex.value]
  if (!image) {
    ElMessage.warning('无法获取当前图片信息')
    return
  }

  try {
    // 先关闭预览弹窗，提升响应速度
    closeImageModal()

    // 立即切换到视频生成模式
    activeTab.value = 'video'

    // 切换到图生视频模式
    generationMode.value = 'image-to-video'

    // 等待DOM更新
    await nextTick()

    // 查找豆包图生视频模型（首帧模式）
    const doubaoModel = videoModels.value.find(model =>
      model.provider === 'doubao' && model.mode === 'image-to-video'
    )

    if (doubaoModel) {
      videoSelectedModelId.value = doubaoModel.id
      console.log('[生成视频] 切换到豆包图生视频模型:', doubaoModel.name, 'ID:', doubaoModel.id)
    } else {
      // 如果没有找到豆包模型，选择第一个图生视频模型
      const imageToVideoModel = videoModels.value.find(model => model.mode === 'image-to-video')
      if (imageToVideoModel) {
        videoSelectedModelId.value = imageToVideoModel.id
        console.log('[生成视频] 切换到图生视频模型:', imageToVideoModel.name, 'ID:', imageToVideoModel.id)
      }
    }

    // 后台下载图片
    ElMessage.info('正在加载图片...')

    const imageUrl = image.originalUrl || image.url
    let blob, file

    try {
      // 方法1: 尝试直接fetch下载
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit'
      })

      if (!response.ok) {
        throw new Error('Fetch failed')
      }

      blob = await response.blob()
      file = new File([blob], `first_frame_${Date.now()}.png`, { type: blob.type || 'image/png' })
    } catch (fetchError) {
      console.log('[生成视频] Fetch失败，尝试使用Canvas方法:', fetchError)

      // 方法2: 使用Canvas转换（适用于同源或已加载的图片）
      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })

      // 创建canvas并绘制图片
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // 转换为blob
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })

      file = new File([blob], `first_frame_${Date.now()}.png`, { type: 'image/png' })
    }

    // 设置首帧图片
    firstFrameFile.value = file
    firstFramePreview.value = URL.createObjectURL(blob)

    // 清空尾帧（如果有）
    lastFrameFile.value = null
    lastFramePreview.value = ''

    // 清空视频提示词标签，让用户输入新的
    videoPromptTags.value = []

    ElMessage.success('图片已添加到视频生成首帧，请输入提示词后生成视频')

    console.log('[生成视频] 完成:', {
      modelId: videoSelectedModelId.value,
      hasFirstFrame: !!firstFrameFile.value,
      hasLastFrame: !!lastFrameFile.value
    })
  } catch (error) {
    console.error('[生成视频] 失败:', error)
    ElMessage.error('添加图片失败: ' + error.message)
  }
}

// 认证相关方法
const checkAuthStatus = () => {
  const token = localStorage.getItem('token')
  const user = localStorage.getItem('user')
  
  console.log('检查认证状态:', {
    token: token ? '存在' : '不存在',
    user: user ? '存在' : '不存在',
    tokenLength: token ? token.length : 0
  })
  
  if (token && user) {
    try {
      currentUser.value = JSON.parse(user)
      isLoggedIn.value = true
      console.log('用户已登录:', currentUser.value)
    } catch (error) {
      console.error('解析用户信息失败:', error)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  } else {
    console.log('用户未登录')
  }
}

const handleLoginSuccess = async (user) => {
  currentUser.value = user
  isLoggedIn.value = true

  // 优先加载关键数据（并行加载）
  Promise.all([
    fetchAvailableModels(), // 获取可用模型列表
    fetchVideoModels(), // 获取视频模型列表
    fetchUserCredits() // 获取用户积分
  ]).then(() => {
    console.log('[登录] 关键数据加载完成')
  }).catch(error => {
    console.error('[登录] 关键数据加载失败:', error)
  })

  // 延迟加载非关键数据
  setTimeout(() => {
    loadCommonPrompts()
    loadVideoCommonPrompts()
    loadUserPrompts()
  }, 300)

  // 检测并上传 localStorage 中的提示词（后台执行）
  checkAndUploadLocalStoragePrompts()
}

// 获取用户积分
const fetchUserCredits = async () => {
  if (!isLoggedIn.value) return

  try {
    const token = localStorage.getItem('token')
    const response = await fetch('http://localhost:8088/api/credits/balance', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success) {
        userCredits.value = Math.floor(data.data.balance)
      }
    }
  } catch (error) {
    console.error('获取积分失败:', error)
  }
}

// 充值成功处理
const handleRechargeSuccess = () => {
  fetchUserCredits()
  ElMessage.success('充值订单已创建')
}

// 页面导航处理
const handleNavigate = (page) => {
  activePage.value = page
}

// 从提示词优化页面填入工作区主提示词输入框
const handleFillFromOptimizer = (prompts) => {
  activePage.value = 'workspace'
  nextTick(() => {
    const text = prompts.join('\n')
    if (multilineTagInputRef.value) {
      multilineTagInputRef.value.setFullText(text)
    } else {
      prompt.value = text
    }
    ElMessage.success('已填入工作区提示词输入框')
  })
}

// 从提示词优化页面的批量生成功能填入工作区
const handleFillBatchFromOptimizer = (prompts) => {
  activePage.value = 'workspace'
  nextTick(() => {
    handleFillBatchPrompts(prompts)
  })
}

// 处理使用模板
const handleUseTemplate = (template) => {
  activePage.value = 'workspace'
  // 这里可以根据template设置相应的提示词和参数
  if (template.prompt) {
    if (multilineTagInputRef.value) {
      multilineTagInputRef.value.setFullText(template.prompt)
    }
  }
}

// 登录对话框状态
const showLoginDialog = ref(false)
const showRechargeDialog = ref(false)
const userCredits = ref(0)

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    // 调用服务端退出登录接口
    try {
      const token = localStorage.getItem('token')
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      }
    } catch (error) {
      console.error('调用退出登录接口失败:', error)
      // 即使服务端调用失败，也要清除本地缓存
    }
    
    // 使用工具函数清除所有用户缓存
    const clearSuccess = clearAllUserCache()
    
    // 重置状态
    isLoggedIn.value = false
    currentUser.value = null
    userCredits.value = 0
    
    // 清空应用数据
    generatedImages.value = []
    uploadedImages.value = []
    uploadedFiles.value = []
    prompt.value = ''
    promptTags.value = []
    userPrompts.value = []
    commonPrompts.value = []
    selectedCommonPromptIds.value.clear()
    
    if (clearSuccess) {
      ElMessage.success('已退出登录，所有缓存已清除')
    } else {
      ElMessage.warning('已退出登录，但部分缓存清除失败')
    }
  } catch (error) {
    // 用户取消退出
  }
}

// 加载用户提示词
const loadUserPrompts = async () => {
  try {
    userPromptsLoading.value = true
    
    const token = localStorage.getItem('token')
    if (!token) {
      userPrompts.value = []
      return
    }
    
    // 从服务器API加载提示词
    const response = await fetch('/api/prompts', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        // 转换服务器数据格式为前端格式
        userPrompts.value = result.data.map(prompt => ({
          id: prompt.id.toString(),
          title: prompt.title,
          content: prompt.content,
          // 修复：封面使用生成结果图，但保存的参考图链接保持不变
          referenceImage: prompt.cover_image_url || prompt.oss_url || prompt.reference_image_url || null,
          // 保存参考图链接用于点击卡片时加载
          referenceImageUrl: prompt.reference_image_url || null,
          createdAt: new Date(prompt.created_at).getTime(),
          updatedAt: new Date(prompt.updated_at).getTime(),
          // 添加缺失的关键字段
          tags: prompt.tags,
          selected_common_prompts: prompt.selected_common_prompts,
          selected_reference_images: prompt.selected_reference_images,
          generation_mode: prompt.generation_mode,
          image_size: prompt.image_size,
          generate_quantity: prompt.generate_quantity
        }))
        
        // 同时更新localStorage作为缓存
        localStorage.setItem('promptManager', JSON.stringify(userPrompts.value))
      } else {
        throw new Error(result.message || '加载提示词失败')
      }
    } else if (response.status === 401) {
      // 认证失败，清除缓存并重新登录
      clearAllUserCache()
      isLoggedIn.value = false
      currentUser.value = null
      ElMessage.error('登录已过期，请重新登录')
    } else {
      throw new Error('网络请求失败')
    }
  } catch (error) {
    console.error('加载用户提示词失败:', error)
    
    // 如果API调用失败，尝试从localStorage加载作为备用
    try {
    const savedPrompts = localStorage.getItem('promptManager')
    if (savedPrompts) {
      userPrompts.value = JSON.parse(savedPrompts)
        ElMessage.warning('已从本地缓存加载提示词')
    } else {
      userPrompts.value = []
    }
    } catch (localError) {
      console.error('从本地缓存加载失败:', localError)
    userPrompts.value = []
    }
  } finally {
    userPromptsLoading.value = false
  }
}

// 检测并上传localStorage中的提示词
const checkAndUploadLocalStoragePrompts = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      return
    }

    // 检查localStorage中是否有提示词数据
    const promptCardsData = localStorage.getItem('promptManager')
    const commonPromptsData = localStorage.getItem('commonPrompts')
    
    let promptCards = []
    let commonPrompts = []
    
    // 解析提示词卡片数据
    if (promptCardsData) {
      try {
        const parsed = JSON.parse(promptCardsData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          promptCards = parsed
        }
      } catch (error) {
        console.error('解析提示词卡片数据失败:', error)
      }
    }
    
    // 解析常用提示词数据
    if (commonPromptsData) {
      try {
        const parsed = JSON.parse(commonPromptsData)
        if (Array.isArray(parsed) && parsed.length > 0) {
          commonPrompts = parsed
        }
      } catch (error) {
        console.error('解析常用提示词数据失败:', error)
      }
    }
    
    // 如果没有数据需要上传，直接返回
    if (promptCards.length === 0 && commonPrompts.length === 0) {
      return
    }
    
    // 显示确认对话框
    const confirmResult = await ElMessageBox.confirm(
      `检测到您有 ${promptCards.length} 个提示词卡片和 ${commonPrompts.length} 个常用提示词存储在本地，是否要上传到服务器？`,
      '上传本地提示词',
      {
        confirmButtonText: '上传',
        cancelButtonText: '稍后',
        type: 'info',
        distinguishCancelAndClose: true
      }
    ).catch(() => {
      // 用户取消或关闭对话框
      return false
    })
    
    if (!confirmResult) {
      return
    }
    
    // 显示上传进度
    const loadingInstance = ElLoading.service({
      lock: true,
      text: '正在上传提示词...',
      background: 'rgba(0, 0, 0, 0.7)'
    })
    
    try {
      // 调用批量上传API
      const response = await fetch('/api/prompts/batch-upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          promptCards,
          commonPrompts
        })
      })
      
      if (!response.ok) {
        throw new Error('上传失败')
      }
      
      const result = await response.json()
      
      if (result.success) {
        const { promptCards: promptCardsResult, commonPrompts: commonPromptsResult } = result.data
        const totalSuccess = promptCardsResult.success + commonPromptsResult.success
        const totalFailed = promptCardsResult.failed + commonPromptsResult.failed
        
        if (totalSuccess > 0) {
          ElMessage.success(`成功上传 ${totalSuccess} 个提示词到服务器`)
          
          // 重新加载服务器上的提示词
          await loadUserPrompts()
          await loadCommonPrompts()
          
          // 可选：清除localStorage中的提示词数据（避免重复上传）
          if (totalFailed === 0) {
            const clearResult = await ElMessageBox.confirm(
              '所有提示词已成功上传，是否清除本地缓存？',
              '清除本地缓存',
              {
                confirmButtonText: '清除',
                cancelButtonText: '保留',
                type: 'success'
              }
            ).catch(() => false)
            
            if (clearResult) {
              localStorage.removeItem('promptManager')
              localStorage.removeItem('commonPrompts')
              ElMessage.success('本地缓存已清除')
            }
          }
        }
        
        if (totalFailed > 0) {
          const errors = [...promptCardsResult.errors, ...commonPromptsResult.errors]
          ElMessage.warning(`${totalFailed} 个提示词上传失败，请检查是否有重复内容`)
          console.warn('上传失败的提示词:', errors)
        }
      } else {
        throw new Error(result.message || '上传失败')
      }
    } catch (error) {
      console.error('上传提示词失败:', error)
      ElMessage.error(`上传失败: ${error.message}`)
    } finally {
      loadingInstance.close()
    }
    
  } catch (error) {
    console.error('检测localStorage提示词失败:', error)
  }
}

// 同步选中状态从标签数组
const syncSelectedStateFromTags = () => {
  // 清空当前选中状态
  selectedCommonPromptIds.value.clear()
  
  // 检查哪些常用提示词在标签中
  commonPrompts.value.forEach(promptItem => {
    if (promptTags.value.includes(promptItem.name)) {
      selectedCommonPromptIds.value.add(promptItem.id)
    }
  })
}

// 监听提示词标签变化，同步更新选中状态
watch(promptTags, (newTags) => {
  // 只有在非删除操作时才自动同步
  // 删除操作会通过 handleCommonPromptsUpdated 手动同步
  if (!isUpdatingFromDelete.value) {
    syncSelectedStateFromTags()
  }
})

// 监听生成模式变化，重置相应的提示词状态
watch(generationMode, (newMode) => {
  if (newMode === 'image-to-video') {
    // 切换到AI视频模式时，确保视频提示词已加载
    if (videoCommonPrompts.value.length === 0) {
      loadVideoCommonPrompts()
    }
  } else if (newMode === 'image-to-image') {
    // 切换到图生图模式时，确保参考图已加载
    if (isLoggedIn.value && commonReferenceImages.value.length === 0) {
      fetchCommonReferenceImages()
    }
  }

  // 保存当前生成模式到localStorage
  localStorage.setItem('generationMode', newMode)
})

// 监听左侧标签页变化，保存到localStorage
watch(activeTab, (newTab) => {
  localStorage.setItem('activeTab', newTab)
})

// 监听页面导航状态变化，保存到localStorage
watch(activePage, (newPage) => {
  localStorage.setItem('activePage', newPage)
  console.log('[页面导航] 切换到:', newPage)

  // 当切换到工作台时，检查是否需要加载常用参考图
  if (newPage === 'workspace' && isLoggedIn.value) {
    if (generationMode.value === 'image-to-image' || generationMode.value === 'image-to-video') {
      // 如果当前是图生图或图生视频模式，且参考图未加载，则加载
      if (commonReferenceImages.value.length === 0) {
        console.log('[页面导航] 切换到工作台，当前为图生图模式，开始加载常用参考图')
        fetchCommonReferenceImages()
      }
    }
  }
})

// 组件挂载时检查认证状态
onMounted(() => {
  checkAuthStatus()

  if (isLoggedIn.value) {
    // 优先加载关键数据（并行加载）
    Promise.all([
      fetchAvailableModels(), // 获取可用模型列表
      fetchVideoModels(), // 获取视频模型列表
      fetchUserCredits() // 获取用户积分
    ]).then(() => {
      console.log('[初始化] 关键数据加载完成')
    }).catch(error => {
      console.error('[初始化] 关键数据加载失败:', error)
    })

    // 延迟加载常用提示词（非阻塞）
    setTimeout(() => {
      Promise.all([
        loadCommonPrompts(),
        loadVideoCommonPrompts(),
        loadUserPrompts()
      ]).then(() => {
        console.log('[初始化] 提示词数据加载完成')
      }).catch(error => {
        console.error('[初始化] 提示词数据加载失败:', error)
      })
    }, 300)

    // 检查初始生成模式，如果是图生图或图生视频，则加载参考图
    if (generationMode.value === 'image-to-image' || generationMode.value === 'image-to-video') {
      console.log('[初始化] 检测到图生图/图生视频模式，开始加载常用参考图')
      setTimeout(() => {
        fetchCommonReferenceImages()
      }, 500)
    }

    // 常用参考图延迟到切换到图生图模式时再加载（懒加载）
    // fetchCommonReferenceImages() - 已移除
  }
})

// 组件卸载时清理资源，防止内存泄漏
onUnmounted(() => {
  // 取消所有进行中的轮询
  pollingController.value.cancelled = true
  console.log('[内存清理] 已取消所有轮询任务')

  // 释放视频预览资源
  if (previewVideoElement.value) {
    try {
      previewVideoElement.value.pause()
      previewVideoElement.value.src = ''
      previewVideoElement.value.load()
      console.log('[内存清理] 已释放视频预览资源')
    } catch (error) {
      console.error('[内存清理] 释放视频资源失败:', error)
    }
  }

  // 释放图片预览的 Object URL 防止内存泄漏
  if (firstFramePreview.value && firstFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(firstFramePreview.value)
    console.log('[内存清理] 已释放首帧图片 Object URL')
  }
  if (lastFramePreview.value && lastFramePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(lastFramePreview.value)
    console.log('[内存清理] 已释放尾帧图片 Object URL')
  }

  // 释放所有参考图片的 Object URL
  if (referenceImageUrl.value && referenceImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(referenceImageUrl.value)
    console.log('[内存清理] 已释放参考图片 Object URL')
  }

  // 清空批次数据释放内存
  generationBatches.value = []
  generatedImages.value = []
  generationTasks.value = []
  console.log('[内存清理] 已清空生成批次数据')
})
</script>

<style>
/* 全局重置，确保开放式布局 - 使用非scoped样式覆盖所有默认样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100% !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
  background: #FAF7F2 !important;
  overflow-x: hidden !important;
}

#app {
  min-height: 100vh;
  width: 100vw !important;
  margin: 0 !important;
  padding: 0 !important;
}

@media (max-width: 1200px) {
  #app {
    height: auto !important;
    min-height: 100vh;
  }
}

/* ===== 全局弹窗样式 - 必须在非scoped中才能生效 ===== */

/* 遮罩层 - 固定全屏并居中 */
.el-overlay:not([style*="display: none"]) {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  overflow: auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 20px !important;
}

/* 弹窗wrapper - 居中布局 */
.el-overlay .el-dialog__wrapper,
.el-dialog__wrapper {
  position: static !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 100% !important;
  width: 100% !important;
}

/* MessageBox 的 wrapper 特殊处理 */
.el-overlay-message-box {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-height: 100% !important;
}

/* 弹窗本身 - flex布局 */
.el-dialog,
.el-message-box {
  position: relative !important;
  margin: 0 auto !important;
  max-height: 90vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

/* 弹窗header - 固定高度 */
.el-dialog__header,
.el-message-box__header {
  flex-shrink: 0 !important;
  padding: 20px !important;
}

/* 弹窗body - 可滚动 */
.el-dialog__body,
.el-message-box__content {
  flex: 1 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 0 20px 20px 20px !important;
}

/* 弹窗footer - 固定底部 */
.el-dialog__footer,
.el-message-box__btns {
  flex-shrink: 0 !important;
  padding: 20px !important;
}

/* 当弹窗打开时，防止背景页面滚动 */
body.el-popup-parent--hidden {
  overflow: hidden !important;
}

/* 美化滚动条 */
.el-dialog__body::-webkit-scrollbar,
.el-message-box__content::-webkit-scrollbar {
  width: 8px;
}

.el-dialog__body::-webkit-scrollbar-track,
.el-message-box__content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.el-dialog__body::-webkit-scrollbar-thumb,
.el-message-box__content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.el-dialog__body::-webkit-scrollbar-thumb:hover,
.el-message-box__content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>

<style scoped>


.main-layout {
  display: flex;
  min-height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  background: #FAF7F2;
  overflow: hidden;
  gap: 16px;
}

@media (max-width: 1200px) {
  .main-layout {
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }
}

/* 左侧面板：TAB切换 + 用户账户系统 */
.left-panel {
  width: 350px;
  height: calc(100vh - 32px);
  margin: 16px 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

/* TAB切换区域 */
.tab-section {
  background: white;
  border-radius: 12px;
  box-shadow: none;
  flex: 1;
  min-height: 0; /* 允许收缩 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  max-height: 100%; /* 防止溢出 */
}

/* Tab头部容器 */
.tab-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 16px 0 16px;
}

/* Tab管理按钮 */
.prompts-manage-header {
  padding: 12px 16px 6px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  margin: 4px 0;
}

.prompts-manage-btn {
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  height: 28px;
  width: 100%;
  background: #00B8E6;
  border: none;
  color: white;
  font-weight: 500;
}

.prompts-manage-btn:hover {
  background: #0098C3;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 184, 230, 0.3);
}

.left-tabs {
  height: 100%;
  max-height: 100%; /* 防止溢出 */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* 允许收缩 */
  overflow: hidden; /* 防止溢出 */
}

.left-tabs .el-tabs__header {
  margin: 0 24px 0 24px;
  padding-bottom: 12px;
  background: transparent;
  border-bottom: 1px solid #e2e8f0;
}

.left-tabs .el-tabs__content {
  flex: 1;
  min-height: 0; /* 允许收缩 */
  padding: 0;
  overflow: hidden;
}

.left-tabs .el-tab-pane {
  height: 100%;
  max-height: 100%; /* 防止溢出 */
  overflow: hidden;
}

.left-tabs .el-tabs__nav-wrap::after {
  display: none;
}

.left-tabs .el-tabs__item {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  padding: 0 28px;
  height: 40px;
  line-height: 40px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.left-tabs .el-tabs__item.is-active {
  color: #00B8E6;
  background: #00B8E6;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 184, 230, 0.3);
}

.left-tabs .el-tabs__item:hover {
  color: #00B8E6;
  background: rgba(0, 184, 230, 0.1);
}

.tab-content {
  height: 100%;
  max-height: 100%; /* 防止溢出 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  flex: 1; /* 占据剩余空间 */
  min-height: 0; /* 允许收缩 */
}

/* 提示词卡片容器 */
/* 提示词瀑布流容器 */
/* 提示词区域容器 - 使用相对定位 */
.prompts-area-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 180px);
  min-height: 0;
}

.prompts-waterfall-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px 52px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
  grid-auto-rows: min-content;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.prompts-waterfall-container::-webkit-scrollbar {
  width: 6px;
}

.prompts-waterfall-container::-webkit-scrollbar-track {
  background: transparent;
}

.prompts-waterfall-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.prompts-waterfall-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 加载状态样式 */
.loading-prompts {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

/* 瀑布流提示词卡片样式 */
.prompt-card-waterfall {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 8px;
  padding: 0;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  aspect-ratio: 3/4;
  width: 100%;
  min-height: 150px;
  max-height: 200px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.prompt-card-waterfall:hover {
  background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
  border-color: #00B8E6;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 184, 230, 0.15);
}

.card-image-waterfall {
  width: 100%;
  height: 85%;
  border-radius: 0;
  overflow: hidden;
  margin-bottom: 0;
  background: linear-gradient(135deg, #f5f5f5 0%, #e8f2ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.card-image-waterfall img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
}

.no-image-waterfall {
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.card-content-waterfall {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4px;
}

.card-title-waterfall {
  font-size: 11px;
  font-weight: 600;
  color: #21232A;
  margin: 0 0 2px 0;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

/* 提示词分页样式 - 固定在底部 */
.prompts-pagination-fixed {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 12px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  z-index: 10;
  overflow-x: auto;
  overflow-y: hidden;
}

.prompts-pagination-fixed :deep(.el-pagination) {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: max-content;
}

.prompts-pagination-fixed :deep(.el-pagination.is-background .btn-prev),
.prompts-pagination-fixed :deep(.el-pagination.is-background .btn-next),
.prompts-pagination-fixed :deep(.el-pagination.is-background .el-pager li) {
  background-color: #f5f7fa;
  border-radius: 4px;
  min-width: 28px;
  height: 28px;
  line-height: 28px;
  font-size: 12px;
}

.prompts-pagination-fixed :deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
  background-color: #409eff;
  color: white;
}

.prompts-pagination-fixed :deep(.el-pagination.is-background .btn-prev):hover,
.prompts-pagination-fixed :deep(.el-pagination.is-background .btn-next):hover,
.prompts-pagination-fixed :deep(.el-pagination.is-background .el-pager li:not(.is-disabled):hover) {
  background-color: #409eff;
  color: white;
}

.prompts-pagination-fixed :deep(.el-pagination__total) {
  font-size: 12px;
  color: #606266;
}

.card-content {
  margin-bottom: 8px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-text {
  font-size: 11px;
  color: #666;
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-actions {
  display: flex;
  gap: 4px;
}

.card-actions .el-button {
  flex: 1;
  font-size: 11px;
  padding: 4px 8px;
  height: auto;
}

/* 空状态 */
.empty-prompts {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.empty-prompts .el-icon {
  color: #ccc;
  margin-bottom: 12px;
}

.empty-prompts p {
  margin: 0 0 16px 0;
  font-size: 14px;
}

/* 添加提示词区域 */
.add-prompt-section {
  padding: 16px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.add-prompt-btn {
  width: 100%;
  height: 36px;
  font-size: 13px;
}

.control-panel {
  width: 450px;
  height: calc(100vh - 32px);
  margin: 16px 0;
  background: white;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  border: 1px solid #e2e8f0;
  overflow-y: auto;
  flex-shrink: 0;
}

.result-panel {
  flex: 1;
  height: calc(100vh - 32px);
  margin: 16px 16px 16px 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  border: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: white;
  flex-shrink: 0;
  border-radius: 12px 12px 0 0;
}

.result-header h2 {
  margin: 0;
  color: #21232A;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}


.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.download-all-btn {
  color: #67c23a;
  border-color: #67c23a;
  background-color: transparent;
  transition: all 0.3s ease;
}

.download-all-btn:hover {
  color: #fff;
  background-color: #67c23a;
  border-color: #67c23a;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.3);
}

.clear-results-btn {
  color: #f56c6c;
  border-color: #f56c6c;
  background-color: transparent;
  transition: all 0.3s ease;
}

.clear-results-btn:hover {
  color: #fff;
  background-color: #f56c6c;
  border-color: #f56c6c;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

.auto-download-switch {
  display: flex;
  align-items: center;
}

.auto-download-switch .el-switch {
  --el-switch-on-color: #67c23a;
  --el-switch-off-color: #dcdfe6;
}

.auto-download-switch .el-switch__label {
  font-size: 13px;
  color: #21232A;
  font-weight: 500;
}

.result-content {
  flex: 1;
  padding: 8px 12px;
  display: flex;
  align-items: flex-start;
  overflow-y: auto;
}

/* 生成进度区域 */
.generating-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.generating-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e4e7ed;
}

.generating-header h3 {
  margin: 0;
  color: #303133;
  font-size: 18px;
  font-weight: 600;
}

.progress-text {
  color: #00B8E6;
  font-weight: 600;
  font-size: 14px;
}

/* 任务网格 */
.tasks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 240px)); /* 与results-grid保持一致 */
  gap: 12px;
  flex: 1;
  margin-top: 8px;
}

/* 任务卡片 */
.task-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border: 2px solid transparent;
  height: 200px; /* 与results-grid保持一致 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.task-pending {
  border-color: #e4e7ed;
}

.task-processing {
  border-color: #00B8E6;
  animation: pulse 2s infinite;
}

.task-completed {
  border-color: #67c23a;
}

.task-failed {
  border-color: #f56c6c;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(64, 158, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
}

.task-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.task-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.pending-icon {
  color: #909399;
}

.processing-icon {
  color: #00B8E6;
  animation: spin 1s linear infinite;
}

.completed-icon {
  color: #67c23a;
}

.failed-icon {
  color: #f56c6c;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.task-info h4 {
  margin: 0 0 4px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.task-info p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

/* 错误信息样式 - 小字且不超出容器 */
.task-info p.error-message {
  font-size: 12px;
  color: #f56c6c;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  line-height: 1.4;
}

.task-progress {
  width: 100%;
  margin-top: 8px;
}

/* 任务状态概览 */
.task-summary {
  width: 100%;
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e4e7ed;
}

.summary-header h3 {
  margin: 0;
  color: #303133;
  font-size: 18px;
  font-weight: 600;
}

.summary-text {
  color: #67c23a;
  font-weight: 600;
  font-size: 14px;
}

.summary-tasks {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.summary-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.summary-task.task-pending {
  border-color: #e4e7ed;
  background: #f8f9fa;
}

.summary-task.task-processing {
  border-color: #00B8E6;
  background: #FFFDF7;
}

.summary-task.task-completed {
  border-color: #67c23a;
  background: #f0f9f0;
}

.summary-task.task-failed {
  border-color: #f56c6c;
  background: #fef0f0;
}

.summary-task-icon {
  font-size: 16px;
}

.summary-task-text {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.history-section {
  margin-bottom: 24px;
}

.history-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 8px;
}

.mode-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.mode-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 700;
  color: #21232A;
  display: flex;
  align-items: center;
  gap: 8px;
}


/* 全局Tab切换样式 */
.global-mode-tabs {
  width: 100%;
  margin-bottom: 1px;
}

.global-mode-tabs .el-tabs__header {
  margin: 0;
  padding-bottom: 0;
  background: transparent;
  border-bottom: 1px solid #e2e8f0;
}

.global-mode-tabs .el-tabs__nav-wrap {
  padding: 0;
}

.global-mode-tabs .el-tabs__nav-wrap::after {
  display: none;
}

.global-mode-tabs .el-tabs__nav {
  display: flex;
  width: 100%;
  background: transparent;
}

.global-mode-tabs .el-tabs__item {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: #64748b;
  padding: 0 20px;
  height: 44px;
  line-height: 44px;
  transition: all 0.3s ease;
  text-align: center;
  background: transparent;
  border: none;
  position: relative;
}

.global-mode-tabs .el-tabs__item.is-active {
  color: #3b82f6;
  background: transparent;
}

.global-mode-tabs .el-tabs__item.is-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%);
  border-radius: 2px;
}

.global-mode-tabs .el-tabs__item:hover:not(.is-active) {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.global-mode-tabs .el-tabs__content {
  display: none;
}

.prompt-section {
  margin-bottom: 8px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.prompt-header {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 8px;
}



.prompt-manager-btn {
  border-radius: 6px;
  font-size: 12px;
  padding: 6px 12px;
}

/* 提示词输入区域的操作按钮 */
.prompt-action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.prompt-action-buttons .el-button {
  flex: 1;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  background: #409eff;
  border-color: #409eff;
  color: white;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
  transition: all 0.3s ease;
}

.prompt-action-buttons .el-button:hover {
  background: #66b1ff;
  border-color: #66b1ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

.prompt-action-buttons .el-button:active {
  transform: translateY(0);
}

.prompt-action-buttons .el-button.is-disabled {
  background: #a0cfff;
  border-color: #a0cfff;
  color: white;
  opacity: 0.6;
}

/* 批量输入对话框样式 */
.batch-prompt-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.batch-prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
  font-weight: 500;
}

.batch-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

.batch-input-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-number {
  min-width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #409eff;
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.batch-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  color: #409eff;
  font-size: 14px;
}

.batch-tips .el-icon {
  font-size: 16px;
}

/* 多行标签输入组件样式 */
.prompt-input-tag {
  width: 100%;
  margin-bottom: 0;
}

.prompt-input-tag :deep(.tags-container) {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border: 1px solid #e4e7ed;
  transition: all 0.3s ease;
}

.prompt-input-tag :deep(.tags-container:hover) {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.prompt-input-tag :deep(.tags-container.is-focused) {
  border-color: #00B8E6;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.prompt-input-tag :deep(.tag-item) {
  background: #00B8E6;
  border: none;
  color: white;
  font-weight: 500;
  margin: 0;
  max-width: 200px;
  word-break: break-all;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.prompt-input-tag :deep(.tag-item:hover) {
  background: #0098C3;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.prompt-input-tag :deep(.tag-item .el-tag__close) {
  color: white;
  font-size: 12px;
}

.prompt-input-tag :deep(.tag-item .el-tag__close:hover) {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.prompt-input-tag :deep(.textarea-input .el-textarea__inner) {
  background: transparent;
  border: none;
  font-size: 14px;
  line-height: 1.5;
  color: #606266;
}

.prompt-input-tag :deep(.textarea-input .el-textarea__inner::placeholder) {
  color: #a8abb2;
  font-style: italic;
}

.prompt-input-tag :deep(.input-hint) {
  color: #909399;
  font-size: 12px;
}

.common-prompts {
  margin-top: 12px;
}

.common-prompts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.common-prompts-label {
  font-size: 13px;
  color: #21232A;
  font-weight: 600;
}

.manage-prompts-btn {
  font-size: 11px;
  padding: 2px 6px;
  height: auto;
}

.common-prompts-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 未选中的常用提示词按钮 - 使用紫色空心样式 */
.common-prompts-buttons .el-button {
  font-size: 12px;
  padding: 4px 8px;
  height: auto;
  margin: 0;
  transition: all 0.3s ease;
  border: 1.5px solid #00B8E6;
  color: #0098C3;
  background: transparent;
}

.common-prompts-buttons .el-button:hover {
  border-color: #0098C3;
  color: #0098C3;
  background: rgba(163, 210, 232, 0.05);
}

/* 选中的常用提示词按钮 - 实心白字 */
.common-prompts-buttons .el-button.selected-prompt {
  border: 1px solid #00B8E6;
  color: #ffffff;
  background: #00B8E6;
  font-weight: 600;
  box-shadow: none;
}

.common-prompts-buttons .el-button.selected-prompt:hover {
  border-color: #0098C3;
  color: #ffffff;
  background: #0098C3;
  box-shadow: none;
}

.image-upload-section {
  margin-bottom: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.image-upload-section h3 {
  margin: 0 0 12px 0;
  color: #21232A;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}


.image-upload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.image-upload-header h3 {
  margin: 0;
  color: #21232A;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}


.reference-manager-btn {
  font-size: 12px;
}

.upload-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.image-uploader {
  width: 100%;
  display: flex;
  justify-content: center;
}

.upload-placeholder-square {
  width: 80px;
  height: 80px;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fafafa;
}

.upload-placeholder-square:hover {
  border-color: #00B8E6;
  background: #FFFDF7;
  transform: translateY(-2px);
}

.upload-icon {
  font-size: 24px;
  color: #c0c4cc;
}

.upload-text-container {
  text-align: center;
}

.upload-text {
  font-size: 14px;
  color: #606266;
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: #909399;
}



.image-preview {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-preview:hover .image-overlay {
  opacity: 1;
}

/* 已上传图片区域 */
.uploaded-images {
  margin-top: 16px;
}

.images-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #333;
}

/* 横向排列的图片网格 */
.images-horizontal-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-item-small {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.image-item-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay-small {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-item-small:hover .image-overlay-small {
  opacity: 1;
}

.image-overlay-small .el-button {
  padding: 2px 6px;
  font-size: 10px;
  height: auto;
}


/* 常用参考图图标区域 */
.common-reference-icons {
  margin-top: 16px;
}

.icons-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #21232A;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 分类标签样式 */
.category-tabs {
  display: flex;
  gap: 6px;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.category-tab:hover {
  background: #FFFDF7;
  border-color: #D4ECFA;
}

.category-tab.active {
  background: #00B8E6;
  border-color: #00B8E6;
  color: white;
}

.category-name {
  font-weight: 600;
}

.category-count {
  opacity: 0.8;
  font-size: 11px;
}


.collapse-btn {
  font-size: 13px;
  padding: 4px 8px;
  height: auto;
  color: #0098C3;
  font-weight: 500;
}

.collapse-btn:hover {
  color: #0098C3;
}

.icons-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  transition: all 0.3s ease;
}

.icons-grid.collapsed {
  max-height: 92px; /* 2行的高度 */
  overflow: hidden;
}

.reference-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.reference-icon:hover {
  border-color: #00B8E6;
  transform: scale(1.05);
}

.reference-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-section {
  margin-bottom: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 6px;
  border: 1px solid rgba(226, 232, 240, 0.5);
  display: flex;
  gap: 8px;
}

.settings-section.compact-section {
  padding: 8px;
  margin-bottom: 6px;
}

.setting-item {
  flex: 1;
}

.setting-item h3 {
  margin: 0 0 10px 0;
  color: #21232A;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}


.setting-select {
  width: 100%;
}

.setting-select .el-select__wrapper {
  border-radius: 8px;
  height: 40px;
}

/* 上下两列布局样式 */
.settings-section.vertical-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-section.vertical-layout .setting-item {
  width: 100%;
}

/* 标签选择器样式 - 参照原型图简约设计 */
.tag-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.tag-option {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  text-align: center;
  min-width: 32px;
}

.tag-option:hover {
  border-color: #00B8E6;
  color: #00B8E6;
  background: #f8faff;
}

.tag-option.active {
  background: #00B8E6;
  border-color: #00B8E6;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.3);
}

/* ==================== 比例选择器样式 ==================== */
.ratio-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.ratio-option {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  min-width: 45px;
}

.ratio-option:hover {
  border-color: #00B8E6;
  background: #f8faff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 184, 230, 0.15);
}

.ratio-option.active {
  border-color: #0098C3;
  background: #0098C3;
  box-shadow: 0 4px 12px rgba(0, 152, 195, 0.4);
  transform: translateY(-2px);
}

.ratio-option.active .ratio-box {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
}

.ratio-option.active .ratio-text {
  color: #ffffff;
  font-weight: 600;
}

.ratio-box {
  border: 2px solid #94a3b8;
  background: transparent;
  transition: all 0.2s ease;
}

.ratio-text {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  line-height: 1;
}

/* 不同比例的线框尺寸 - 增加2px */
.ratio-box.ratio-1-1 {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.ratio-box.ratio-16-9 {
  width: 18px;
  height: 11px;
  border-radius: 2px;
}

.ratio-box.ratio-9-16 {
  width: 11px;
  height: 18px;
  border-radius: 2px;
}

.ratio-box.ratio-4-3 {
  width: 16px;
  height: 12px;
  border-radius: 2px;
}

.ratio-box.ratio-3-4 {
  width: 12px;
  height: 16px;
  border-radius: 2px;
}

.ratio-box.ratio-3-2 {
  width: 17px;
  height: 12px;
  border-radius: 2px;
}

.ratio-box.ratio-2-3 {
  width: 12px;
  height: 17px;
  border-radius: 2px;
}

.ratio-box.ratio-21-9 {
  width: 20px;
  height: 10px;
  border-radius: 2px;
}

.ratio-box.ratio-9-21 {
  width: 10px;
  height: 20px;
  border-radius: 2px;
}

.ratio-box.ratio-4-5 {
  width: 14px;
  height: 17px;
  border-radius: 2px;
}

.ratio-box.ratio-5-4 {
  width: 17px;
  height: 14px;
  border-radius: 2px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.concurrent-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  background: #e0f2fe;
  border-radius: 8px;
  border: 1px solid #7dd3fc;
  font-size: 13px;
  color: #0369a1;
}

.concurrent-tip .el-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* 确保按钮完全对齐 */
.action-buttons .el-button {
  margin: 0;
  padding: 0;
  border: none;
  box-sizing: border-box;
}

.generate-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  background: #0098C3;
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.generate-btn:hover {
  background: #3A9CC9;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 152, 195, 0.4);
}

.reset-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-result {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  width: 100%;
  padding: 40px 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  max-width: 300px;
}

.empty-icon-container {
  position: relative;
  margin-bottom: 24px;
}

.empty-icon {
  font-size: 80px;
  color: #e0e0e0;
  z-index: 2;
  position: relative;
}

.empty-decoration {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
  animation: float 3s ease-in-out infinite;
}

.circle-1 {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #00B8E6, #67C23A);
  top: 0;
  left: 0;
  animation-delay: 0s;
}

.circle-2 {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #E6A23C, #F56C6C);
  top: 20px;
  right: 0;
  animation-delay: 1s;
}

.circle-3 {
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, #909399, #C0C4CC);
  bottom: 0;
  left: 20px;
  animation-delay: 2s;
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  color: #606266;
  margin: 0 0 12px 0;
}

.empty-description {
  font-size: 14px;
  color: #909399;
  margin: 0;
  line-height: 1.5;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.images-result {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}


.images-actions {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.images-actions .el-button {
  border-radius: 8px;
  font-weight: 500;
  padding: 12px 24px;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .left-panel {
    width: 320px;
  }
  
  .control-panel {
    width: 420px;
  }
}

@media (max-width: 1200px) {
  .main-layout {
    flex-direction: column !important;
    height: auto !important;
    min-height: auto !important;
    gap: 0;
    overflow-y: visible !important;
    overflow-x: hidden !important;
  }

  .left-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    flex-direction: row;
    gap: 0;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
    margin: 0 !important;
    padding: 12px !important;
    border-radius: 0;
    overflow: visible !important;
  }

  .tab-section {
    flex: 1;
    border-radius: 0;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  .control-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 16px !important;
    border-radius: 0;
    overflow-y: visible !important;
    overflow-x: hidden !important;
  }

  .result-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    margin: 0 !important;
    border-radius: 0;
    overflow: visible !important;
  }

  /* 平板端内容区域高度修复 */
  .tab-content {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  .prompts-waterfall-container {
    max-height: none !important;
    height: auto !important;
  }

  .images-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 768px) {
  .main-layout {
    min-height: auto !important;
    height: auto !important;
    gap: 0;
    flex-direction: column !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
  }

  .left-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 12px !important;
    flex-direction: column;
    gap: 0;
    border-bottom: 1px solid #e2e8f0;
    border-radius: 0;
    overflow: visible !important;
  }

  .tab-section {
    width: 100%;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    border-radius: 0;
    flex: none;
    overflow: visible !important;
  }

  .control-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    padding: 16px !important;
    margin: 0 !important;
    border-radius: 0;
    overflow-y: visible !important;
    overflow-x: hidden !important;
  }

  .result-panel {
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    margin: 0 !important;
    padding-bottom: 20px !important;
    border-radius: 0;
    overflow: visible !important;
  }

  /* 移动端内容区域高度修复 */
  .tab-content {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  .prompts-waterfall-container {
    max-height: none !important;
    height: auto !important;
    grid-template-columns: 1fr !important;
  }

  /* 移动端全局Tab样式优化 */
  .global-mode-tabs {
    margin-bottom: 16px;
  }
  
  .global-mode-tabs .el-tabs__item {
    font-size: 14px;
    padding: 0 16px;
    height: 40px;
    line-height: 40px;
  }
  
  /* 移动端常用提示词按钮优化 */
  .common-prompts-buttons {
    gap: 6px;
  }

  .common-prompts-buttons .el-button {
    font-size: 11px;
    padding: 3px 6px;
  }

  .common-prompts-buttons .el-button.selected-prompt {
    /* 移动端保持实心样式，不添加额外效果 */
  }

  .common-prompts-buttons .el-button.selected-prompt:hover {
    /* 移动端保持实心样式 */
  }

  .result-header {
    padding: 12px 16px;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .result-header h2 {
    font-size: 18px;
  }
  
  .header-actions {
    width: 100%;
    justify-content: center;
  }
  
  .result-content {
    padding: 16px;
  }
  
  .images-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 12px;
  }
  
  .upload-placeholder-square,
  .image-preview {
    width: 80px;
    height: 80px;
  }

  /* 移动端按钮组优化 */
  .download-all-btn,
  .clear-results-btn {
    font-size: 12px;
    padding: 4px 8px;
  }

  .auto-download-switch {
    font-size: 12px;
  }

  /* 移动端生成按钮优化 */
  .generate-button {
    width: 100% !important;
    padding: 12px 20px !important;
    font-size: 16px !important;
  }

  /* 移动端输入框优化 */
  .prompt-input,
  .tag-input {
    font-size: 14px !important;
  }

  /* 移动端任务卡片优化 */
  .tasks-grid {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }

  .task-card {
    min-height: 150px;
  }

  /* 移动端结果网格优化 */
  .results-grid {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }

  /* 移动端批次卡片优化 */
  .batch-card {
    border-radius: 12px;
    margin-bottom: 16px;
  }

  .batch-header {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 8px;
  }

  .batch-info {
    width: 100%;
  }

  .batch-actions {
    width: 100%;
    justify-content: flex-start;
  }

  /* 移动端对话框优化 */
  .el-dialog {
    width: 90% !important;
    margin: 0 auto;
  }

  /* 移动端表单优化 */
  .el-form-item {
    margin-bottom: 16px;
  }

  .el-form-item__label {
    font-size: 13px;
  }

  /* 移动端图片卡片优化 */
  .image-card {
    border-radius: 12px;
  }

  /* 移动端视频卡片优化 */
  .video-card {
    border-radius: 12px;
  }

  /* 移动端提示词卡片优化 */
  .prompt-card-waterfall {
    height: auto;
    min-height: 180px;
  }

  .card-image-waterfall {
    height: 150px;
  }

  .card-title-waterfall {
    font-size: 13px;
  }

  /* 移动端隐藏不必要的元素 */
  .upload-tip {
    font-size: 11px;
  }

  /* 移动端优化上传区域 */
  .upload-area {
    padding: 12px;
  }

  .images-preview {
    gap: 8px;
  }

  /* 移动端优化参数选择 */
  .size-selector,
  .quantity-selector,
  .model-selector {
    margin-bottom: 12px;
  }

  /* 移动端优化标签输入 */
  .tag-input-container {
    padding: 8px;
  }

  /* 移动端文字大小调整 */
  h2 {
    font-size: 18px !important;
  }

  h3 {
    font-size: 16px !important;
  }

  h4 {
    font-size: 14px !important;
  }

  p {
    font-size: 13px;
  }

  /* 移动端内边距调整 */
  .section {
    padding: 12px;
  }

  /* 移动端卡片间距 */
  .card {
    margin: 8px 0;
  }
}

/* 超小屏幕适配 (iPhone SE等) */
@media (max-width: 375px) {
  .main-layout {
    font-size: 13px;
  }

  .result-header h2 {
    font-size: 16px !important;
  }

  .download-all-btn,
  .clear-results-btn {
    font-size: 11px;
    padding: 3px 6px;
  }

  .generate-button {
    padding: 10px 16px !important;
    font-size: 14px !important;
  }

  .prompt-card-waterfall {
    min-height: 160px;
  }

  .card-image-waterfall {
    height: 130px;
  }

  .task-card {
    min-height: 120px;
  }

  .el-dialog {
    width: 95% !important;
  }
}

/* 平板横屏适配 */
@media (min-width: 768px) and (max-width: 1024px) and (orientation: landscape) {
  .main-layout {
    flex-direction: row;
  }

  .left-panel {
    width: 40%;
    max-width: 400px;
  }

  .control-panel {
    width: 35%;
    max-width: 380px;
  }

  .result-panel {
    flex: 1;
  }

  .tasks-grid,
  .results-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 触摸设备优化 */
@media (hover: none) and (pointer: coarse) {
  /* 增大触摸目标 */
  .el-button {
    min-height: 44px;
    padding: 8px 16px;
  }

  /* 增大可点击区域 */
  .task-card,
  .image-card,
  .video-card,
  .prompt-card-waterfall {
    cursor: pointer;
    -webkit-tap-highlight-color: rgba(0, 184, 230, 0.1);
  }

  /* 优化滚动行为 */
  .control-panel,
  .result-content,
  .tab-content {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }

  /* 禁用悬停效果 */
  .image-card:hover,
  .video-card:hover,
  .prompt-card-waterfall:hover {
    transform: none;
  }

  /* 触摸反馈 */
  .el-button:active {
    transform: scale(0.98);
  }
}

/* 滚动条样式 */
.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 图片预览弹窗样式 */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(5px);
}

.image-modal-content {
  position: relative;
  width: 90%;
  height: 90%;
  max-width: 1200px;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 18px;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  background: #000;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: grab;
  transition: transform 0.1s ease;
  user-select: none;
}

.preview-image:active {
  cursor: grabbing;
}

.image-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  font-size: 16px;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.image-counter {
  color: white;
  font-size: 14px;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  font-size: 14px;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.download-btn {
  width: 36px;
  height: 36px;
  background: rgba(64, 158, 255, 0.8);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  font-size: 16px;
}

.download-btn:hover {
  background: rgba(64, 158, 255, 1);
  transform: scale(1.1);
}

.save-prompt-btn {
  padding: 10px 20px;
  background: #00B8E6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.save-prompt-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 184, 230, 0.4);
}

.save-prompt-btn .el-icon {
  font-size: 16px;
}

/* 图片预览操作按钮组 */
.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 通用操作按钮样式 */
.action-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  white-space: nowrap;
  color: white;
}

.action-btn .el-icon {
  font-size: 16px;
}

/* 再次修改按钮 */
.edit-again-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.edit-again-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

/* 生成视频按钮 */
.generate-video-btn {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  box-shadow: 0 2px 8px rgba(245, 87, 108, 0.3);
}

.generate-video-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.5);
}

/* 下载按钮（在操作按钮组中） */
.action-buttons-group .download-btn {
  width: auto;
  padding: 10px 20px;
  border-radius: 8px;
  background: rgba(64, 158, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-buttons-group .download-btn:hover {
  background: rgba(64, 158, 255, 1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

/* 保存提示词按钮（在操作按钮组中） */
.action-buttons-group .save-prompt-btn {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  box-shadow: 0 2px 8px rgba(0, 242, 254, 0.3);
}

.action-buttons-group .save-prompt-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 242, 254, 0.5);
}

/* 视频预览弹窗样式 */
.video-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(5px);
}

.video-modal-content {
  position: relative;
  width: 90%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  padding: 20px;
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}

.preview-video {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.video-modal-info {
  display: flex;
  gap: 20px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 16px;
}

.video-modal-info .info-row {
  color: #e0e0e0;
  font-size: 14px;
}

.video-modal-info .info-row strong {
  color: #fff;
  margin-right: 8px;
}

.download-btn-video {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(64, 158, 255, 0.8);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.download-btn-video:hover {
  background: rgba(64, 158, 255, 1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

/* 强制隐藏参考图管理弹窗的header（仅针对特定弹窗） */
.reference-manager-dialog .el-dialog__header {
  display: none !important;
}

html {
  overflow-x: hidden;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .image-modal-content {
    width: 95%;
    height: 95%;
  }
  
  .image-controls {
    padding: 12px 16px;
    flex-direction: column;
    gap: 12px;
  }
  
  .nav-controls,
  .zoom-controls {
    gap: 8px;
  }
  
  .nav-btn,
  .control-btn,
  .download-btn {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }
  
  .image-counter {
    font-size: 12px;
  }
}

/* 模型选择器样式 */
.model-selector {
  width: 100%;
}

.model-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-name {
  font-weight: 500;
  color: #303133;
}

.default-tag {
  background: #00B8E6;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  align-self: flex-start;
}

.model-description {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

/* 模型选择器下拉框样式优化 */
:deep(.el-select-dropdown__item) {
  padding: 8px 12px;
}

:deep(.el-select-dropdown__item:hover) {
  background-color: #f5f7fa;
}

:deep(.el-select-dropdown__item.selected) {
  background-color: #FFFDF7;
  color: #00B8E6;
}

/* 视频生成区域样式 */
.video-input-section {
  margin-top: 20px;
}

.video-result-container {
  height: 100%;
}

.reference-images-section {
  margin-top: 10px;
}

/* 首尾帧并排布局 */
.frame-upload-container {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
}

.frame-upload-item {
  flex: 1;
  min-width: 0;
}

.frame-label {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  font-weight: 500;
  color: #333;
  font-size: 13px;
}

.frame-hint {
  margin-left: 4px;
  font-size: 11px;
  color: #999;
  font-weight: normal;
}

/* 首尾帧上传区域样式 */
.frame-upload {
  width: 100%;
}

.frame-upload .el-upload-dragger {
  width: 100%;
  height: 80px;
  border: 2px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s;
}

.frame-upload .el-upload-dragger:hover {
  border-color: #00B8E6;
}

.frame-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
}

.frame-upload-icon {
  font-size: 20px;
  color: #c0c4cc;
  margin-bottom: 4px;
}

.frame-upload-text {
  text-align: center;
}

.frame-upload-text p {
  margin: 0;
  font-size: 12px;
  color: #606266;
  line-height: 1.2;
}

.frame-upload-hint {
  font-size: 10px !important;
  color: #909399 !important;
}

/* 保留原有的reference样式以兼容其他部分 */
.reference-upload-item {
  margin-bottom: 20px;
}

.reference-label {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.reference-hint {
  margin-left: 4px;
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.upload-area {
  text-align: center;
  padding: 30px 20px;
  border: 2px dashed #d9d9d9;
  border-radius: 6px;
  background-color: #fafafa;
  transition: border-color 0.3s;
}

.upload-area:hover {
  border-color: #00B8E6;
}

.upload-icon {
  font-size: 36px;
  color: #c0c4cc;
  margin-bottom: 12px;
}

.upload-text p {
  margin: 0;
  color: #666;
}

.upload-hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.upload-instructions {
  margin-top: 16px;
}

.instruction-list {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.6;
}

.instruction-list li {
  margin-bottom: 4px;
  color: #666;
}

/* 新增的视频相关样式 */
/* 紧凑上传布局 */
.upload-compact-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.upload-compact-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 180px;
}

.compact-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.compact-preview-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  height: 32px;
}

.compact-thumb {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 3px;
  flex-shrink: 0;
}

.compact-filename {
  flex: 1;
  font-size: 13px;
  color: #00B8E6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-uploader {
  height: 32px;
}

.compact-uploader .el-button {
  width: 100%;
  height: 100%;
  padding: 4px 12px;
}

/* 紧凑参数行布局 */
.params-compact-row {
  display: flex;
  gap: 8px;
}

.param-compact-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-compact-col label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.param-compact-col .el-select {
  width: 100%;
}

.param-hint-inline {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  line-height: 1.4;
}

/* 折叠高级选项样式 */
.compact-section {
  margin: 8px 0;
}

.advanced-collapse {
  border: none;
  background: transparent;
}

.advanced-collapse .el-collapse-item__header {
  background: transparent;
  border: none;
  padding: 0;
  height: auto;
  line-height: normal;
}

.advanced-collapse .el-collapse-item__wrap {
  border: none;
  background: transparent;
}

.advanced-collapse .el-collapse-item__content {
  padding: 8px 0 0 0;
}

.collapse-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.advanced-options-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
}

.option-item-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-item-compact label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.option-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.option-checkboxes .el-checkbox {
  margin: 0;
}

/* 紧凑参考图管理样式 */
.reference-compact-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reference-actions-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.uploaded-images-compact {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 8px;
  border: 1px solid #e2e8f0;
}

.compact-images-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.image-count {
  color: #606266;
  font-weight: 500;
}

.compact-images-grid {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.compact-image-item {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
}

.compact-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  font-size: 10px;
}

.more-images-indicator {
  width: 40px;
  height: 40px;
  background: #f0f2f5;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

/* 超紧凑视频上传样式 */
.video-upload-ultra-compact {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

/* 首尾帧互换按钮容器 */
.swap-button-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 20px;
}

/* 首尾帧互换按钮 */
.swap-frames-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  color: white !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
}

.swap-frames-btn:hover {
  transform: rotate(180deg) scale(1.1) !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5) !important;
}

.swap-frames-btn:active {
  transform: rotate(180deg) scale(0.95) !important;
}

/* 角色客串样式 */
.character-section {
  padding: 8px 0;
}

.character-input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.character-input-group .input-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.character-input-group .input-item label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
}

.video-upload-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.ultra-compact-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin: 0;
}

.ultra-compact-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  height: 36px;
}

.ultra-thumb {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 3px;
  flex-shrink: 0;
}

.ultra-compact-uploader {
  height: 36px;
}

.ultra-compact-uploader .el-button {
  width: 100%;
  height: 100%;
  font-size: 12px;
}

/* 图生图紧凑上传样式 */
.image-upload-header-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.image-upload-header-inline h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.reference-upload-compact {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 1px;
}

.uploaded-compact-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
}

.upload-count {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

.uploaded-thumbnails-compact {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.thumbnail-item-compact {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: visible;
  border: 2px solid #dcdfe6;
  transition: all 0.3s ease;
}

.thumbnail-item-compact::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  overflow: hidden;
  z-index: 1;
}

.thumbnail-item-compact:hover {
  border-color: #00B8E6;
  transform: scale(1.05);
}

/* 拖拽状态样式 */
.thumbnail-item-compact.dragging {
  opacity: 0.5;
  cursor: move;
}

.thumbnail-item-compact.drag-over {
  border: 2px dashed #00B8E6;
  background-color: rgba(64, 158, 255, 0.1);
  box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
}

.thumbnail-item-compact.drag-over::after {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border: 2px dashed #00B8E6;
  border-radius: 8px;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.thumbnail-item-compact img {
  cursor: pointer;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  position: relative;
  z-index: 2;
}

.remove-thumb-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  font-size: 12px;
  z-index: 10;
  background: #f56c6c;
  border-color: #f56c6c;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.4);
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: auto;
}

.remove-thumb-btn:hover {
  background: #f78989;
  border-color: #f78989;
  transform: scale(1.1);
}

.thumbnail-item-compact:hover .remove-thumb-btn {
  opacity: 1;
}

/* 参考图序号标签样式 */
.reference-number {
  position: absolute;
  top: -8px;
  left: -8px;
  background: #0098C3;
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 10px;
  z-index: 10;
}

/* 图片加载占位符样式 */
.image-loading-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
  border-radius: 4px;
  gap: 6px;
}

.loading-spinner {
  font-size: 20px;
  color: #409eff;
  animation: rotate 1s linear infinite;
}

.loading-text {
  font-size: 10px;
  color: #909399;
  font-weight: 500;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 加载状态的缩略图样式 */
.thumbnail-item-compact.loading {
  border-color: #409eff;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
}

.thumbnail-item-compact.loading:hover {
  transform: none;
  cursor: default;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

/* 内联常用参考图样式 */
.common-reference-icons-inline {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.icons-header-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.icons-header-inline > span {
  font-size: 14px;
  font-weight: 600;
  color: #21232A;
}

.header-actions-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-tabs-inline {
  display: flex;
  gap: 8px;
}

.category-tab-inline {
  padding: 4px 10px;
  background: #f5f7fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 12px;
}

.category-tab-inline:hover {
  background: #e6e8eb;
}

.category-tab-inline.active {
  background: #00B8E6;
  color: white;
}

.category-name {
  font-weight: 600;
}

.category-count {
  opacity: 0.7;
  margin-left: 4px;
}

.icons-grid-inline {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(50px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  transition: max-height 0.3s ease;
}

.icons-grid-inline.collapsed {
  max-height: 120px;
}

.reference-icon-inline {
  width: 50px;
  height: 50px;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 2px solid #e2e8f0;
  transition: all 0.3s ease;
}

.reference-icon-inline:active {
  cursor: grabbing;
}

.reference-icon-inline:hover {
  border-color: #00B8E6;
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.reference-icon-inline img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 图片加载失败占位符 */
.reference-icon-inline .image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  color: #c0c4cc;
}

.reference-icon-inline .image-placeholder .el-icon {
  font-size: 20px;
}

/* 常用参考图加载动画 */
.reference-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: #909399;
  font-size: 14px;
}

.reference-loading .el-icon {
  color: #00B8E6;
}

.upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.upload-item {
  display: flex;
  flex-direction: column;
}

.upload-label {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
  font-size: 14px;
}

.image-uploader {
  width: 100%;
}

.image-preview {
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px dashed #d9d9d9;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0;
  transition: opacity 0.3s;
}

.image-preview:hover .image-overlay {
  opacity: 1;
}

.upload-placeholder {
  width: 100%;
  height: 200px;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  transition: border-color 0.3s;
}

.upload-placeholder:hover {
  border-color: #00B8E6;
}

.upload-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 14px;
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: #c0c4cc;
}

.params-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-item label {
  color: #303133;
  font-weight: 600;
  font-size: 14px;
}

.param-select,
.param-input {
  width: 100%;
}

.advanced-options {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.options-grid {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.option-item.full-width {
  flex-direction: column;
  grid-column: 1 / -1; /* 占据整行 */
}

.option-item.full-width label {
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

.option-item.full-width .el-input,
.option-item.full-width .el-select {
  width: 100%;
}

.option-item .el-checkbox {
  margin-top: 2px;
}

.option-desc {
  color: #6c757d;
  font-size: 14px;
  line-height: 1.4;
  flex: 1;
}

@media (max-width: 768px) {
  .upload-grid {
    grid-template-columns: 1fr;
  }
  
  .params-grid {
    grid-template-columns: 1fr;
  }
}

/* 视频卡片样式 */
.video-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.video-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.video-player {
  width: 100%;
  height: auto;
  display: block;
  background: #000;
}

.video-info {
  padding: 15px;
  background: #f8f9fa;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  border-top: 1px solid #e9ecef;
}

.video-info .info-item {
  font-size: 13px;
  color: #495057;
  line-height: 1.5;
}

.video-info .info-item strong {
  color: #212529;
  margin-right: 4px;
}

.video-actions {
  padding: 15px;
  display: flex;
  justify-content: center;
  gap: 10px;
  border-top: 1px solid #e9ecef;
}

.video-actions .el-button {
  flex: 1;
  max-width: 200px;
}

/* ==================== 批次系统样式 ==================== */
.result-content {
  max-height: calc(100vh - 100px); /* 限制最大高度，减少底部空白 */
  overflow-y: auto; /* 启用垂直滚动 */
  padding-right: 10px; /* 为滚动条留出空间 */
}

/* 自定义滚动条样式 */
.result-content::-webkit-scrollbar {
  width: 8px;
}

.result-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.result-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
  transition: background 0.3s ease;
}

.result-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.batches-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  width: 100%;
}

.batch-card {
  background: white;
  border-radius: 6px;
  padding: 8px 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  border: 1px solid #e8eaed;
  transition: all 0.3s ease;
}

.batch-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  transform: translateY(-2px);
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f2f5;
}

.batch-info {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
}

.batch-type {
  font-weight: 600;
  color: #00B8E6;
  font-size: 15px;
  padding: 4px 12px;
  background: #FFFDF7;
  border-radius: 6px;
  flex-shrink: 0;
}

.batch-time {
  color: #909399;
  font-size: 13px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.batch-prompt {
  color: #606266;
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

/* 批次模型标签 - 紧跟在 batch-type 后面 */
.batch-model-tag {
  padding: 4px 10px;
  background: #00B8E6;
  color: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.status-pending {
  background: #f4f4f5;
  color: #909399;
}

.status-processing {
  background: #FFFDF7;
  color: #00B8E6;
  animation: pulse 2s ease-in-out infinite;
}

.status-completed {
  background: #FFFDF7;
  color: #67c23a;
}

.status-partial {
  background: #fdf6ec;
  color: #e6a23c;
}

.status-failed {
  background: #fef0f0;
  color: #f56c6c;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 180px));
  gap: 8px;
  margin-top: 8px;
}

.results-grid .video-card,
.results-grid .main-card,
.tasks-grid .main-card {
  width: 100%;
  height: 150px;
}

/* 缩略图模式：results-grid内的视频卡片 */
.results-grid .video-card-thumbnail {
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

/* 视频缩略图容器 */
.video-thumbnail-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

/* 缩略图图片 */
.video-thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 缩略图占位符 */
.video-thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.video-placeholder-icon {
  font-size: 48px;
  color: rgba(255, 255, 255, 0.8);
}

/* 播放按钮覆盖层 */
.video-play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.video-card-thumbnail:hover .video-play-overlay {
  opacity: 1;
}

.video-play-overlay .play-icon {
  font-size: 48px;
  color: white;
  margin-bottom: 8px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.video-play-overlay .play-text {
  color: white;
  font-size: 14px;
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.results-grid .video-card-thumbnail .video-info,
.results-grid .video-card-thumbnail .video-actions {
  display: none;
}

/* 整体布局样式 */
.app-root {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, #f0f0f9 0%, #e5f0f5 50%, #f5e5f0 100%);
}

.main-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* 移动端适配 - 为底部导航栏留出空间 */
@media (max-width: 1200px) {
  .app-root {
    flex-direction: column;
    height: 100vh !important;
    overflow: hidden;
  }

  .main-container {
    flex: 1;
    height: calc(100vh - 64px) !important; /* 减去底部导航栏的高度 */
    max-height: calc(100vh - 64px) !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }
}

@media (max-width: 768px) {
  .app-root {
    flex-direction: column;
    height: 100vh !important;
    overflow: hidden;
  }

  .main-container {
    flex: 1;
    height: calc(100vh - 60px) !important; /* 减去底部导航栏的高度 */
    max-height: calc(100vh - 60px) !important;
    padding-bottom: 0;
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }
}
</style>



