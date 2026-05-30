# 标签识别优化 - 验证检查清单

- [x] 提示词中明确提到了 mediaType/content type，区分图文和视频内容
- [x] 提示词包含了 c-c 分支中的优秀逻辑（如视频内容的处理建议）
- [x] 标签生成函数限制标签数量最多为5个
- [x] 游戏类标签已添加到 TAG_RULES 中
- [x] 关键词匹配支持词边界检测
- [x] ai-tags.js 中整合了 c-c 分支的核心逻辑（同时保持当前优化）
- [x] 提示词中优先使用的稳定分类包含了「游戏」
- [x] 系统能够兼容小红书和抖音两个平台的内容
- [x] getLocalTagsForItem 函数正确使用了 item 的各个字段（title, author, excerpt/text, url）
- [x] buildClassificationPrompt 函数正确处理了 item.type / item.mediaType
