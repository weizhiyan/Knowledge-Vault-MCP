# Obsidian-MCP

一个面向“工作知识库”的 MCP 服务：既能把 Markdown 文件夹当作普通知识库来用，也能在检测到 Obsidian Vault 时自动进入图谱/双链模式。

它的定位不是重做 Obsidian，也不是做一个独立 UI，而是把“知识组织、分类、写入、检查、补全、注入 AgentShell 配置”这些事，整理成一套稳定的 MCP 工具和内置 skill。

## 这套东西解决什么

- 给 AI 和你自己共用同一套知识库
- 用中文目录管理工作产品、设计、AI 分享、Skill/教程、文章、参考资料
- 低置信度内容先进入收件箱，再由 agent 询问你放哪
- 如果装了 Obsidian，就直接获得图谱、双链、笔记联动
- 如果没装 Obsidian，也照样只是一个普通 Markdown 知识库，不会卡死

## 核心原则

- 一个知识库，优先一个 canonical note
- 人看和 AI 看可以共存
- 混合内容时，优先“主笔记 + AI 附录”，不是复制两套完整内容
- 不强依赖界面，`user_choice` 只是交互契约，弹窗由承载 MCP 的宿主软件决定
- Obsidian 只做可选的 vault 层，不重新实现它的核心能力

## 架构

```mermaid
flowchart LR
  A[Agent / MCP Host] --> B[Obsidian-MCP]
  B --> C[Markdown 知识库]
  C --> D{检测到 .obsidian?}
  D -- 否 --> E[文件夹模式]
  D -- 是 --> F[Obsidian Vault 模式]
  F --> G[图谱 / 双链 / 插件生态]
  B --> H[AgentShell 注入]
```

## 快速开始

```bash
npm install
npm run build
npm start
```

默认会把当前目录当成知识库根目录。也可以显式指定：

- `OBSIDIAN_VAULT_PATH`
- `WORK_VAULT_PATH`

比如：

```bash
set OBSIDIAN_VAULT_PATH=D:\KnowledgeVault
npm start
```

## 知识库结构

推荐的顶层目录：

- `00-Inbox`：低置信度、待整理内容
- `01-Projects`：工作 / 产品知识
- `02-Design`：设计知识
- `03-AI-Share`：AI 分享
- `04-Skills-Tutorials`：Skill / 教程
- `05-Articles`：文章与草稿
- `06-Reference`：参考资料
- `07-Templates`：模板
- `08-Journal`：迭代记录与周报/月报

项目类知识通常会拆成这些常见主题：

- `项目概览`
- `产品背景`
- `产品功能`
- `产品优势`
- `产品定位`
- `用户画像`
- `设计规范`
- `设计策略`
- `竞品分析`
- `迭代记录`

## Obsidian 模式怎么工作

`knowledge.detectObsidianVault` 会检查当前根目录是否包含 `.obsidian`，并读取 `plugins` 里的插件清单。

检测到 Vault 以后：

- 同一批 Markdown 文件可以直接在 Obsidian 中打开
- 双链和图谱会自动生效
- 这个 MCP 只负责知识组织和写入，不替代 Obsidian 的编辑器本体

没有检测到 Vault 也没关系：

- 仍然按普通文件夹方式工作
- 知识分类、搜索、写入、模板生成都能用
- 以后再把这个文件夹用 Obsidian 打开即可

## Obsidian 插件更新检测

如果你已经装了某个 Obsidian connector / community plugin，可以用：

- `knowledge.checkObsidianConnector`
- `knowledge.setObsidianConnectorSnapshot`

它会做这些事：

- 读取插件 `manifest.json`
- 记录版本快照
- 检查和上次快照是否变化
- 对比 `minAppVersion` 和当前 Obsidian 版本
- 如果你提供了 `latestVersionUrl`，还可以顺手看远端是否有新版本

这不是“官方 Obsidian MCP”的重写，而是对现成 connector 的版本和兼容性检查。

## 内置 skill

这里的 skill 是给 agent 用的工作流，不是 UI 功能。

一共 6 个，分别负责“建库、分流、写入、读取、归档、体检”：

- `kb.createProject`
  - 作用：创建一个完整的项目知识库骨架
  - 包含：项目概览、产品背景、产品功能、产品优势、产品定位、用户画像、设计规范、设计策略、竞品分析、迭代记录
  - 适合：新项目刚开始、需要快速搭建标准目录时

