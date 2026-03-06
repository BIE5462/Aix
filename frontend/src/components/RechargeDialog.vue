<template>
  <el-dialog
    v-model="dialogVisible"
    title="充值弹珠"
    width="600px"
    :before-close="handleClose"
    class="recharge-dialog"
  >
    <!-- 当前余额显示 -->
    <div class="current-balance">
      <div class="balance-label">当前余额</div>
      <div class="balance-amount">
        <el-icon class="balance-icon"><Coin /></el-icon>
        <span class="balance-number">{{ currentBalance }}</span>
        <span class="balance-unit">弹珠</span>
      </div>
      <div class="balance-usd">≈ ${{ (currentBalance * 0.001).toFixed(2) }}</div>
    </div>

    <!-- 充值套餐 -->
    <div class="recharge-packages">
      <div class="section-title">
        <el-icon><Present /></el-icon>
        选择充值套餐
      </div>

      <div class="packages-grid">
        <div
          v-for="pkg in packages"
          :key="pkg.id"
          class="package-card"
          :class="{ 'active': selectedPackage?.id === pkg.id, 'popular': pkg.popular }"
          @click="selectPackage(pkg)"
        >
          <div v-if="pkg.popular" class="popular-badge">热门</div>
          <div v-if="pkg.bonus > 0" class="bonus-badge">+{{ pkg.bonus }}%</div>

          <div class="package-amount">${{ pkg.amount }}</div>
          <div class="package-credits">
            <el-icon class="credits-icon"><Coin /></el-icon>
            {{ pkg.credits.toLocaleString() }} 弹珠
          </div>
          <div v-if="pkg.bonus > 0" class="package-bonus">
            额外赠送 {{ (pkg.credits * pkg.bonus / 100).toLocaleString() }} 弹珠
          </div>
          <div class="package-desc">{{ pkg.description }}</div>
        </div>
      </div>
    </div>

    <!-- 自定义金额 -->
    <div class="custom-amount">
      <el-checkbox v-model="useCustomAmount" @change="handleCustomAmountToggle">
        自定义充值金额
      </el-checkbox>

      <div v-if="useCustomAmount" class="custom-input-container">
        <el-input
          v-model.number="customAmount"
          type="number"
          placeholder="输入金额（美元）"
          :min="1"
          :max="10000"
          class="custom-input"
        >
          <template #prefix>$</template>
        </el-input>
        <div class="custom-credits">
          = {{ (customAmount * 1000).toLocaleString() }} 弹珠
        </div>
      </div>
    </div>

    <!-- 支付方式 -->
    <div class="payment-methods">
      <div class="section-title">
        <el-icon><CreditCard /></el-icon>
        支付方式
      </div>

      <el-radio-group v-model="paymentMethod" class="payment-options">
        <el-radio label="alipay" class="payment-option">
          <div class="payment-content">
            <el-icon class="payment-icon-large"><Coin /></el-icon>
            <span>支付宝</span>
          </div>
        </el-radio>
        <el-radio label="wechat" class="payment-option">
          <div class="payment-content">
            <el-icon class="payment-icon-large"><Coin /></el-icon>
            <span>微信支付</span>
          </div>
        </el-radio>
        <el-radio label="stripe" class="payment-option" disabled>
          <div class="payment-content">
            <el-icon class="payment-icon-large"><CreditCard /></el-icon>
            <span>Stripe（即将开放）</span>
          </div>
        </el-radio>
      </el-radio-group>
    </div>

    <!-- 支付信息摘要 -->
    <div v-if="selectedPackage || (useCustomAmount && customAmount > 0)" class="payment-summary">
      <div class="summary-row">
        <span>充值金额：</span>
        <span class="summary-value">${{ getFinalAmount() }}</span>
      </div>
      <div class="summary-row">
        <span>获得弹珠：</span>
        <span class="summary-value highlight">{{ getFinalCredits().toLocaleString() }} 弹珠</span>
      </div>
      <div v-if="getBonusCredits() > 0" class="summary-row bonus">
        <span>额外赠送：</span>
        <span class="summary-value">+{{ getBonusCredits().toLocaleString() }} 弹珠</span>
      </div>
    </div>

    <!-- 温馨提示 -->
    <div class="notice">
      <el-icon><InfoFilled /></el-icon>
      <div class="notice-content">
        <p>• 1弹珠 = $0.001，充值后立即到账</p>
        <p>• 弹珠永久有效，无使用期限</p>
        <p>• 充值遇到问题请联系客服</p>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :disabled="!canProceed"
          :loading="processing"
          @click="handleRecharge"
        >
          <el-icon><Wallet /></el-icon>
          立即支付 ${{ getFinalAmount() }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Coin, Present, CreditCard, InfoFilled, Wallet } from '@element-plus/icons-vue'
