# 标签识别优化 - 实施计划

## [ ] Task 1: 优化 buildClassificationPrompt 提示词逻辑
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 参考 c-c 分支的优秀提示词实现
  - 优化提示词，更好地支持图文和视频内容分类
  - 在提示词中明确提到 mediaType/content type
  - 同时保持当前的标签规则优化（单核心标签）
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `human-judgement` TR-1.1: 检查提示词中是否明确区分了内容类型
  - `human-judgement` TR-1.2: 检查提示词是否提到了视频内容的处理方式
- **Notes**: 整合 c-c 分支的优点，保持我们已经优化的标签规则

## [ ] Task 2: 确保 ai-tags.js 与 c-c 分支的核心逻辑对齐
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 对比两个分支的 ai-tags.js（或 c-c 分支的 popup.js 中的相关代码）
  - 确保我们的 ai-tags.js 包含了 c-c 分支所有优秀的功能
  - 保持我们当前的优化（单核心标签、游戏标签、数量限制）
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-2.1: 验证标签生成函数返回的标签数量最多为5个
  - `human-judgement` TR-2.2: 验证游戏类内容能被正确识别
- **Notes**: 取两者之长，整合为最佳方案

## [ ] Task 3: 验证视频和图文内容的兼容性
- **Priority**: P1
- **Depends On**: Task 2
- **Description**: 
  - 确保系统能够同时处理小红书和抖音的图文/视频内容
  - 检查 item 对象的 mediaType/type 字段在提示词中的使用
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-3.1: 验证提示词中正确使用了内容类型信息
- **Notes**: 确认 content/router.js 中的数据结构与 ai-tags.js 兼容

## [ ] Task 4: 测试与验证
- **Priority**: P1
- **Depends On**: Task 3
- **Description**: 
  - 手动测试标签生成功能
  - 验证不同类型内容的标签质量
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: 测试图文内容的标签生成
  - `human-judgement` TR-4.2: 测试视频内容的标签生成
  - `human-judgement` TR-4.3: 测试游戏类内容的标签生成
