# 标签识别优化 - 产品需求文档

## Overview
- **Summary**: 优化标签识别系统，参考 c-c 分支的优秀实现，支持视频和图文两种内容载体的标签生成，改进提示词逻辑。
- **Purpose**: 提高标签识别的准确性，支持不同类型内容（图文、视频）的分类，提供更优质的用户体验。
- **Target Users**: Memora 浏览器插件的用户，用于管理小红书和抖音收藏内容。

## Goals
- 参考并整合 c-c 分支的优秀标签识别逻辑
- 优化 AI 分类提示词，更好地支持图文和视频内容
- 保持当前优化后的标签规则（单核心标签）
- 确保标签系统同时兼容小红书和抖音平台

## Non-Goals (Out of Scope)
- 不改变插件的核心功能架构
- 不添加额外的 API 依赖

## Background & Context
- 当前 Desktop_pet 分支已优化标签规则（单核心标签），但提示词逻辑相对简单
- c-c 分支有更好的 AI 提示词实现，但标签规则较旧（多标签）
- 需要结合两者的优势，提供一个更好的标签识别系统

## Functional Requirements
- **FR-1**: 整合 c-c 分支的优秀提示词逻辑
- **FR-2**: 确保标签系统兼容图文和视频两种载体
- **FR-3**: 在提示词中明确区分 mediaType/content type
- **FR-4**: 添加游戏类标签（已在之前的优化中实现）
- **FR-5**: 保持标签数量限制（最多5个）

## Non-Functional Requirements
- **NFR-1**: 标签生成响应时间小于 15 秒
- **NFR-2**: 标签准确率提高 30%（主观评估）

## Constraints
- **Technical**: 必须使用当前已有的 qwen-plus 模型和阿里云 DashScope API
- **Dependencies**: 依赖共享的 qwen-config.js 配置

## Assumptions
- 用户的 API key 已在 qwen-config.js 中正确配置
- 图文和视频内容都有可用的标题、封面等信息用于分类

## Acceptance Criteria

### AC-1: 提示词优化
- **Given**: 用户收藏了一个内容
- **When**: 系统生成标签时
- **Then**: 使用优化后的提示词，明确区分内容类型（图文/视频）
- **Verification**: `human-judgment`
- **Notes**: 提示词需要明确提到 mediaType/content type

### AC-2: 视频内容兼容
- **Given**: 用户收藏了一个视频内容
- **When**: 系统生成标签时
- **Then**: 能够根据视频标题和封面正确分类
- **Verification**: `human-judgment`

### AC-3: 标签数量控制
- **Given**: 系统生成标签
- **When**: 标签生成完成
- **Then**: 标签数量最多为5个
- **Verification**: `programmatic`

### AC-4: 游戏类内容识别
- **Given**: 用户收藏了游戏相关内容（如无限暖暖）
- **When**: 系统生成标签时
- **Then**: 能够正确识别为「游戏」标签
- **Verification**: `human-judgment`

## Open Questions
- [ ] 是否需要恢复 c-c 分支中的 applyClassificationTags 批量标签生成功能？
