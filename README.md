# Obsidian-MCP

一个给工作知识库用的 MCP 服务。它把 Markdown 文件夹当知识库来管，检测到 Obsidian Vault 时就自动进入双链/图谱模式。

## 用法

```bash
npm install
npm run build
npm start
```

默认读取当前目录。也可以指定：

- `OBSIDIAN_VAULT_PATH`
- `WORK_VAULT_PATH`

## 目录规则

- `00-收件箱`：低置信度、待整理内容
- `01-项目`：工作 / 产品知识
- `02-设计`
- `03-AI分享`
- `04-技能教程`
- `05-文章`
- `06-参考资料`
- `08-日志`

项目知识默认用三件套：

- `XXXX项目介绍.md`
- `AI索引.md`
- `原始资料.md`

非项目内容默认单文档保存，不额外拆 `AI索引` 或 `原始资料`。

项目附件统一放在：

- `01-项目/项目名/attachments/`

图片、截图和 PDF 仍然嵌入到 Markdown 中查看。默认写入 `项目介绍.md` 的“附件”章节；原始截图、资料 PDF 或来源备份可写入 `原始资料.md`。`AI索引.md` 默认只保留摘要和链接，不直接塞大图。

## 关键能力

- `knowledge.detectObsidianVault`：检测是否是 Obsidian Vault
- `knowledge.planNoteWrite`：判断 direct / ask_user / split_write
- `knowledge.writeSplitNote`：写“一主一辅”，自动双链
- `knowledge.attachAsset`：复制图片/PDF到项目 `attachments/`，并插入 `![[attachments/文件名]]`
- `knowledge.search`：默认只搜 `01-项目`
- `knowledge.loadProject`：读取项目 `AI索引.md`
- `knowledge.createProject`：创建项目三件套
- `knowledge.inbox` / `knowledge.archiveInbox`：收件箱整理
- `knowledge.healthCheck`：知识库体检
- `agentshell.injectConfig`：注入 `CLAUDE.md` / `AGENTS.md`

## 写入规则

- `direct_write`：直接写
- `ask_user`：先问用户放哪
- `split_write`：项目资料或用户明确要求时才拆分

`knowledge.writeSplitNote` 会自动创建：

- 主文档
- AI 附录
- `[[主文档]]` 与 `[[AI 附录]]` 的双链

## 交互层

`user_choice` 不是固定 UI。宿主软件有弹窗就弹窗，没有就退回聊天询问。

## 开发

```bash
npm run typecheck
npm run build
```
