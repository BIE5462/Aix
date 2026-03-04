import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'

// 导入主题样式
import './styles/variables-neon.css'
import './styles/global-neon.css'
// import './styles/theme.css' // 旧变量保留但停用
// import './styles/element-theme.css' // 旧主题停用
import './styles/element-neon-override.css' // 新的深度定制

const app = createApp(App)

app.use(ElementPlus)

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')