import axios from 'axios'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentBalance: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 充值套餐
const packages = ref([
  {
    id: 1,
    amount: 10,
    credits: 10000,
    bonus: 0,
    description: '体验套餐',
    popular: false
  },
  {
    id: 2,
    amount: 50,
    credits: 50000,
    bonus: 10,
    description: '进阶套餐',
    popular: true
  },
  {
    id: 3,
    amount: 100,
    credits: 100000,
    bonus: 15,
    description: '专业套餐',
    popular: false
  },
  {
    id: 4,
    amount: 500,
    credits: 500000,
    bonus: 20,
    description: '企业套餐',
    popular: false
  }
])

// 选中的套餐
const selectedPackage = ref(null)

// 自定义金额
const useCustomAmount = ref(false)
const customAmount = ref(10)

// 支付方式
const paymentMethod = ref('alipay')

// 处理中
const processing = ref(false)

// 选择套餐
const selectPackage = (pkg) => {
  selectedPackage.value = pkg
  useCustomAmount.value = false
}

// 切换自定义金额
const handleCustomAmountToggle = (value) => {
  if (value) {
    selectedPackage.value = null
  }
}

// 获取最终金额
const getFinalAmount = () => {
  if (useCustomAmount.value) {
    return customAmount.value || 0
  }
  return selectedPackage.value?.amount || 0
}

// 获取基础弹珠数
const getBaseCredits = () => {
  if (useCustomAmount.value) {
    return (customAmount.value || 0) * 1000
  }
  return selectedPackage.value?.credits || 0
}

// 获取赠送弹珠数
const getBonusCredits = () => {
  if (useCustomAmount.value) {
    return 0
  }
  const pkg = selectedPackage.value
  if (!pkg || pkg.bonus === 0) return 0
  return Math.floor(pkg.credits * pkg.bonus / 100)
}

// 获取最终弹珠数
const getFinalCredits = () => {
  return getBaseCredits() + getBonusCredits()
}

// 是否可以继续
const canProceed = computed(() => {
  if (processing.value) return false
  if (!paymentMethod.value) return false

  if (useCustomAmount.value) {
    return customAmount.value > 0 && customAmount.value <= 10000
  }

  return selectedPackage.value !== null
})