- `kb.classifyEntry`
  - 作用：判断一段内容应该放到哪里
  - 输出：分类结果、置信度、理由、建议目标路径、`user_choice`
  - 适合：agent 录入新内容、但还不确定放哪的时候

- `kb.writeStructured`
  - 作用：把内容按模板结构写入，并尽量保持层次统一
  - 重点：保留 canonical note，避免输出层次乱掉
  - 适合：产品说明、设计策略、AI 总结、教程文章等需要稳定结构的内容

- `kb.loadContext`
  - 作用：加载项目或主题的高信号背景
  - 重点：先看概览，再按需读取关键章节，避免一次性拉满整个库
  - 适合：AI 回答“这个项目是干嘛的”“这个主题当前有什么背景”这类问题

- `kb.archiveInbox`
  - 作用：把 `00-Inbox` 里的临时内容归档到正式知识页
  - 支持：追加、移动、复制
  - 适合：先粗收集，再统一整理的工作流

- `kb.healthCheck`
  - 作用：检查知识库是否健康
  - 会查：缺失概览、过期文件、收件箱堆积、frontmatter 是否完整、connector 是否漂移
  - 适合：定期维护知识库，或者在内容堆积后做一次整理

这 6 个 skill 不是让你手工点按钮，而是给 agent 一套稳定的“先做什么、后做什么”的工作习惯。

## 主要 MCP 工具

### 1. 识别与规划

- `knowledge.skills`：查看内置 skill 列表
- `knowledge.outline`：查看推荐的知识库分区和模板
- `knowledge.detectObsidianVault`：识别是否为 Obsidian Vault
- `knowledge.recommendNoteStrategy`：判断适合共享笔记、拆分笔记还是先粗抓
- `knowledge.planNoteWrite`：在写入前输出完整方案

### 2. 分类与写入

- `knowledge.classifyEntry`：把内容路由到中文目录
- `knowledge.suggestTarget`：返回给宿主软件的 `user_choice`
- `knowledge.store`：创建或追加到一个知识文件
- `knowledge.update`：追加或替换文件内容
- `knowledge.updateSection`：更新某个 H2 小节

### 3. 项目知识

- `knowledge.projects`：列出项目
- `knowledge.loadProject`：读取项目概览
- `knowledge.createProject`：创建项目知识库骨架
- `knowledge.createIteration`：创建迭代记录
- `knowledge.compareProjects`：项目横向对比
- `knowledge.analyzeProject`：项目诊断

### 4. 读取与检索

- `knowledge.search`：全文检索
- `knowledge.get`：读取单个文件
- `knowledge.sections`：列出 H2 目录
- `knowledge.getSection`：读取指定 H2

### 5. 收件箱与健康检查

- `knowledge.inbox`：查看收件箱待处理项
- `knowledge.archiveInbox`：归档收件箱内容
- `knowledge.healthCheck`：做知识库体检
- `knowledge.repairHealthIssue`：修复可安全修复的问题

### 6. AgentShell

- `agentshell.injectConfig`：把 AgentShell 配置写入 `CLAUDE.md` / `AGENTS.md`

## `planNoteWrite` 怎么理解

这个工具会把三件事一起算出来：

1. 当前是否是 Obsidian Vault
2. 内容应该归到哪一类
3. 该直接写、先问你，还是拆成主笔记 + AI 附录

常见结果：

- `direct_write`：可以直接落盘
- `ask_user`：需要你确认放哪
- `split_write`：建议拆分成一份主笔记和一份 AI 侧说明

## 拆分策略

默认不是做两套完整知识库。

推荐做法是：

1. 一份主笔记，给人和知识图谱用
2. 必要时加一个 AI 附录，放 prompt、结构化总结、写作提示
3. 两者用链接互相指向，避免重复维护

## AgentShell 交互层

这里不内置弹窗 UI。

`user_choice` 只是一个交互输出格式，含义是：

- 如果宿主软件支持弹窗，就弹窗让用户选
- 如果宿主软件没有弹窗能力，就退回到聊天询问
- 这个 MCP 不强行造界面，也不依赖某个特定前端

## 开发

```bash
npm run typecheck
npm run build
```

## 备注

- 默认知识分类是中文命名
- 低置信度内容优先进入 `00-Inbox`
- 适合工作产品、设计知识、AI 分享、教程、文章、参考资料等场景
- 这套库既给 AI 看，也给你自己看
