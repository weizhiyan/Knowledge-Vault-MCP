# Obsidian-MCP

当前版本：`0.2.0`

Obsidian-MCP 是一个面向工作知识库的本地 MCP 服务。它把 Markdown 文件夹当作长期知识库管理，帮助 AI agent 稳定地创建、读取、分类、编辑和维护知识文档；如果同一个文件夹被 Obsidian 打开，它也可以自然获得双链和图谱能力。

这个项目的定位不是替代 Obsidian，也不是做某个 AI 软件的专属 UI。它负责提供一套通用的知识库能力协议：Markdown 文件怎么组织、AI 怎么定位上下文、内容怎么安全写入、附件怎么嵌入、未来 UI 怎么接入选区编辑。

## 解决什么

| 问题 | 解决方式 |
| --- | --- |
| AI 写知识库容易散、乱、层次不齐 | 内置分类、项目三件套、写入策略和结构化模板 |
| 用户和 AI 看同一份资料时容易互相干扰 | 主文档给人和 AI 共用，复杂过程才拆 AI 附录 |
| 项目资料越积越多，AI 读取上下文太重 | 项目默认读取 `AI索引.md`，需要时再追溯项目介绍和原始资料 |
| 没有 Obsidian 时知识库无法工作 | 普通 Markdown 文件夹也能完整运行 |
| 有 Obsidian 时希望能看双链和图谱 | 使用标准 Markdown 与 Obsidian 双链，文件夹可直接作为 Vault 打开 |
| 图片、截图、PDF 不好管理 | 统一复制到项目 `attachments/`，并继续嵌入 Markdown |
| 未来想做一个 MD 编辑 UI | 提供文档浏览、引用状态、选区编辑、diff 预览、确认写回接口 |

## 架构

```text
Codex / Claude Code / 其他 Agent
        |
        | MCP tools
        v
Obsidian-MCP
        |
        | Markdown read/write/edit protocol
        v
工作知识库文件夹
        |
        | optional
        v
Obsidian Vault / 图谱 / 双链

未来可选：
本地 Web UI / 桌面 UI
        |
        | documents + readDocumentForUi + prepareEdit + previewEdit + applyEdit
        v
Obsidian-MCP
```

### 分层说明

| 层级 | 职责 | 当前状态 |
| --- | --- | --- |
| MCP 服务层 | 文件读写、分类、搜索、编辑协议、附件管理 | 已实现 |
| Markdown 知识库层 | 文件夹结构、frontmatter、双链、项目三件套 | 已实现 |
| Obsidian 查看层 | 双链、图谱、阅读体验 | 使用 Obsidian 自身能力 |
| Agent 适配层 | Codex、Claude Code 等调用 MCP 工具 | 已支持 |
| UI 编辑层 | 文档浏览、源码/预览 Tab、红绿 diff、高亮卡片 | 不在 MCP 内，后续可单独实现 |

## 核心原则

| 原则 | 说明 |
| --- | --- |
| 一套主知识库 | 不复制两套完整内容，用户和 AI 共享同一批 Markdown |
| 一主一辅 | 主文档放结论、结构、可读内容；只有长流程、prompt、推导才拆 AI 附录 |
| 项目优先索引 | 项目默认读取 `AI索引.md`，避免 AI 一次吃完整个项目 |
| Obsidian 可选 | 没有 Obsidian 就是普通文件夹，有 Obsidian 就能看双链和图谱 |
| UI 不写死 | MCP 只提供协议，不绑定 Codex、Claude Code 或 Obsidian 的界面 |
| 写入需确认 | 会修改文件的工具默认要求用户确认或显式参数 |
| 附件仍嵌入 MD | 图片和 PDF 统一管理，但阅读时仍出现在 Markdown 文档里 |
| 旧文件兼容 | 新项目使用 `AI索引.md`，旧 `_AI索引.md` 仍可读取 |

## 用法

```bash
npm install
npm run build
npm start
```

默认读取当前目录。也可以指定：

| 环境变量 | 说明 |
| --- | --- |
| `OBSIDIAN_VAULT_PATH` | 知识库根目录 |
| `WORK_VAULT_PATH` | 知识库根目录备用变量 |

## 目录规则

| 目录 | 用途 |
| --- | --- |
| `00-收件箱` | 低置信度、待整理内容 |
| `01-项目` | 工作 / 产品知识 |
| `02-设计` | 设计策略、规范、案例、方法 |
| `03-AI分享` | AI 经验、工作流、提示词、复盘 |
| `04-技能教程` | skill、教程、操作手册 |
| `05-文章` | 文章草稿、观点、发布素材 |
| `06-参考资料` | 外部资料、报告、技术文档 |
| `08-日志` | 周报、月报、工作摘要 |