// 处理充值
const handleRecharge = async () => {
  const amount = getFinalAmount()
  const credits = getFinalCredits()

  if (amount <= 0) {
    ElMessage.warning('请选择充值金额')
    return
  }

  processing.value = true

  try {
    const token = localStorage.getItem('token')

    // 创建充值订单
    const response = await axios.post(
      '/api/credits/recharge/create',
      {
        amount: amount,
        payment_method: paymentMethod.value
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      const order = response.data.data

      ElMessage.info('正在跳转到支付页面...')

      // TODO: 根据支付方式跳转到对应的支付页面
      // 这里需要集成实际的支付SDK

      // 模拟支付流程（开发测试用）
      setTimeout(() => {
        ElMessage.success(`充值订单已创建！订单号：${order.order_no}`)
        ElMessage.info('支付接口开发中，请联系管理员手动添加积分')

        emit('success')
        handleClose()
      }, 1500)
    }
  } catch (error) {
    console.error('创建充值订单失败:', error)
    ElMessage.error(error.response?.data?.error || '创建订单失败，请稍后重试')
  } finally {
    processing.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  selectedPackage.value = null
  useCustomAmount.value = false
  customAmount.value = 10
  paymentMethod.value = 'alipay'
  processing.value = false
  dialogVisible.value = false
}
</script>

<style scoped>
.recharge-dialog {
  --recharge-primary: #F9E6A6;
  --recharge-primary-dark: #E6A700;
  --recharge-success: #67C23A;
}

/* 当前余额 */
.current-balance {
  background: linear-gradient(135deg, #F9E6A6 0%, #FFF5CC 100%);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  margin-bottom: 24px;
}

.balance-label {
  font-size: 13px;
  color: #8B7A3E;
  margin-bottom: 8px;
}

.balance-amount {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 32px;
  font-weight: 700;
  color: #E6A700;
  margin-bottom: 4px;
}

.balance-icon {
  font-size: 28px;
}

.balance-number {
  font-family: 'Arial', sans-serif;
}

.balance-unit {
  font-size: 16px;
  color: #8B7A3E;
  font-weight: 500;
}

.balance-usd {
  font-size: 14px;
  color: #8B7A3E;
}

/* 章节标题 */
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

/* 充值套餐 */
.recharge-packages {
  margin-bottom: 24px;
}

.packages-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.package-card {
  position: relative;
  padding: 20px 16px;
  border: 2px solid #E5E7EB;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fff;
}

.package-card:hover {
  border-color: #F9E6A6;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(230, 167, 0, 0.15);
}

.package-card.active {
  border-color: #E6A700;
  background: linear-gradient(135deg, #FFFEF5 0%, #FFF5CC 100%);
  box-shadow: 0 4px 16px rgba(230, 167, 0, 0.25);
}

.package-card.popular {
  border-color: #F9E6A6;
}

.popular-badge {
  position: absolute;
  top: -10px;
  right: 12px;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8787 100%);
  color: white;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 600;
}

.bonus-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--recharge-success);
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
}

.package-amount {
  font-size: 28px;
  font-weight: 700;
  color: #E6A700;
  margin-bottom: 8px;
}

.package-credits {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.credits-icon {
  font-size: 18px;
  color: #E6A700;
}

.package-bonus {
  font-size: 12px;
  color: var(--recharge-success);
  font-weight: 600;
  margin-bottom: 8px;
}

.package-desc {
  font-size: 13px;
  color: #666;
}

/* 自定义金额 */
.custom-amount {
  margin-bottom: 24px;
  padding: 16px;
  background: #F9FAFB;
  border-radius: 8px;
}

.custom-input-container {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.custom-input {
  flex: 1;
}

.custom-credits {
  font-size: 14px;
  color: #E6A700;
  font-weight: 600;
  white-space: nowrap;
}

/* 支付方式 */
.payment-methods {
  margin-bottom: 24px;
}

.payment-options {
  display: flex;
  gap: 12px;
  width: 100%;
}

.payment-option {
  flex: 1;
  margin: 0 !important;
}

:deep(.payment-option .el-radio__label) {
  width: 100%;
  padding: 0;
}

.payment-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border: 2px solid #E5E7EB;
  border-radius: 8px;
  transition: all 0.3s ease;
}

:deep(.el-radio__input.is-checked + .el-radio__label .payment-content) {
  border-color: #E6A700;
  background: #FFFEF5;
}

.payment-icon-large {
  font-size: 32px;
  color: #E6A700;
}

.payment-content span {
  font-size: 13px;
  color: #333;
}

/* 支付摘要 */
.payment-summary {
  background: linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
  color: #333;
}

.summary-row.bonus {
  color: var(--recharge-success);
  font-weight: 600;
}

.summary-value {
  font-weight: 600;
  font-size: 16px;
}

.summary-value.highlight {
  color: #E6A700;
  font-size: 18px;
}

/* 温馨提示 */
.notice {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #FEF3C7;
  border-radius: 8px;
  border-left: 4px solid #F59E0B;
  margin-bottom: 20px;
}

.notice .el-icon {
  color: #F59E0B;
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.notice-content {
  flex: 1;
}

.notice-content p {
  margin: 4px 0;
  font-size: 13px;
  color: #92400E;
  line-height: 1.6;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-button--primary) {
  background: linear-gradient(135deg, #E6A700 0%, #F9E6A6 100%);
  border-color: #E6A700;
  color: #5A4A00;
  font-weight: 600;
}

:deep(.el-button--primary:hover) {
  background: linear-gradient(135deg, #CC9300 0%, #E6A700 100%);
}

:deep(.el-button--primary .el-icon) {
  margin-right: 4px;
}

/* 响应式 */
@media (max-width: 600px) {
  .packages-grid {
    grid-template-columns: 1fr;
  }

  .payment-options {
    flex-direction: column;
  }
}
</style>
