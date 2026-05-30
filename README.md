# xhs-smart-companion

小红书智能收藏夹助手 - 升级版

## 新增功能

1. **科技感暗色玻璃拟态 UI** - 现代简约的高级设计风格
2. **侧边栏知识库** - 作为长期打开的收藏管理界面
3. **AI 宠物陪伴** - 右下角悬浮宠物，具有三种状态
4. **智能提示** - 在收藏页面自动提示整理功能
5. **陪伴模式设置** - 安静模式、陪伴模式、活跃模式

## 技术特性

- Manifest V3
- 原生 HTML/CSS/JavaScript
- 最小权限原则
- 模块化文件结构

## 文件结构

```
xhs-smart-companion/
├── manifest.json           # 扩展配置
├── popup/                 # 弹出窗口
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/             # 侧边栏
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── content/               # 内容脚本
│   ├── content.js
│   └── content.css
├── shared/                # 共享模块
│   ├── constants.js
│   ├── utils.js
│   └── background.js
└── assets/                # 资源文件
    ├── glass.css
    └── icons/
```

## 本地测试步骤

### 1. 准备图标文件

替换 `assets/icons/` 目录下的图标文件：
- icon16.png (16x16 像素)
- icon48.png (48x48 像素)
- icon128.png (128x128 像素)

### 2. 加载扩展到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `xhs-smart-companion` 目录

### 3. 功能测试

#### Popup 弹出窗口
1. 点击工具栏中的插件图标
2. 测试提取收藏、生成标签、导出功能
3. 测试陪伴模式切换

#### 侧边栏知识库
1. 点击插件图标中的「知识库」按钮
2. 或右键点击插件图标，选择「打开侧边栏」
3. 查看全部收藏、按标签浏览、统计数据

#### AI 宠物
1. 打开小红书网站
2. 右下角会出现悬浮宠物
3. 在收藏页面会自动提示
4. 点击宠物会有随机响应

### 4. 权限说明

- `activeTab` - 临时访问当前标签页
- `storage` - 本地存储数据
- `sidePanel` - 侧边栏功能
- `host_permissions` - 仅小红书网站

## 陪伴模式说明

- **安静模式**: 宠物不显示，不提示
- **陪伴模式**: 宠物正常显示，定期提示
- **活跃模式**: 宠物活跃显示，频繁提示

## 宠物状态

- **Idle**: 待机状态，漂浮动画
- **Thinking**: 思考状态，弹跳动画
- **Happy**: 开心状态，庆祝动画

## 开发说明

### 模块说明

- `popup/` - 快速操作弹窗
- `sidepanel/` - 知识库管理界面
- `content/` - 页面注入脚本和宠物
- `shared/` - 共享常量和工具函数

### 修改宠物行为

编辑 `content/content.js` 中的：
- `PET_RESPONSES` - 宠物回复文案
- `PET_SUGGESTIONS` - 提示文案
- `PET_MODES` - 陪伴模式

### 修改标签规则

编辑 `shared/constants.js` 中的 `TAG_RULES`

## 注意事项

1. 只处理当前页面已加载内容
2. 需要登录小红书账号
3. 不下载视频或图片
4. 数据存储在浏览器本地

## 版本历史

- v2.0.0 - 新增侧边栏、AI宠物、陪伴模式
- v1.0.0 - 基础收藏提取功能
