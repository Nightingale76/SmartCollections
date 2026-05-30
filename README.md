# xhs-smart-companion

多平台智能收藏夹助手 - 支持小红书和抖音，含桌面宠物

## 功能

- 提取小红书/抖音当前页面已加载内容
- AI 宠物陪伴，提示整理收藏
- 侧边栏知识库，管理收藏
- 本地关键词生成标签
- Markdown 导出
- 支持平台筛选

## 本地开发

1. 打开 `chrome://extensions/`
2. 启用开发者模式
3. 点击「加载已解压的扩展程序」
4. 选择本目录

## 文件结构

```
├── manifest.json          # 扩展配置
├── popup/                 # 弹窗界面
├── sidepanel/             # 侧边栏
├── content/               # 内容脚本
├── platforms/             # 平台适配器
├── shared/                # 共享模块
└── assets/                # 资源文件
```