项目知识默认用三件套：

| 文件 | 面向对象 | 用途 |
| --- | --- | --- |
| `XXXX项目介绍.md` | 用户 + AI | 用户可读的项目主体文档，正式介绍、图片、项目说明优先放这里 |
| `AI索引.md` | AI 优先 | 高信号项目卡片，放背景、定位、功能、用户、关键词和资料入口 |
| `原始资料.md` | 用户 + AI | 用户原始输入、资料摘录、截图、PDF 和来源备份 |

非项目内容默认单文档保存，不额外拆 `AI索引` 或 `原始资料`。

## 附件规则

项目附件统一放在：

```text
01-项目/项目名/attachments/
```

图片、截图和 PDF 仍然嵌入到 Markdown 中查看。默认写入 `项目介绍.md` 的“附件”章节；原始截图、资料 PDF 或来源备份可写入 `原始资料.md`。`AI索引.md` 默认只保留摘要和链接，不直接塞大图。

示例：

```markdown
![[attachments/homepage.png]]
```

## 内置 Skills

| Skill ID | 名称 | 触发场景 | 做什么 | 防出错规则 |
| --- | --- | --- | --- | --- |
| `kb.createProject` | 创建工作/产品项目知识库 | 新建项目、创建产品知识库 | 创建项目介绍、AI索引、原始资料三件套 | 不覆盖已有文件，创建前确认名称和类型 |
| `kb.classifyEntry` | 知识条目分类归档 | 记录、保存到知识库、整理内容 | 判断内容属于项目、设计、AI分享、教程、文章或参考资料 | 低置信度进收件箱，写入前返回选择 |
| `kb.writeStructured` | 结构化写入 | 补充内容、更新条目 | 按目标文件模板组织标题、摘要、正文、来源、链接 | 优先更新 H2 章节，保留原结构 |
| `kb.loadContext` | 加载项目/主题背景 | 关于某项目、读取背景 | 项目优先加载 `AI索引.md`，非项目只读指定文档 | 不一次读取整个 vault，长文档先列目录 |
| `kb.archiveInbox` | 收件箱整理 | 整理收件箱、归档 | 逐条分类后移动或追加到目标文件 | 逐条确认，允许跳过，不自动删除未确认内容 |
| `kb.healthCheck` | 知识库健康检查 | 检查知识库、发现问题 | 检查缺失索引、过期文件、frontmatter、收件箱和连接器状态 | 只报告问题，修复需单独确认 |

## 主要工具

### 知识库浏览与读取

| 工具 | 用途 |
| --- | --- |
| `knowledge.outline` | 返回知识库分类大纲和模板说明 |
| `knowledge.projects` | 列出 `01-项目` 下的项目 |
| `knowledge.documents` | 返回分类卡片和 Markdown 文档摘要，供 UI 或 agent 浏览 |
| `knowledge.loadProject` | 读取项目 `AI索引.md` 作为高信号上下文 |
| `knowledge.search` | 搜索文件名、标题、标签、frontmatter 和内容，默认只搜项目 |
| `knowledge.get` | 读取一个 Markdown 文件 |
| `knowledge.getSection` | 按 H2 标题读取一个章节 |
| `knowledge.sections` | 列出一个文件的 H2 目录和短摘录 |
| `knowledge.readDocumentForUi` | 为未来 UI 返回源码、简化源码、附件、标题、引用状态 |

### 知识库写入与维护

| 工具 | 用途 |
| --- | --- |
| `knowledge.createProject` | 创建项目三件套 |
| `knowledge.createIteration` | 创建项目迭代记录 |
| `knowledge.planNoteWrite` | 写入前判断 direct / ask_user / split_write |
| `knowledge.classifyEntry` | 给知识条目分类并推荐目标路径 |
| `knowledge.store` | 创建或追加知识条目 |
| `knowledge.update` | 追加或替换一个 Markdown 文件 |
| `knowledge.updateSection` | 替换、追加或前置写入某个 H2 章节 |
| `knowledge.writeSplitNote` | 写“一主一辅”，自动建立双链 |
| `knowledge.attachAsset` | 复制图片/PDF到项目 `attachments/` 并插入 Markdown 嵌入链接 |
| `knowledge.inbox` | 列出收件箱待整理内容 |
| `knowledge.archiveInbox` | 把收件箱内容归档到目标文件 |
| `knowledge.healthCheck` | 检查知识库结构和更新状态 |
| `knowledge.repairHealthIssue` | 修复单个健康检查问题 |

### AI 选区编辑协议

| 工具 | 用途 | 是否写文件 |
| --- | --- | --- |
| `knowledge.prepareEdit` | 把选中文案或行号范围解析成 AI 编辑上下文卡片 | 否 |
| `knowledge.previewEdit` | 预览替换结果，返回临时红绿 diff 数据 | 否 |
| `knowledge.applyEdit` | 用户确认后写回 Markdown | 是 |

### Obsidian 与 AgentShell

| 工具 | 用途 |
| --- | --- |
| `knowledge.detectObsidianVault` | 检测当前文件夹是否是 Obsidian Vault |
| `knowledge.recommendObsidianConnector` | 推荐使用现成 Obsidian MCP/REST 连接器 |
| `knowledge.checkObsidianConnector` | 检测 Obsidian 连接器版本漂移和兼容性 |
| `knowledge.setObsidianConnectorSnapshot` | 保存连接器版本快照 |
| `agentshell.injectConfig` | 向 `CLAUDE.md` / `AGENTS.md` 注入 AgentShell Profile |

## 编辑协议

MCP 不实现专属面板，只提供编辑协议。未来 UI 可以按下面流程接入：

```text
knowledge.documents
  -> 展示分类卡片和文档列表

knowledge.readDocumentForUi
  -> 打开文档
  -> 显示源码 / 预览
  -> 显示“当前引用文档”
  -> 解析 Markdown 图片和附件

用户在源码模式选中一段文字
  -> knowledge.prepareEdit
  -> 生成 AI 编辑上下文卡片

AI 生成替换内容
  -> knowledge.previewEdit
  -> 返回 removed / added / context diff blocks

用户确认
  -> knowledge.applyEdit(confirm=true)
  -> 写回 Markdown
```

### UI 可用接口

| UI 功能 | MCP 接口 | 返回/要求 |
| --- | --- | --- |
| 分类首页卡片 | `knowledge.documents` | `areas[].name/root/documentCount` |
| 文档列表 | `knowledge.documents` | `documents[].path/title/tags/headings/excerpt/updatedAt` |
| 打开文档 | `knowledge.readDocumentForUi` | `content`、`displaySource`、`headings`、`assets` |
| 当前引用状态 | `knowledge.readDocumentForUi` | `documentReference.active/path/title` |
| 图片源码精简 | `knowledge.readDocumentForUi` | `displaySource` 中把图片变成 `[图片: xxx.png]` |
| 打开本地位置 | `knowledge.readDocumentForUi(includeAbsolutePath=true)` | `absolutePath`，由 UI 调系统能力 |
| 选中文字编辑 | `knowledge.prepareEdit(selectionText)` | `selectionText`、行号、上下文、`contentHash` |
| 行号范围编辑 | `knowledge.prepareEdit(startLine,endLine)` | 同上 |
| 重复选区定位 | `knowledge.prepareEdit(occurrence)` | `occurrenceCount` 和目标 occurrence |
| 红绿 diff 预览 | `knowledge.previewEdit` | `diff[]` 和 `unifiedDiff` |
| 确认写回 | `knowledge.applyEdit(confirm=true)` | 新旧 hash、diff、更新时间 |
| 防止误写 | `expectedHash` | 文档变化时阻止预览或写回 |

红删绿增的高亮是 UI 临时状态，不写入 Markdown；切换文档或发起下一次编辑时可以直接清除。

## 写入规则

| 策略 | 说明 |
| --- | --- |
| `direct_write` | 内容明确且风险低，直接写入建议目标 |
| `ask_user` | 分类或目标不确定，先让用户选位置 |
| `split_write` | 只在项目资料复杂、流程很多、prompt 很多或用户明确要求时拆“一主一辅” |

`knowledge.writeSplitNote` 会自动创建：

| 文件 | 内容 |
| --- | --- |
| 主文档 | 结论、结构、可扫描内容 |
| AI 附录 | 资料来源、推导过程、提示词、版本记录 |

两者会自动写入 `[[主文档]]` 与 `[[AI 附录]]` 双链。

## Obsidian 关系

这个 MCP 不依赖 Obsidian 才能运行：

| 情况 | 行为 |
| --- | --- |
| 没有 Obsidian | 按普通文件夹 + Markdown 工作 |
| 有 Obsidian | 同一个文件夹可作为 Vault 打开，查看双链、图谱和附件 |
| 有 Obsidian 连接器 | 可以通过现成 Obsidian MCP/REST 插件桥接，不重复造连接器 |

## 开发

```bash
npm run typecheck
npm run build
```

发布前建议至少跑：

```bash
npm run typecheck
npm run build
```
