import { promises as fs } from "node:fs";
import path from "node:path";
import { ProjectSummary, SearchResult, UserChoicePayload } from "./types.js";

const MARKDOWN_EXTENSION = ".md";
const PROJECT_AI_INDEX_FILE = "AI索引.md";
const LEGACY_PROJECT_AI_INDEX_FILE = "_AI索引.md";
const LEGACY_PROJECT_OVERVIEW_FILE = "_项目概览.md";
const CORE_PROJECT_FILES = [PROJECT_AI_INDEX_FILE, LEGACY_PROJECT_AI_INDEX_FILE, "项目介绍.md", "原始资料.md"];
const EMBEDDABLE_ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".pdf"]);
const KNOWLEDGE_AREAS = [
  {
    id: "work_product",
    name: "工作/产品业务",
    root: "01-项目",
    description: "产品背景、功能、优势、定位、目标用户、业务逻辑、迭代记录。",
  },
  {
    id: "design",
    name: "设计知识",
    root: "02-设计",
    description: "设计策略、设计规范、组件规范、案例收集、工具方法。",
  },
  {
    id: "ai_share",
    name: "AI 分享",
    root: "03-AI分享",
    description: "AI 经验、工作流分享、提示词方法、案例复盘；默认单文档保存。",
  },
  {
    id: "skills_tutorials",
    name: "Skill/教程",
    root: "04-技能教程",
    description: "自己收集或编写的 skill、教程、操作手册、使用指南；默认单文档保存。",
  },
  {
    id: "articles",
    name: "文章写作",
    root: "05-文章",
    description: "自己写的文章、草稿、观点、发布素材。",
  },
  {
    id: "reference",
    name: "参考收集",
    root: "06-参考资料",
    description: "外部资料、行业报告、设计趋势、技术文档、灵感摘录。",
  },
] as const;

const BUILT_IN_SKILLS = [
  {
    id: "kb.createProject",
    name: "创建工作/产品项目知识库",
    category: "create",
    triggers: ["新建项目", "创建产品知识库", "新项目"],
    description: "按项目介绍、AI索引、原始资料三层结构创建项目知识库，避免生成空散点文件。",
    safeguards: ["创建前确认项目名称和类型", "不覆盖已有文件", "所有文件带 frontmatter"],
  },
  {
    id: "kb.classifyEntry",
    name: "知识条目分类归档",
    category: "write",
    triggers: ["记录", "保存到知识库", "整理这段内容"],
    description: "判断内容属于工作产品、设计、AI 分享、Skill/教程、文章或参考收集，并给出结构化写入位置。",
    safeguards: ["低置信度放入收件箱", "写入前返回 user_choice", "标注分类原因"],
  },
  {
    id: "kb.writeStructured",
    name: "结构化写入",
    category: "write",
    triggers: ["补充内容", "写入知识库", "更新条目"],
    description: "按目标文件模板组织标题、摘要、正文、来源、关联链接和最后更新时间，避免输出层次不齐。",
    safeguards: ["优先更新指定 H2 章节", "保留原文件结构", "自动维护最后更新"],
  },
  {
    id: "kb.loadContext",
    name: "加载项目/主题背景",
    category: "read",
    triggers: ["关于某项目", "帮我做某产品", "读取背景"],
    description: "项目先加载 AI索引；非项目主题只有用户点名时读取对应单文档，控制上下文体积。",
    safeguards: ["不一次读取整个 vault", "长文档先列目录", "引用来源文件"],
  },
  {
    id: "kb.archiveInbox",
    name: "收件箱整理",
    category: "organize",
    triggers: ["整理收件箱", "归档", "清理待整理"],
    description: "逐条查看 00-收件箱 内容，分类后移动或追加到目标知识文件。",
    safeguards: ["逐条确认", "允许跳过", "不自动删除未确认内容"],
  },
  {
    id: "kb.healthCheck",
    name: "知识库健康检查",
    category: "maintain",
    triggers: ["检查知识库", "知识库有什么问题"],
    description: "检查缺失概览、frontmatter、过期文件、收件箱堆积和连接器版本漂移。",
    safeguards: ["只报告问题", "修复需单独确认", "connector 检测可选"],
  },
] as const;

export interface VaultHealthIssue {
  type: "missing_overview" | "stale_file" | "incomplete_frontmatter" | "inbox_item";
  path: string;
  message: string;
}

export interface VaultHealthReport {
  projectsWithoutOverview: string[];
  staleFiles: string[];
  inboxItems: string[];
  incompleteFrontmatter: string[];
  issues: VaultHealthIssue[];
  nextAction: UserChoicePayload;
  connector?: ConnectorStatusReport;
}

export interface CreateProjectInput {
  name: string;
  type?: string;
  status?: string;
}

export interface CreateIterationInput {
  projectName: string;
  topic: string;
  summary?: string;
  date?: string;
}

export interface StoreKnowledgeInput {
  targetPath: string;
  content: string;
  title?: string;
  append?: boolean;
}

export interface SuggestKnowledgeTargetInput {
  content?: string;
  projectName?: string;
}

export interface ClassifyKnowledgeInput {
  content: string;
  projectName?: string;
  title?: string;
}

export interface UpdateKnowledgeInput {
  targetPath: string;
  content: string;
  mode?: "append" | "replace";
  sectionTitle?: string;
}

export interface UpdateSectionInput {
  targetPath: string;
  heading: string;
  content: string;
  mode?: "replace" | "append" | "prepend";
  createIfMissing?: boolean;
}

export interface ArchiveInboxInput {
  inboxPath: string;
  targetPath: string;
  mode?: "append" | "move" | "copy";
  title?: string;
}

export interface InboxEntry {
  path: string;
  title: string;
  excerpt: string;
  updatedAt: string;
}

export interface CompareProjectsInput {
  projectNames: string[];
  dimension?: "users" | "positioning" | "features" | "full";
}

export interface AnalyzeProjectInput {
  projectName: string;
  angle?: "positioning" | "users" | "competitors" | "risks" | "full";
}

export interface WeeklyBriefInput {
  period?: "week" | "month";
  projectName?: string;
  save?: boolean;
}

export interface RepairHealthIssueInput {
  type: VaultHealthIssue["type"];
  path: string;
}

export interface NoteStrategyInput {
  title?: string;
  content?: string;
  category?: string;
}

export interface NoteStrategyReport {
  mode: "shared_note" | "split_notes" | "raw_capture";
  reason: string;
  suggestedSections: string[];
  canonicalPath?: string;
  draftPath?: string;
  aiReadable: boolean;
  humanReadable: boolean;
}

export interface NotePlanInput {
  title?: string;
  content?: string;
  category?: string;
  projectName?: string;
}

export interface NotePlanReport {
  vault: ObsidianVaultStatus;
  strategy: NoteStrategyReport;
  classification: {
    category: KnowledgeCategory;
    confidence: number;
    reason: string;
    targetPath: string;
  };
  action: "direct_write" | "ask_user" | "split_write";
  graphFriendly: boolean;
  recommendations: string[];
}

export interface SplitNoteWriteInput {
  title: string;
  mainContent: string;
  appendixContent?: string;
  category?: string;
  projectName?: string;
  targetPath?: string;
  appendixPath?: string;
  appendixKind?: string;
  mode?: "append" | "replace";
}

export interface SplitNoteWriteReport {
  strategy: "one_main_one_appendix";
  classification: {
    category: KnowledgeCategory;
    confidence: number;
    reason: string;
  };
  main: {
    path: string;
    mode: "created" | "appended" | "replaced";
    link: string;
  };
  appendix: {
    path: string;
    mode: "created" | "appended" | "replaced";
    link: string;
  };
  graphLinks: string[];
  recommendations: string[];
}

export interface AttachAssetInput {
  projectName: string;
  sourcePath: string;
  targetDocument?: "project_intro" | "raw_material" | "none";
  caption?: string;
  assetName?: string;
  embed?: boolean;
}

export interface AttachAssetReport {
  project: ProjectSummary;
  assetPath: string;
  targetPath?: string;
  markdown: string;
  mode: "copied";
  recommendations: string[];
}

export interface ConnectorStatusInput {
  manifestPath?: string;
  connectorId?: string;
  connectorRoot?: string;
  snapshotPath?: string;
  obsidianAppVersion?: string;
  latestVersionUrl?: string;
  persistSnapshot?: boolean;
}

export interface ObsidianVaultStatus {
  vaultRoot: string;
  isObsidianVault: boolean;
  obsidianConfigPath: string;
  pluginsPath: string;
  installedPlugins: ObsidianPluginSummary[];
  mode: "folder_only" | "obsidian_vault";
  recommendations: string[];
}

interface ObsidianPluginSummary {
  id: string;
  name?: string;
  version?: string;
  minAppVersion?: string;
}

export interface ConnectorStatusReport {
  configured: boolean;
  status: "not_configured" | "healthy" | "updated" | "update_available" | "incompatible" | "invalid_manifest";
  manifestPath?: string;
  snapshotPath?: string;
  manifest?: {
    id?: string;
    name?: string;
    version?: string;
    minAppVersion?: string;
    description?: string;
    author?: string;
    isDesktopOnly?: boolean;
  };
  previousSnapshot?: ConnectorSnapshot;
  latestRelease?: ConnectorReleaseInfo;
  changedSinceLastCheck?: boolean;
  compatibleWithObsidian?: boolean;
  compatibleFallbackVersion?: string;
  issues: string[];
  recommendations: string[];
}

interface ConnectorSnapshot {
  checkedAt: string;
  manifestPath: string;
  manifestHash: string;
  manifestVersion?: string;
  minAppVersion?: string;
}

interface ConnectorReleaseInfo {
  version: string;
  source: string;
  url?: string;
  publishedAt?: string;
}

type KnowledgeCategory = "product_background" | "product_feature" | "product_advantage" | "product_positioning" | "user_insight" | "business" | "design_strategy" | "design_resource" | "ai_share" | "skill_tutorial" | "article" | "competitor" | "iteration" | "reference" | "inbox";

const KNOWLEDGE_CATEGORY_VALUES: readonly KnowledgeCategory[] = [
  "product_background",
  "product_feature",
  "product_advantage",
  "product_positioning",
  "user_insight",
  "business",
  "design_strategy",
  "design_resource",
  "ai_share",
  "skill_tutorial",
  "article",
  "competitor",
  "iteration",
  "reference",
  "inbox",
];

export class VaultService {
  constructor(private readonly vaultRoot: string) {}

  get root(): string {
    return this.vaultRoot;
  }

  async ensureBaseStructure(): Promise<string[]> {
    await fs.mkdir(this.resolveSafe("."), { recursive: true });
    return [];
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const projectsRoot = this.resolveSafe("01-项目");
    const entries = await this.readDirectoryIfExists(projectsRoot);
    const directories = entries.filter((entry) => entry.isDirectory());

    return Promise.all(
      directories.map(async (entry) => {
        const projectPath = `01-项目/${entry.name}`;
        const overviewPath = await this.findProjectOverviewPath(projectPath);
        const stat = overviewPath ? await this.statIfExists(this.resolveSafe(overviewPath)) : undefined;
        const overview = overviewPath && stat ? await fs.readFile(this.resolveSafe(overviewPath), "utf-8") : undefined;
        const frontmatter = overview ? parseFrontmatter(overview) : {};

        return {
          name: entry.name,
          path: projectPath,
          overviewPath,
          status: frontmatter["项目状态"],
          updatedAt: frontmatter["最后更新"] ?? (stat ? formatDate(stat.mtime) : undefined),
        };
      }),
    );
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const projectName = sanitizePathSegment(input.name);
    const projectPath = `01-项目/${projectName}`;
    const projectRoot = this.resolveSafe(projectPath);
    const today = formatDate(new Date());

    await fs.mkdir(projectRoot, { recursive: true });
    await this.writeIfMissing(`${projectPath}/${projectName}项目介绍.md`, renderProjectIntro({
      name: projectName,
      type: input.type ?? "工作项目",
      status: input.status ?? "进行中",
      date: today,
    }));
    await this.writeIfMissing(projectAiIndexPath(projectPath), renderProjectAiIndex({
      name: projectName,
      type: input.type ?? "工作项目",
      status: input.status ?? "进行中",
      date: today,
    }));
    await this.writeIfMissing(`${projectPath}/原始资料.md`, renderRawMaterialDocument(projectName, today));

    return {
      name: projectName,
      path: projectPath,
      overviewPath: projectAiIndexPath(projectPath),
      status: input.status ?? "进行中",
      updatedAt: today,
    };
  }

  async loadProjectContext(projectName: string): Promise<{ project: ProjectSummary; content: string; relatedFiles: string[] }> {
    const project = await this.findProject(projectName);
    if (!project.overviewPath) throw new Error(`项目 ${project.name} 缺少 AI索引`);

    const relatedFiles = await this.listProjectMarkdownFiles(project.name);
    return {
      project,
      content: await fs.readFile(this.resolveSafe(project.overviewPath), "utf-8"),
      relatedFiles: relatedFiles.filter((filePath) => filePath !== project.overviewPath),
    };
  }

  async createIteration(input: CreateIterationInput): Promise<{ path: string; content: string }> {
    const project = await this.findProject(input.projectName);
    const date = input.date ?? formatMonth(new Date());
    const topic = sanitizePathSegment(input.topic);
    const filePath = `${project.path}/迭代记录/${date}-${topic}.md`;
    const today = formatDate(new Date());
    const content = renderIteration({ date, topic, projectName: project.name, summary: input.summary, today });

    await this.writeIfMissing(filePath, content);
    return { path: filePath, content };
  }

  async listBuiltInSkills(): Promise<{ areas: typeof KNOWLEDGE_AREAS; skills: typeof BUILT_IN_SKILLS; usage: string[] }> {
    return {
      areas: KNOWLEDGE_AREAS,
      skills: BUILT_IN_SKILLS,
      usage: [
        "Agent 接入后应先读取 skill 列表，按触发条件选择工作流。",
        "写入知识库前优先调用 classifyEntry 或 suggestTarget，低置信度放入 00-收件箱。",
        "长文档读取先 sections 再 getSection，避免一次读完整库。",
      ],
    };
  }

  async knowledgeOutline(): Promise<{ areas: typeof KNOWLEDGE_AREAS; templates: Array<{ name: string; purpose: string }> }> {
    return {
      areas: KNOWLEDGE_AREAS,
      templates: [
        { name: "项目介绍", purpose: "用户可读的项目主体文档，图片和正式介绍优先放这里" },
        { name: "AI索引", purpose: "AI 默认读取的高信号项目卡片，控制篇幅，链接到主体文档和原始资料" },
        { name: "原始资料", purpose: "备份用户原始输入、文件摘录和图片，便于追溯来源" },
        { name: "设计策略", purpose: "设计目标、原则、策略和评估方式；有设计资料时才创建" },
        { name: "AI分享", purpose: "AI 工作流、提示词、案例复盘；默认单文档，不创建 AI索引 或 原始资料" },
        { name: "Skill教程", purpose: "skill、教程、操作步骤；默认单文档，不创建 AI索引 或 原始资料" },
        { name: "文章", purpose: "文章草稿、观点和发布素材；默认单文档，不创建 AI索引 或 原始资料" },
      ],
    };
  }

  async detectObsidianVault(): Promise<ObsidianVaultStatus> {
    const obsidianConfigPath = ".obsidian";
    const pluginsPath = ".obsidian/plugins";
    const configStat = await this.statIfExists(this.resolveSafe(obsidianConfigPath));
    const pluginEntries = await this.readDirectoryIfExists(this.resolveSafe(pluginsPath));
    const pluginDirectories = pluginEntries.filter((entry) => entry.isDirectory());
    const pluginSummaries = await Promise.all(pluginDirectories.map(async (entry): Promise<ObsidianPluginSummary | undefined> => {
      const manifest = await this.readJsonIfExists(`${pluginsPath}/${entry.name}/manifest.json`);
      if (!manifest) return undefined;
      const summary: ObsidianPluginSummary = {
        id: typeof manifest.id === "string" ? manifest.id : entry.name,
      };
      if (typeof manifest.name === "string") summary.name = manifest.name;
      if (typeof manifest.version === "string") summary.version = manifest.version;
      if (typeof manifest.minAppVersion === "string") summary.minAppVersion = manifest.minAppVersion;
      return summary;
    }));
    const installedPlugins = pluginSummaries.filter((plugin): plugin is ObsidianPluginSummary => plugin !== undefined);
    const isObsidianVault = Boolean(configStat?.isDirectory());

    return {
      vaultRoot: this.vaultRoot,
      isObsidianVault,
      obsidianConfigPath,
      pluginsPath,
      installedPlugins,
      mode: isObsidianVault ? "obsidian_vault" : "folder_only",
      recommendations: isObsidianVault
        ? ["已检测到 Obsidian 配置目录；本 MCP 写入的 Markdown 可直接在 Obsidian 中查看双链和图谱。"]
        : ["未检测到 .obsidian 目录；当前按普通文件夹知识库工作。你可以之后用 Obsidian 打开这个文件夹，它会成为 Vault。"],
    };
  }

  async recommendNoteStrategy(input: NoteStrategyInput): Promise<NoteStrategyReport> {
    const text = `${input.title ?? ""}\n${input.content ?? ""}`.trim();
    const category = parseKnowledgeCategory(input.category);
    const hasProcessWords = /(步骤|流程|方法|复盘|prompt|提示词|工作流|规则|模板|checklist|技能|教程)/i.test(text);
    const hasUserFacingWords = /(用户|产品|功能|优势|定位|画像|设计|策略|规范|案例|文章|分享)/i.test(text);
    const hasMixedSignals = hasProcessWords && hasUserFacingWords;

    if (category && isSingleDocumentCategory(category)) {
      return {
        mode: "shared_note",
        reason: "这类内容属于非项目资料，默认按单文档保存，不额外生成 AI索引、原始资料或 AI 附录。",
        suggestedSections: ["摘要", "正文", "链接/素材"],
        canonicalPath: inferCanonicalPath(category, text),
        aiReadable: false,
        humanReadable: true,
      };
    }

    if (hasMixedSignals) {
      return {
        mode: "split_notes",
        reason: "这条项目相关内容同时包含面向用户阅读的知识和面向 AI 复用的方法/流程，可在用户确认后拆成主文档 + 辅助说明。",
        suggestedSections: ["核心结论/正文", "AI 使用说明", "来源与链接"],
        canonicalPath: inferCanonicalPath(input.category, text),
        draftPath: inferDraftPath(input.category, text),
        aiReadable: true,
        humanReadable: true,
      };
    }

    if (hasProcessWords) {
      return {
        mode: "raw_capture",
        reason: "更像方法、流程或教程，适合先作为可复用知识/Skill 记录。",
        suggestedSections: ["用途", "步骤", "注意事项", "示例"],
        canonicalPath: inferDraftPath(input.category, text),
        aiReadable: true,
        humanReadable: true,
      };
    }

    return {
      mode: "shared_note",
      reason: "更像可同时给人和 AI 阅读的标准知识条目，建议写成结构化主文档。",
      suggestedSections: ["摘要", "要点", "细节", "关联项"],
      canonicalPath: inferCanonicalPath(input.category, text),
      aiReadable: true,
      humanReadable: true,
    };
  }

  async planNoteWrite(input: NotePlanInput): Promise<NotePlanReport> {
    const vault = await this.detectObsidianVault();
    const classification = classifyKnowledgeContent(`${input.title ?? ""}\n${input.content ?? ""}`);
    const strategy = await this.recommendNoteStrategy({
      title: input.title,
      content: input.content,
      category: input.category ?? classification.category,
    });
    const graphFriendly = vault.isObsidianVault;
    const recommendations = [
      ...vault.recommendations,
      strategy.reason,
      classification.reason,
      graphFriendly
        ? "可直接写入文件并用 Obsidian 双链/图谱查看。"
        : "当前按普通文件夹写入；之后用 Obsidian 打开同一文件夹即可看到图谱。",
    ];

    return {
      vault,
      strategy,
      classification: {
        category: classification.category,
        confidence: classification.confidence,
        reason: classification.reason,
        targetPath: input.projectName
          ? await this.targetPathForProjectCategory(input.projectName, classification.category)
          : targetPathForGlobalCategory(classification.category),
      },
      action: strategy.mode === "split_notes" ? "split_write" : strategy.mode === "raw_capture" ? "ask_user" : "direct_write",
      graphFriendly,
      recommendations,
    };
  }

  async storeKnowledge(input: StoreKnowledgeInput): Promise<{ path: string; mode: "created" | "appended" | "replaced" }> {
    const targetPath = normalizeMarkdownPath(input.targetPath);
    const absolutePath = this.resolveSafe(targetPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    const existing = await this.statIfExists(absolutePath);
    const timestamp = formatDate(new Date());
    const entry = renderKnowledgeEntry(input.content, timestamp, input.title);

    if (existing && input.append !== false) {
      await fs.appendFile(absolutePath, entry, "utf-8");
      await this.touchFrontmatterDate(targetPath, timestamp);
      return { path: targetPath, mode: "appended" };
    }

    const content = input.title
      ? `---\ntags: [知识条目]\n创建时间: ${timestamp}\n最后更新: ${timestamp}\n---\n\n# ${input.title}\n\n${input.content.trim()}\n`
      : input.content.trim() + "\n";
    await fs.writeFile(absolutePath, content, "utf-8");
    return { path: targetPath, mode: existing ? "replaced" : "created" };
  }

  async writeSplitNote(input: SplitNoteWriteInput): Promise<SplitNoteWriteReport> {
    const title = sanitizePathSegment(input.title);
    const combinedContent = `${input.title}\n${input.mainContent}\n${input.appendixContent ?? ""}`;
    const detectedClassification = classifyKnowledgeContent(combinedContent);
    const categoryOverride = parseKnowledgeCategory(input.category);
    const classification = categoryOverride
      ? {
        category: categoryOverride,
        confidence: Math.max(detectedClassification.confidence, 0.9),
        reason: `使用调用方提供的分类：${categoryOverride}；自动检测结果为 ${detectedClassification.category}。`,
      }
      : detectedClassification;
    const targetPath = input.targetPath
      ? normalizeMarkdownPath(input.targetPath)
      : input.projectName
        ? await this.targetPathForProjectCategory(input.projectName, classification.category)
        : this.defaultSplitNotePath(classification.category, title);
    const appendixPath = input.appendixPath
      ? normalizeMarkdownPath(input.appendixPath)
      : buildAppendixPath(targetPath, input.appendixKind);
    const today = formatDate(new Date());
    const mainLink = wikilinkForPath(targetPath);
    const appendixLink = wikilinkForPath(appendixPath);
    const mode = input.mode ?? "append";

    const mainWrite = await this.writeLinkedNote({
      path: targetPath,
      title: path.basename(targetPath, MARKDOWN_EXTENSION),
      body: renderSplitMainBody({
        content: input.mainContent,
        appendixLink,
        date: today,
      }),
      tags: [...tagsForPath(targetPath), "主文档"],
      mode,
      date: today,
    });
    const appendixWrite = await this.writeLinkedNote({
      path: appendixPath,
      title: path.basename(appendixPath, MARKDOWN_EXTENSION),
      body: renderSplitAppendixBody({
        content: input.appendixContent ?? input.mainContent,
        mainLink,
        date: today,
        appendixKind: input.appendixKind,
      }),
      tags: [...tagsForPath(appendixPath), "AI附录"],
      mode,
      date: today,
    });

    return {
      strategy: "one_main_one_appendix",
      classification: {
        category: classification.category,
        confidence: classification.confidence,
        reason: classification.reason,
      },
      main: {
        path: targetPath,
        mode: mainWrite.mode,
        link: mainLink,
      },
      appendix: {
        path: appendixPath,
        mode: appendixWrite.mode,
        link: appendixLink,
      },
      graphLinks: [appendixLink, mainLink],
      recommendations: [
        "已按一套主知识库 + AI 附录写入，不会生成两套完整知识库。非项目资料默认不建议使用本工具，除非用户明确要求拆分。",
        `主文档包含 ${appendixLink}，AI 附录包含 ${mainLink}，Obsidian 会形成双链图谱。`,
        "后续面向用户阅读时优先维护主文档；prompt、推导、流程、版本记录放入 AI 附录。",
      ],
    };
  }

  async attachAsset(input: AttachAssetInput): Promise<AttachAssetReport> {
    const project = await this.findProject(input.projectName);
    const sourcePath = path.resolve(input.sourcePath);
    const sourceStat = await this.statIfExists(sourcePath);
    if (!sourceStat?.isFile()) throw new Error(`找不到附件文件：${input.sourcePath}`);

    const fileName = await this.nextAvailableAssetName(project.path, buildAssetFileName(input.assetName, sourcePath));
    const assetPath = `${project.path}/attachments/${fileName}`;
    const assetAbsolutePath = this.resolveSafe(assetPath);
    await fs.mkdir(path.dirname(assetAbsolutePath), { recursive: true });
    await fs.copyFile(sourcePath, assetAbsolutePath);

    const markdown = renderAssetMarkdown(`attachments/${fileName}`, {
      embed: input.embed ?? true,
      caption: input.caption,
    });
    const targetDocument = input.targetDocument ?? "project_intro";
    const today = formatDate(new Date());
    let targetPath: string | undefined;

    if (targetDocument !== "none") {
      targetPath = this.targetPathForProjectAsset(project, targetDocument);
      await this.ensureProjectAssetTarget(project, targetDocument, today);
      await this.appendProjectAssetEntry(targetPath, renderAssetSectionEntry(markdown, input.caption, today), today);
    }

    return {
      project,
      assetPath,
      targetPath,
      markdown,
      mode: "copied",
      recommendations: [
        `附件已复制到 ${project.path}/attachments/，Markdown 中继续以内嵌方式查看。`,
        targetPath
          ? `已写入 ${targetPath} 的“附件”章节；Obsidian 会直接预览 ${path.extname(fileName).toLowerCase() === ".pdf" ? "PDF" : "图片或文件"}。`
          : "未写入正文；可以把返回的 markdown 手动放到任意笔记中。",
        "AI索引.md 默认保持高信号摘要，不建议直接塞图片，除非用户明确要求。",
      ],
    };
  }

  async suggestKnowledgeTarget(input: SuggestKnowledgeTargetInput): Promise<UserChoicePayload> {
    const projects = await this.listProjects();
    const projectOptions = projects.slice(0, 8).map((project) => ({
      label: project.name,
      value: project.overviewPath ?? projectAiIndexPath(project.path),
      description: `项目知识库${project.updatedAt ? `，最后更新 ${project.updatedAt}` : ""}`,
    }));

    if (input.projectName) {
      const project = await this.findProject(input.projectName);
      return {
        type: "user_choice",
        question: "这条内容属于哪个文件？",
        style: "single_select",
        options: [
          { label: `${project.name} — 项目介绍`, value: `${project.path}/${project.name}项目介绍.md`, description: "给用户看的主体文档，图片和正式介绍放这里" },
          { label: `${project.name} — AI索引`, value: project.overviewPath ?? projectAiIndexPath(project.path), description: "给 AI 默认读取的高信号摘要和资料入口" },
          { label: `${project.name} — 原始资料`, value: `${project.path}/原始资料.md`, description: "用户原文、截图、图片和来源备份" },
          { label: "放入收件箱", value: "00-收件箱/待整理.md", description: "先收集，后续再整理" },
        ],
      };
    }

    return {
      type: "user_choice",
      question: "这条内容属于哪个项目或分类？",
      style: "single_select",
      options: [
        ...projectOptions,
        { label: "设计知识", value: "02-设计/案例收集/待整理.md", description: "设计原则、案例、组件规范" },
        { label: "AI 分享", value: "03-AI分享/待整理.md", description: "AI 工作流、提示词、案例复盘；默认单文档" },
        { label: "Skill/教程", value: "04-技能教程/待整理.md", description: "skill、教程、工具手册；默认单文档" },
        { label: "文章写作", value: "05-文章/待整理.md", description: "文章草稿、观点、发布素材；默认单文档" },
        { label: "参考资料", value: "06-参考资料/技术文档/待整理.md", description: "行业报告、技术文档、外部资料" },
        { label: "放入收件箱", value: "00-收件箱/待整理.md", description: "先收集，后续再整理" },
      ].slice(0, 10),
    };
  }

  async classifyEntry(input: ClassifyKnowledgeInput): Promise<{ category: KnowledgeCategory; confidence: number; reason: string; targetPath: string; choice: UserChoicePayload }> {
    const classification = classifyKnowledgeContent(`${input.title ?? ""}\n${input.content}`);
    const targetPath = input.projectName
      ? await this.targetPathForProjectCategory(input.projectName, classification.category)
      : targetPathForGlobalCategory(classification.category);

    const fallbackChoice = await this.suggestKnowledgeTarget({ projectName: input.projectName, content: input.content });
    return {
      category: classification.category,
      confidence: classification.confidence,
      reason: classification.reason,
      targetPath,
      choice: {
        ...fallbackChoice,
        question: `建议保存到「${targetPath}」。如果不对，请重新选择位置。`,
        options: [
          { label: "使用建议位置", value: targetPath, description: classification.reason },
          ...fallbackChoice.options.filter((option) => option.value !== targetPath).slice(0, 8),
        ],
      },
    };
  }

  async updateKnowledge(input: UpdateKnowledgeInput): Promise<{ path: string; mode: "append" | "replace"; updatedAt: string }> {
    const targetPath = normalizeMarkdownPath(input.targetPath);
    const absolutePath = this.resolveSafe(targetPath);
    const today = formatDate(new Date());
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    if (input.mode === "replace") {
      const title = input.sectionTitle ?? path.basename(targetPath, MARKDOWN_EXTENSION);
      await fs.writeFile(absolutePath, renderBasicDocument(title, ["知识条目"], today) + input.content.trim() + "\n", "utf-8");
      return { path: targetPath, mode: "replace", updatedAt: today };
    }

    await fs.appendFile(absolutePath, renderKnowledgeEntry(input.content, today, input.sectionTitle), "utf-8");
    await this.touchFrontmatterDate(targetPath, today);
    return { path: targetPath, mode: "append", updatedAt: today };
  }

  async updateSection(input: UpdateSectionInput): Promise<{ path: string; heading: string; mode: "replace" | "append" | "prepend" | "created"; updatedAt: string }> {
    const targetPath = normalizeMarkdownPath(input.targetPath);
    const absolutePath = this.resolveSafe(targetPath);
    const content = await fs.readFile(absolutePath, "utf-8");
    const today = formatDate(new Date());
    const updated = updateMarkdownSection(content, {
      heading: input.heading,
      content: input.content,
      mode: input.mode ?? "replace",
      createIfMissing: input.createIfMissing ?? false,
    });

    await fs.writeFile(absolutePath, updateFrontmatterField(updated.content, "最后更新", today), "utf-8");
    return { path: targetPath, heading: updated.heading, mode: updated.created ? "created" : (input.mode ?? "replace"), updatedAt: today };
  }

  async archiveInbox(input: ArchiveInboxInput): Promise<{ source: string; target: string; mode: "append" | "move" | "copy" }> {
    const sourcePath = normalizeMarkdownPath(input.inboxPath);
    const targetPath = normalizeMarkdownPath(input.targetPath);
    const sourceAbsolutePath = this.resolveSafe(sourcePath);
    const content = await fs.readFile(sourceAbsolutePath, "utf-8");

    if (input.mode === "move") {
      const targetAbsolutePath = this.resolveSafe(targetPath);
      await fs.mkdir(path.dirname(targetAbsolutePath), { recursive: true });
      await fs.rename(sourceAbsolutePath, targetAbsolutePath);
      return { source: sourcePath, target: targetPath, mode: "move" };
    }

    await this.storeKnowledge({ targetPath, content, title: input.title ?? extractTitle(content), append: true });
    if (input.mode !== "copy") await fs.unlink(sourceAbsolutePath);
    return { source: sourcePath, target: targetPath, mode: input.mode ?? "append" };
  }

  async compareProjects(input: CompareProjectsInput): Promise<{ dimension: string; projects: Array<{ project: ProjectSummary; content: string }>; report: string }> {
    if (input.projectNames.length < 2) throw new Error("至少需要两个项目用于对比");
    const projects = await Promise.all(input.projectNames.map((projectName) => this.loadProjectContext(projectName)));
    const dimension = input.dimension ?? "full";
    const report = renderComparisonReport(dimension, projects.map(({ project, content }) => ({ project, sections: extractSections(content) })));
    return { dimension, projects: projects.map(({ project, content }) => ({ project, content })), report };
  }

  async analyzeProject(input: AnalyzeProjectInput): Promise<{ project: ProjectSummary; files: string[]; report: string; saveChoice: UserChoicePayload }> {
    const project = await this.findProject(input.projectName);
    const files = await this.readProjectCoreFiles(project.name, [PROJECT_AI_INDEX_FILE, `${project.name}项目介绍.md`, "原始资料.md"]);
    const angle = input.angle ?? "full";
    const report = renderProjectAnalysis(project, files, angle);

    return {
      project,
      files: files.map((file) => file.path),
      report,
      saveChoice: {
        type: "user_choice",
        question: "要把这份分析报告保存到知识库吗？",
        style: "single_select",
        options: [
          { label: "保存到迭代记录", value: `${project.path}/迭代记录/${formatMonth(new Date())}-项目诊断.md`, description: "作为一次分析/诊断记录保存" },
          { label: "保存为独立文件", value: `${project.path}/项目诊断.md`, description: "覆盖或追加到项目诊断文件" },
          { label: "不保存", value: "__skip__", description: "只在本次对话中使用" },
        ],
      },
    };
  }

  async userAnalysis(projectName: string): Promise<{ project: ProjectSummary; sourcePath: string; content: string; choice: UserChoicePayload }> {
    const project = await this.findProject(projectName);
    const sourcePath = project.overviewPath ?? projectAiIndexPath(project.path);
    const content = await this.readFile(sourcePath);
    return {
      project,
      sourcePath,
      content,
      choice: {
        type: "user_choice",
        question: "你想分析什么？",
        style: "single_select",
        options: [
          { label: "功能接受度", value: "feature_acceptance", description: "目标用户对某功能的接受程度" },
          { label: "使用路径", value: "user_journey", description: "用户完成目标的路径和阻力" },
          { label: "痛点识别", value: "pain_points", description: "从画像中提炼核心痛点" },
          { label: "用户分层", value: "segmentation", description: "核心/普通/边缘用户分层" },
        ],
      },
    };
  }

  async designReviewContext(projectName: string): Promise<{ project: ProjectSummary; files: Array<{ path: string; content: string }>; choice: UserChoicePayload }> {
    const project = await this.findProject(projectName);
    const files = await this.readProjectCoreFiles(project.name, [PROJECT_AI_INDEX_FILE, `${project.name}项目介绍.md`]);
    return {
      project,
      files,
      choice: {
        type: "user_choice",
        question: "从哪些维度评审？",
        style: "multi_select",
        options: [
          { label: "用户习惯", value: "user_habits", description: "是否符合目标用户使用习惯" },
          { label: "产品定位", value: "positioning", description: "是否与产品定位一致" },
          { label: "交互逻辑", value: "interaction", description: "流程、反馈、状态是否清晰" },
          { label: "规范一致", value: "visual_consistency", description: "是否符合现有设计规范" },
        ],
      },
    };
  }

  async competitorAnalysis(projectName: string): Promise<{ project: ProjectSummary; sourcePath: string; content: string; isStale: boolean; choice: UserChoicePayload }> {
    const project = await this.findProject(projectName);
    const sourcePath = project.overviewPath ?? projectAiIndexPath(project.path);
    const content = await this.readFile(sourcePath);
    const updatedAt = parseFrontmatter(content)["最后更新"];
    const isStale = updatedAt ? Date.now() - new Date(updatedAt).getTime() > 90 * 24 * 60 * 60 * 1000 : true;
    return {
      project,
      sourcePath,
      content,
      isStale,
      choice: {
        type: "user_choice",
        question: "你想对比哪个维度？",
        style: "single_select",
        options: [
          { label: "功能完整度", value: "features", description: "功能覆盖和缺口" },
          { label: "用户体验", value: "ux", description: "流程、易用性、转化" },
          { label: "产品定位", value: "positioning", description: "目标用户和市场定位" },
          { label: "差异化机会", value: "opportunity", description: "找到可突破的机会点" },
        ],
      },
    };
  }

  async weeklyBrief(input: WeeklyBriefInput = {}): Promise<{ period: string; sourceFiles: string[]; content: string; savedPath?: string }> {
    const period = input.period ?? "week";
    const files = input.projectName
      ? await this.listProjectMarkdownFiles((await this.findProject(input.projectName)).name)
      : await this.listMarkdownFiles("01-项目");
    const iterationFiles = files.filter((filePath) => filePath.includes("/迭代记录/"));
    const selected = await this.filterFilesByPeriod(iterationFiles, period);
    const snippets = await Promise.all(selected.map(async (filePath) => ({ path: filePath, content: await fs.readFile(this.resolveSafe(filePath), "utf-8") })));
    const content = renderBrief(period, snippets);

    if (!input.save) return { period, sourceFiles: selected, content };

    const savedPath = `08-日志/${formatDate(new Date())}-${period === "week" ? "周报" : "月报"}.md`;
    await this.storeKnowledge({ targetPath: savedPath, content, append: false, title: period === "week" ? "工作周报" : "工作月报" });
    return { period, sourceFiles: selected, content, savedPath };
  }

  async search(query: string, limit = 5, scope: "projects" | "all" = "projects"): Promise<SearchResult[]> {
    const keywords = tokenize(query);
    if (!keywords.length) return [];

    const files = await this.listMarkdownFiles(scope === "projects" ? "01-项目" : "");
    const results: SearchResult[] = [];

    for (const filePath of files) {
      const content = await fs.readFile(this.resolveSafe(filePath), "utf-8");
      const title = extractTitle(content) ?? path.basename(filePath, MARKDOWN_EXTENSION);
      const frontmatter = parseFrontmatter(content);
      const haystack = `${filePath}\n${title}\n${frontmatter.tags ?? ""}\n${content}`.toLowerCase();
      const score = keywords.reduce((sum, keyword) => sum + countOccurrences(haystack, keyword), 0);
      if (score === 0) continue;

      results.push({
        path: filePath,
        title,
        score,
        excerpt: buildExcerpt(content, keywords),
        updatedAt: frontmatter["最后更新"],
      });
    }

    return results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, limit);
  }

  async readFile(relativePath: string): Promise<string> {
    const targetPath = normalizeMarkdownPath(relativePath);
    return fs.readFile(this.resolveSafe(targetPath), "utf-8");
  }

  async readSection(relativePath: string, heading: string): Promise<{ path: string; heading: string; content: string; availableHeadings: string[] }> {
    const targetPath = normalizeMarkdownPath(relativePath);
    const content = await fs.readFile(this.resolveSafe(targetPath), "utf-8");
    const sections = extractMarkdownSections(content);
    const normalizedHeading = normalizeHeading(heading);
    const exact = sections.find((section) => normalizeHeading(section.heading) === normalizedHeading);
    const partial = exact ?? sections.find((section) => normalizeHeading(section.heading).includes(normalizedHeading));

    if (!partial) {
      const availableHeadings = sections.map((section) => section.heading);
      throw new Error(`未找到章节：${heading}。可用章节：${availableHeadings.join("、") || "无 H2 章节"}`);
    }

    return {
      path: targetPath,
      heading: partial.heading,
      content: partial.content,
      availableHeadings: sections.map((section) => section.heading),
    };
  }

  async listSections(relativePath: string): Promise<{ path: string; headings: Array<{ heading: string; excerpt: string }> }> {
    const targetPath = normalizeMarkdownPath(relativePath);
    const content = await fs.readFile(this.resolveSafe(targetPath), "utf-8");
    return {
      path: targetPath,
      headings: extractMarkdownSections(content).map((section) => ({
        heading: section.heading,
        excerpt: truncate(section.content.replace(/\s+/g, " ").trim(), 120),
      })),
    };
  }

  async listInbox(): Promise<{ items: InboxEntry[]; choice: UserChoicePayload }> {
    const entries = await this.readDirectoryIfExists(this.resolveSafe("00-收件箱"));
    const markdownFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION));
    const items = await Promise.all(markdownFiles.map(async (entry) => {
      const filePath = `00-收件箱/${entry.name}`;
      const absolutePath = this.resolveSafe(filePath);
      const [stat, content] = await Promise.all([fs.stat(absolutePath), fs.readFile(absolutePath, "utf-8")]);
      return {
        path: filePath,
        title: extractTitle(content) ?? path.basename(filePath, MARKDOWN_EXTENSION),
        excerpt: truncate(content.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(), 280),
        updatedAt: formatDate(stat.mtime),
      };
    }));

    return {
      items,
      choice: {
        type: "user_choice",
        question: items.length ? "你想先整理哪条收件箱内容？" : "收件箱暂无待整理内容。",
        style: "single_select",
        options: items.length
          ? [
            ...items.slice(0, 9).map((item) => ({
              label: item.title,
              value: item.path,
              description: `${item.updatedAt} · ${item.excerpt || "空文件"}`,
            })),
            { label: "稍后再说", value: "__skip__", description: "本次不整理收件箱" },
          ]
          : [{ label: "知道了", value: "__skip__", description: "无需处理" }],
      },
    };
  }

  async healthCheck(staleDays = 90): Promise<VaultHealthReport> {
    const projects = await this.listProjects();
    const files = await this.listMarkdownFiles();
    const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    const projectsWithoutOverview = projects.filter((project) => !project.overviewPath).map((project) => project.path);
    const staleFiles: string[] = [];
    const incompleteFrontmatter: string[] = [];

    for (const filePath of files) {
      const absolutePath = this.resolveSafe(filePath);
      const [stat, content] = await Promise.all([fs.stat(absolutePath), fs.readFile(absolutePath, "utf-8")]);
      if (stat.mtime.getTime() < staleCutoff) staleFiles.push(filePath);

      const frontmatter = parseFrontmatter(content);
      if (Object.keys(frontmatter).length > 0 && (!frontmatter.tags || !frontmatter["最后更新"])) incompleteFrontmatter.push(filePath);
    }

    const inboxEntries = await this.readDirectoryIfExists(this.resolveSafe("00-收件箱"));
    const inboxItems = inboxEntries.filter((entry) => entry.isFile()).map((entry) => `00-收件箱/${entry.name}`);
    const issues: VaultHealthIssue[] = [
      ...projectsWithoutOverview.map((filePath) => ({ type: "missing_overview" as const, path: filePath, message: "项目缺少 AI索引" })),
      ...staleFiles.map((filePath) => ({ type: "stale_file" as const, path: filePath, message: `文件超过 ${staleDays} 天未更新` })),
      ...incompleteFrontmatter.map((filePath) => ({ type: "incomplete_frontmatter" as const, path: filePath, message: "frontmatter 缺少 tags 或最后更新" })),
      ...inboxItems.map((filePath) => ({ type: "inbox_item" as const, path: filePath, message: "收件箱存在未整理内容" })),
    ];

    return {
      projectsWithoutOverview,
      staleFiles,
      inboxItems,
      incompleteFrontmatter,
      issues,
      nextAction: {
        type: "user_choice",
        question: "你想先处理哪类问题？",
        style: "single_select",
        options: [
          { label: "补 AI索引", value: "missing_overview", description: `缺失 ${projectsWithoutOverview.length} 个` },
          { label: "处理收件箱", value: "inbox", description: `未整理 ${inboxItems.length} 条` },
          { label: "更新过时内容", value: "stale", description: `过时 ${staleFiles.length} 个` },
          { label: "稍后再说", value: "skip", description: "本次不处理" },
        ],
      },
    };
  }

  async checkConnectorStatus(input: ConnectorStatusInput = {}): Promise<ConnectorStatusReport> {
    const manifestPath = input.manifestPath ? normalizeVaultPath(input.manifestPath) : undefined;
    const snapshotPath = input.snapshotPath ? normalizeVaultPath(input.snapshotPath) : undefined;
    const issues: string[] = [];
    const recommendations: string[] = [];
    let manifest: ConnectorStatusReport["manifest"] | undefined;
    let previousSnapshot: ConnectorSnapshot | undefined;
    let latestRelease: ConnectorReleaseInfo | undefined;

    if (!manifestPath) {
      return {
        configured: false,
        status: "not_configured",
        issues: ["未提供 connector manifestPath"],
        recommendations: ["传入 Obsidian 插件的 manifest.json 路径，或只用于本地连接器快照检查"],
      };
    }

    const manifestData = await this.readJsonIfExists(manifestPath);
    if (!manifestData) {
      return {
        configured: true,
        status: "invalid_manifest",
        manifestPath,
        issues: ["找不到 manifest.json"],
        recommendations: ["确认 Obsidian 插件目录是否正确，或检查插件是否已安装"],
      };
    }

    manifest = {
      id: typeof manifestData.id === "string" ? manifestData.id : undefined,
      name: typeof manifestData.name === "string" ? manifestData.name : undefined,
      version: typeof manifestData.version === "string" ? manifestData.version : undefined,
      minAppVersion: typeof manifestData.minAppVersion === "string" ? manifestData.minAppVersion : undefined,
      description: typeof manifestData.description === "string" ? manifestData.description : undefined,
      author: typeof manifestData.author === "string" ? manifestData.author : undefined,
      isDesktopOnly: typeof manifestData.isDesktopOnly === "boolean" ? manifestData.isDesktopOnly : undefined,
    };

    if (!manifest.id || !manifest.version) {
      issues.push("manifest 缺少 id 或 version");
    }

    const obsidianAppVersion = input.obsidianAppVersion ?? undefined;
    const compatibility = obsidianAppVersion && manifest.minAppVersion
      ? compareSemver(obsidianAppVersion, manifest.minAppVersion) >= 0
      : undefined;
    if (compatibility === false) {
      issues.push(`Obsidian ${obsidianAppVersion} 低于插件要求的 ${manifest.minAppVersion}`);
      recommendations.push(`升级 Obsidian 到至少 ${manifest.minAppVersion}`);
    }

    if (snapshotPath) {
      const snapshotData = await this.readJsonIfExists(snapshotPath);
      if (snapshotData) {
        previousSnapshot = parseConnectorSnapshot(snapshotData);
        if (previousSnapshot.manifestHash && previousSnapshot.manifestHash !== hashManifest(manifestData)) {
          issues.push("manifest 与上次快照不一致");
          recommendations.push("插件 manifest 发生变化，建议核对 MCP 路由和工具列表是否仍可用");
        }
      }
    }

    if (input.latestVersionUrl) {
      latestRelease = await this.readLatestReleaseInfo(input.latestVersionUrl);
      if (latestRelease && manifest.version && compareSemver(latestRelease.version, manifest.version) > 0) {
        recommendations.push(`检测到新版本 ${latestRelease.version}`);
      }
      if (!latestRelease) {
        recommendations.push("未能读取远端最新版本，请确认 latestVersionUrl 是否可访问");
      }
    }

    const changedSinceLastCheck = previousSnapshot ? previousSnapshot.manifestHash !== hashManifest(manifestData) : undefined;
    const updateAvailable = latestRelease && manifest.version
      ? compareSemver(latestRelease.version, manifest.version) > 0
      : false;
    const status = issues.length === 0
      ? (updateAvailable ? "update_available" : "healthy")
      : (compatibility === false ? "incompatible" : "updated");

    const report: ConnectorStatusReport = {
      configured: true,
      status,
      manifestPath,
      snapshotPath,
      manifest,
      previousSnapshot,
      latestRelease,
      changedSinceLastCheck,
      compatibleWithObsidian: compatibility,
      compatibleFallbackVersion: manifest.minAppVersion,
      issues,
      recommendations: recommendations.length ? recommendations : ["连接器状态正常，可继续使用现有配置"],
    };

    if (input.persistSnapshot && snapshotPath) {
      await this.writeConnectorSnapshot(snapshotPath, {
        checkedAt: formatDate(new Date()),
        manifestPath,
        manifestHash: hashManifest(manifestData),
        manifestVersion: manifest.version,
        minAppVersion: manifest.minAppVersion,
      });
      report.snapshotPath = snapshotPath;
    }

    return report;
  }

  async repairHealthIssue(input: RepairHealthIssueInput): Promise<{ type: VaultHealthIssue["type"]; path: string; action: string }> {
    const targetPath = normalizeMarkdownPath(input.path);
    const today = formatDate(new Date());

    if (input.type === "missing_overview") {
      const projectPath = input.path.replaceAll("\\", "/").replace(/\/+$/, "");
      const projectName = path.basename(projectPath);
      const introPath = `${projectPath}/${projectName}项目介绍.md`;
      const aiIndexPath = projectAiIndexPath(projectPath);
      const rawPath = `${projectPath}/原始资料.md`;
      await this.writeIfMissing(introPath, renderProjectIntro({ name: projectName, type: "工作项目", status: "进行中", date: today }));
      await this.writeIfMissing(aiIndexPath, renderProjectAiIndex({ name: projectName, type: "工作项目", status: "进行中", date: today }));
      await this.writeIfMissing(rawPath, renderRawMaterialDocument(projectName, today));
      return { type: input.type, path: aiIndexPath, action: "created_project_three_file_structure" };
    }

    if (input.type === "incomplete_frontmatter") {
      const absolutePath = this.resolveSafe(targetPath);
      const content = await fs.readFile(absolutePath, "utf-8");
      const repaired = ensureFrontmatter(content, {
        tags: tagsForPath(targetPath),
        "最后更新": today,
        "创建时间": today,
      });
      await fs.writeFile(absolutePath, repaired, "utf-8");
      return { type: input.type, path: targetPath, action: "repaired_frontmatter" };
    }

    if (input.type === "stale_file") {
      await this.touchFrontmatterDate(targetPath, today);
      return { type: input.type, path: targetPath, action: "touched_last_updated" };
    }

    if (input.type === "inbox_item") {
      return { type: input.type, path: targetPath, action: "no_auto_repair_use_knowledge_archiveInbox" };
    }

    throw new Error(`不支持的修复类型：${input.type}`);
  }

  async setConnectorSnapshot(input: ConnectorStatusInput): Promise<{ path: string; snapshot: ConnectorSnapshot }> {
    if (!input.manifestPath || !input.snapshotPath) throw new Error("manifestPath 和 snapshotPath 不能为空");
    const manifestPath = normalizeVaultPath(input.manifestPath);
    const snapshotPath = normalizeVaultPath(input.snapshotPath);
    const manifestData = await this.readJsonIfExists(manifestPath);
    if (!manifestData) throw new Error(`找不到 manifest 文件：${manifestPath}`);

    const snapshot: ConnectorSnapshot = {
      checkedAt: formatDate(new Date()),
      manifestPath,
      manifestHash: hashManifest(manifestData),
      manifestVersion: typeof manifestData.version === "string" ? manifestData.version : undefined,
      minAppVersion: typeof manifestData.minAppVersion === "string" ? manifestData.minAppVersion : undefined,
    };
    await this.writeConnectorSnapshot(snapshotPath, snapshot);
    return { path: snapshotPath, snapshot };
  }

  private async findProject(projectName: string): Promise<ProjectSummary> {
    const projects = await this.listProjects();
    const normalizedName = projectName.toLowerCase();
    const project = projects.find((candidate) => candidate.name.toLowerCase() === normalizedName)
      ?? projects.find((candidate) => candidate.name.toLowerCase().includes(normalizedName));

    if (!project) throw new Error(`未找到项目：${projectName}`);
    return project;
  }

  private async listProjectMarkdownFiles(projectName: string): Promise<string[]> {
    const project = await this.findProject(projectName);
    return this.listMarkdownFiles(project.path);
  }

  private async readProjectCoreFiles(projectName: string, fileNames: string[]): Promise<Array<{ path: string; content: string }>> {
    const project = await this.findProject(projectName);
    const files = await Promise.all(fileNames.map(async (fileName) => {
      const filePath = isProjectAiIndexFile(fileName)
        ? project.overviewPath ?? projectAiIndexPath(project.path)
        : `${project.path}/${fileName}`;
      const stat = await this.statIfExists(this.resolveSafe(filePath));
      if (!stat) return undefined;
      return { path: filePath, content: await fs.readFile(this.resolveSafe(filePath), "utf-8") };
    }));
    return files.filter((file): file is { path: string; content: string } => Boolean(file));
  }

  private async listMarkdownFiles(directory = ""): Promise<string[]> {
    const absoluteDirectory = this.resolveSafe(directory || ".");
    const entries = await this.readDirectoryIfExists(absoluteDirectory);
    const files = await Promise.all(entries.map(async (entry) => {
      const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return this.listMarkdownFiles(relativePath);
      return entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION) ? [relativePath.replaceAll("\\", "/")] : [];
    }));

    return files.flat();
  }

  private async filterFilesByPeriod(files: string[], period: "week" | "month"): Promise<string[]> {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - (period === "week" ? 7 : 31));
    const stats = await Promise.all(files.map(async (filePath) => ({ filePath, stat: await fs.stat(this.resolveSafe(filePath)) })));
    return stats.filter(({ stat }) => stat.mtime >= cutoff).map(({ filePath }) => filePath);
  }

  private async touchFrontmatterDate(relativePath: string, date: string): Promise<void> {
    const absolutePath = this.resolveSafe(relativePath);
    const content = await fs.readFile(absolutePath, "utf-8");
    const updated = updateFrontmatterField(content, "最后更新", date);
    await fs.writeFile(absolutePath, updated, "utf-8");
  }

  private async writeLinkedNote(input: {
    path: string;
    title: string;
    body: string;
    tags: string[];
    mode: "append" | "replace";
    date: string;
  }): Promise<{ path: string; mode: "created" | "appended" | "replaced" }> {
    const absolutePath = this.resolveSafe(input.path);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const existing = await this.statIfExists(absolutePath);

    if (!existing || input.mode === "replace") {
      const content = renderBasicDocument(input.title, [...new Set(input.tags)], input.date) + input.body.trim() + "\n";
      await fs.writeFile(absolutePath, content, "utf-8");
      return { path: input.path, mode: existing ? "replaced" : "created" };
    }

    await fs.appendFile(absolutePath, `\n\n${input.body.trim()}\n`, "utf-8");
    await this.touchFrontmatterDate(input.path, input.date);
    return { path: input.path, mode: "appended" };
  }

  private async findProjectOverviewPath(projectPath: string): Promise<string | undefined> {
    const candidates = [
      projectAiIndexPath(projectPath),
      legacyProjectAiIndexPath(projectPath),
      legacyProjectOverviewPath(projectPath),
    ];
    for (const candidate of candidates) {
      if (await this.statIfExists(this.resolveSafe(candidate))) return candidate;
    }
    return undefined;
  }

  private targetPathForProjectAsset(project: ProjectSummary, targetDocument: "project_intro" | "raw_material"): string {
    return targetDocument === "project_intro"
      ? `${project.path}/${project.name}项目介绍.md`
      : `${project.path}/原始资料.md`;
  }

  private async ensureProjectAssetTarget(project: ProjectSummary, targetDocument: "project_intro" | "raw_material", today: string): Promise<void> {
    if (targetDocument === "project_intro") {
      await this.writeIfMissing(`${project.path}/${project.name}项目介绍.md`, renderProjectIntro({
        name: project.name,
        type: "工作项目",
        status: project.status ?? "进行中",
        date: today,
      }));
      return;
    }

    await this.writeIfMissing(`${project.path}/原始资料.md`, renderRawMaterialDocument(project.name, today));
  }

  private async appendProjectAssetEntry(targetPath: string, entry: string, today: string): Promise<void> {
    const absolutePath = this.resolveSafe(targetPath);
    const content = await fs.readFile(absolutePath, "utf-8");
    const updated = updateMarkdownSection(content, {
      heading: "附件",
      content: entry,
      mode: "append",
      createIfMissing: true,
    });
    await fs.writeFile(absolutePath, updateFrontmatterField(updated.content, "最后更新", today), "utf-8");
  }

  private async nextAvailableAssetName(projectPath: string, preferredFileName: string): Promise<string> {
    const parsed = path.parse(preferredFileName);
    const baseName = parsed.name || "附件";
    const extension = parsed.ext;
    for (let index = 1; index < 1000; index += 1) {
      const suffix = index === 1 ? "" : `-${index}`;
      const candidate = `${baseName}${suffix}${extension}`;
      const candidatePath = `${projectPath}/attachments/${candidate}`;
      if (!await this.statIfExists(this.resolveSafe(candidatePath))) return candidate;
    }
    throw new Error(`附件重名过多：${preferredFileName}`);
  }

  private defaultSplitNotePath(category: KnowledgeCategory, title: string): string {
    const fileName = sanitizePathSegment(title || "待整理");
    if (category === "design_strategy") return `02-设计/设计策略/${fileName}.md`;
    if (category === "design_resource") return `02-设计/案例收集/${fileName}.md`;
    if (category === "ai_share") return `03-AI分享/${fileName}.md`;
    if (category === "skill_tutorial") return `04-技能教程/${fileName}.md`;
    if (category === "article") return `05-文章/${fileName}.md`;
    if (category === "reference") return `06-参考资料/技术文档/${fileName}.md`;
    return `00-收件箱/${fileName}.md`;
  }

  private async writeIfMissing(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.resolveSafe(relativePath);
    if (await this.statIfExists(absolutePath)) return;

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf-8");
  }

  private resolveSafe(relativePath: string): string {
    const normalizedPath = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const absolutePath = path.resolve(this.vaultRoot, normalizedPath);
    const root = path.resolve(this.vaultRoot);

    if (absolutePath !== root && !absolutePath.startsWith(root + path.sep)) throw new Error(`路径越界：${relativePath}`);
    return absolutePath;
  }

  private async readDirectoryIfExists(absolutePath: string): Promise<import("node:fs").Dirent[]> {
    try {
      return await fs.readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      throw error;
    }
  }

  private async statIfExists(absolutePath: string): Promise<import("node:fs").Stats | undefined> {
    try {
      return await fs.stat(absolutePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async readJsonIfExists(relativePath: string): Promise<Record<string, unknown> | undefined> {
    const absolutePath = this.resolveSafe(relativePath);
    try {
      const raw = await fs.readFile(absolutePath, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeConnectorSnapshot(relativePath: string, snapshot: ConnectorSnapshot): Promise<void> {
    const absolutePath = this.resolveSafe(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  }

  private async readLatestReleaseInfo(url: string): Promise<ConnectorReleaseInfo | undefined> {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) return undefined;
      const data = await response.json() as Record<string, unknown>;
      const rawVersion = typeof data.version === "string"
        ? data.version
        : typeof data.tag_name === "string"
          ? data.tag_name
          : undefined;
      if (!rawVersion) return undefined;
      return {
        version: rawVersion.replace(/^v/i, ""),
        source: "remote",
        url: typeof data.html_url === "string" ? data.html_url : url,
        publishedAt: typeof data.published_at === "string" ? data.published_at : undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async targetPathForProjectCategory(projectName: string, category: KnowledgeCategory): Promise<string> {
    const project = await this.findProject(projectName);
    if (category === "reference") return "06-参考资料/技术文档/待整理.md";
    if (category === "ai_share") return "03-AI分享/待整理.md";
    if (category === "skill_tutorial") return "04-技能教程/待整理.md";
    if (category === "article") return "05-文章/待整理.md";
    if (category === "design_strategy") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "design_resource") return "02-设计/案例收集/待整理.md";
    if (category === "product_background") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "product_feature") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "product_advantage") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "product_positioning") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "business") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "inbox") return "00-收件箱/待整理.md";
    if (category === "iteration") return `${project.path}/迭代记录/${formatMonth(new Date())}-待整理.md`;
    if (category === "user_insight") return project.overviewPath ?? projectAiIndexPath(project.path);
    if (category === "competitor") return project.overviewPath ?? projectAiIndexPath(project.path);
    throw new Error(`不支持的知识分类：${category satisfies never}`);
  }
}

function renderProjectIntro(input: { name: string; type: string; status: string; date: string }): string {
  return `---\ntags: [项目介绍, 用户可读, 项目]\n创建时间: ${input.date}\n最后更新: ${input.date}\n项目状态: ${input.status}\n项目类型: ${input.type}\n---\n\n# ${input.name}项目介绍\n\n> 关联资料：[[01-项目/${input.name}/AI索引|AI索引]] / [[01-项目/${input.name}/原始资料|原始资料]]\n\n## 产品简介\n\n（面向用户阅读的项目介绍。把 AI 整理后的背景、定位、功能、优势合成一份顺畅文档。）\n\n## 核心亮点\n\n- \n\n## 适用场景\n\n- \n\n## 价值总结\n\n（补充项目的核心价值。）\n\n## 附件\n\n（项目截图、图片和 PDF 可通过 knowledge.attachAsset 写入这里。）\n`;
}

function renderProjectAiIndex(input: { name: string; type: string; status: string; date: string }): string {
  return `---\ntags: [AI索引, 项目]\n创建时间: ${input.date}\n最后更新: ${input.date}\n项目状态: ${input.status}\n项目类型: ${input.type}\n---\n\n# AI索引\n\n> 主体文档：[[01-项目/${input.name}/${input.name}项目介绍|${input.name}项目介绍]]\n> 原始资料：[[01-项目/${input.name}/原始资料|原始资料]]\n\n## 项目一句话\n\n（控制在一句话内，说明项目是什么。）\n\n## AI默认上下文\n\n- 产品类型：\n- 目标场景：\n- 核心用户：\n- 核心价值：\n- 当前资料状态：\n\n## 核心能力速览\n\n- \n\n## 关键词\n\n（用顿号分隔关键词。）\n\n## 使用规则\n\n- 一般回答项目背景时，优先读本文件。\n- 写正式介绍、页面文案、汇报材料时，再读 [[01-项目/${input.name}/${input.name}项目介绍|${input.name}项目介绍]]。\n- 核对原始措辞或查看图片上下文时，再读 [[01-项目/${input.name}/原始资料|原始资料]]。\n- 做交互、视觉或页面分析时，本文件只作为背景，不默认读取原始资料。\n- 图片、截图和 PDF 默认放入项目介绍或原始资料的附件章节，本文件只保留摘要和链接。\n`;
}

function renderRawMaterialDocument(projectName: string, date: string): string {
  return `---\ntags: [原始资料, 项目]\n创建时间: ${date}\n最后更新: ${date}\n---\n\n# 原始资料\n\n> 主体文档：[[01-项目/${projectName}/${projectName}项目介绍|${projectName}项目介绍]]\n> AI索引：[[01-项目/${projectName}/AI索引|AI索引]]\n\n（保留用户原始输入、文件摘录、截图和图片链接。不要在这里做过度改写。）\n\n## 附件\n\n（原始截图、PDF、参考图片可通过 knowledge.attachAsset 写入这里。）\n`;
}

function renderBasicDocument(title: string, tags: string[], date: string): string {
  return `---\ntags: [${tags.join(", ")}]\n创建时间: ${date}\n最后更新: ${date}\n---\n\n# ${title}\n\n`;
}

function renderProductKnowledgeTemplate(title: string, tags: string[], date: string, sections: string[]): string {
  return `---\ntags: [${tags.join(", ")}]\n创建时间: ${date}\n最后更新: ${date}\n---\n\n# ${title}\n\n${sections.map((section) => `## ${section}\n（待补充）`).join("\n\n")}\n`;
}

function renderIteration(input: { date: string; topic: string; projectName: string; today: string; summary?: string }): string {
  return `---\ntags: [迭代记录, 项目]\n创建时间: ${input.today}\n最后更新: ${input.today}\n项目: ${input.projectName}\n---\n\n# ${input.date}-${input.topic}\n\n## 迭代背景\n${input.summary ?? "（填写这次迭代的背景和目标）"}\n\n## 改动内容\n- \n\n## 设计决策理由\n- \n\n## 影响范围\n- \n\n## 结果评估\n（后续补充）\n`;
}

function renderKnowledgeEntry(content: string, date: string, title?: string): string {
  return title
    ? `\n\n## ${title}\n> 记录时间：${date}\n\n${content.trim()}\n`
    : `\n\n> 记录时间：${date}\n\n${content.trim()}\n`;
}

function renderAssetMarkdown(relativeAssetPath: string, input: { embed: boolean; caption?: string }): string {
  const normalizedPath = normalizeVaultPath(relativeAssetPath);
  const caption = input.caption?.trim();
  const extension = path.posix.extname(normalizedPath).toLowerCase();
  const canEmbed = EMBEDDABLE_ASSET_EXTENSIONS.has(extension);

  if (input.embed && canEmbed) {
    return [`![[${normalizedPath}]]`, caption ? `> ${caption}` : ""].filter(Boolean).join("\n");
  }

  return caption ? `[[${normalizedPath}|${caption}]]` : `[[${normalizedPath}]]`;
}

function renderAssetSectionEntry(markdown: string, caption: string | undefined, date: string): string {
  const title = caption?.trim() || "附件";
  return `### ${title}\n> 添加时间：${date}\n\n${markdown}`;
}

function renderSplitMainBody(input: { content: string; appendixLink: string; date: string }): string {
  return `## 核心内容
> 记录时间：${input.date}

${input.content.trim()}

## AI 附录
- ${input.appendixLink}
`;
}

function renderSplitAppendixBody(input: { content: string; mainLink: string; date: string; appendixKind?: string }): string {
  const title = input.appendixKind ?? "AI 附录";
  return `## ${title}
> 记录时间：${input.date}

## 对应主文档
- ${input.mainLink}

## 资料、过程、提示词
${input.content.trim()}
`;
}

function renderComparisonReport(dimension: string, projects: Array<{ project: ProjectSummary; sections: Record<string, string> }>): string {
  const dimensionTitle = {
    users: "用户群对比",
    positioning: "产品定位对比",
    features: "功能差异对比",
    full: "全面对比",
  }[dimension] ?? "全面对比";

  const rows = projects.map(({ project, sections }) => `### ${project.name}\n- 一句话定位：${oneLine(sections["一句话定位"])}\n- 目标用户：${oneLine(sections["目标用户"])}\n- 核心功能：${oneLine(sections["核心功能"])}\n- 当前阶段：${oneLine(sections["当前阶段"])}\n`).join("\n");
  return `## ${dimensionTitle}\n\n${rows}\n## 对比提示\n- 请基于以上项目概览继续分析差异、共同点和风险。\n- 如果某项为空，先提示知识库缺少对应信息，不要凭空补全。\n`;
}

function renderProjectAnalysis(project: ProjectSummary, files: Array<{ path: string; content: string }>, angle: string): string {
  const merged = files.map((file) => `### 来源：${file.path}\n${file.content}`).join("\n\n");
  return `## ${project.name} 项目诊断\n\n**分析角度：** ${angle}\n\n## 诊断结论\n（基于知识库内容生成，若资料缺失请先补充）\n\n## 主要问题\n1. 待结合下方资料判断\n\n## 建议行动\n1. 优先完善 AI索引.md 中缺失字段\n2. 需要用户可读输出时维护项目介绍；需要核对原话时查看原始资料\n\n## 知识库资料\n\n${truncate(merged, 4000)}\n`;
}

function renderBrief(period: string, snippets: Array<{ path: string; content: string }>): string {
  const title = period === "week" ? "本周工作摘要" : "本月工作摘要";
  const items = snippets.length
    ? snippets.map((item) => `### ${item.path}\n${truncate(item.content, 800)}`).join("\n\n")
    : "暂无符合时间范围的迭代记录。";
  return `# ${title}\n\n## 各项目进展\n\n${items}\n\n## 遇到的问题\n- \n\n## 下阶段计划\n- \n`;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  return Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) return undefined;
    return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
  }).filter((entry): entry is [string, string] => Boolean(entry)));
}

function updateFrontmatterField(content: string, field: string, value: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return content;

  const lines = match[1].split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (index === -1) lines.push(`${field}: ${value}`);
  else lines[index] = `${field}: ${value}`;
  return content.replace(match[0], `---\n${lines.join("\n")}\n---`);
}

function extractSections(content: string): Record<string, string> {
  return Object.fromEntries(extractMarkdownSections(content).map((section) => [section.heading, section.content]));
}

function extractMarkdownSections(content: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = content.split(/\r?\n/);
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({ heading: currentHeading, content: currentLines.join("\n").trim() });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentHeading) currentLines.push(line);
  }

  flush();
  return sections;
}

function classifyKnowledgeContent(content: string): { category: KnowledgeCategory; confidence: number; reason: string } {
  const normalized = content.toLowerCase();
  const rules: Array<{ category: KnowledgeCategory; label: string; keywords: string[] }> = [
    { category: "product_background", label: "产品背景", keywords: ["产品背景", "为什么", "背景", "问题", "业务目标", "现状", "机会"] },
    { category: "product_feature", label: "产品功能", keywords: ["功能", "需求", "流程", "验收", "交互", "页面", "模块", "按钮", "入口", "配置"] },
    { category: "product_advantage", label: "产品优势", keywords: ["优势", "差异化", "价值", "卖点", "竞争力", "亮点"] },
    { category: "product_positioning", label: "产品定位", keywords: ["定位", "市场", "目标人群", "一句话", "价值主张", "品牌"] },
    { category: "user_insight", label: "用户画像", keywords: ["用户", "画像", "痛点", "场景", "需求", "使用路径", "人群", "反馈", "访谈"] },
    { category: "business", label: "业务知识", keywords: ["业务", "商业", "转化", "收入", "成本", "流程", "部门", "客户"] },
    { category: "design_strategy", label: "设计策略", keywords: ["设计策略", "设计目标", "设计原则", "体验策略", "设计决策", "评审", "可用性"] },
    { category: "design_resource", label: "设计资料", keywords: ["设计", "规范", "视觉", "组件", "样式", "布局", "颜色", "字号", "动效", "案例"] },
    { category: "ai_share", label: "AI 分享", keywords: ["ai", "提示词", "prompt", "工作流", "智能体", "模型", "分享", "复盘"] },
    { category: "skill_tutorial", label: "Skill/教程", keywords: ["skill", "技能", "教程", "步骤", "操作", "指南", "手册", "安装", "配置"] },
    { category: "article", label: "文章写作", keywords: ["文章", "草稿", "标题", "观点", "发布", "开头", "结尾", "段落", "article", "draft", "viewpoint", "publish", "paragraph"] },
    { category: "competitor", label: "竞品分析", keywords: ["竞品", "对手", "竞对", "差异化", "对比", "优势", "劣势", "市场"] },
    { category: "iteration", label: "迭代记录", keywords: ["迭代", "版本", "改动", "上线", "发布", "修复", "优化", "变更"] },
    { category: "reference", label: "参考资料", keywords: ["报告", "资料", "文档", "链接", "论文", "趋势", "研究", "参考"] },
  ];

  const scored = rules.map((rule) => ({
    ...rule,
    score: rule.keywords.reduce((sum, keyword) => sum + countOccurrences(normalized, keyword.toLowerCase()), 0),
  })).sort((left, right) => right.score - left.score);
  const best = scored[0];

  if (!best || best.score === 0) {
    return { category: "inbox", confidence: 0.35, reason: "未识别出稳定分类关键词，建议先放入收件箱。" };
  }

  return {
    category: best.category,
    confidence: Math.min(0.95, 0.55 + best.score * 0.1),
    reason: `命中 ${best.label} 相关关键词 ${best.score} 次。`,
  };
}

function parseKnowledgeCategory(value: string | undefined): KnowledgeCategory | undefined {
  if (!value) return undefined;
  return KNOWLEDGE_CATEGORY_VALUES.find((category) => category === value);
}

function isSingleDocumentCategory(category: KnowledgeCategory): boolean {
  return category === "ai_share" || category === "skill_tutorial" || category === "article";
}

function targetPathForGlobalCategory(category: KnowledgeCategory): string {
  const targets: Record<KnowledgeCategory, string> = {
    product_background: "00-收件箱/待整理.md",
    product_feature: "00-收件箱/待整理.md",
    product_advantage: "00-收件箱/待整理.md",
    product_positioning: "00-收件箱/待整理.md",
    user_insight: "00-收件箱/待整理.md",
    business: "00-收件箱/待整理.md",
    design_strategy: "02-设计/设计策略/待整理.md",
    design_resource: "02-设计/案例收集/待整理.md",
    ai_share: "03-AI分享/待整理.md",
    skill_tutorial: "04-技能教程/待整理.md",
    article: "05-文章/待整理.md",
    competitor: "06-参考资料/行业报告/竞品待整理.md",
    iteration: "00-收件箱/待整理.md",
    reference: "06-参考资料/技术文档/待整理.md",
    inbox: "00-收件箱/待整理.md",
  };
  return targets[category];
}

function buildAppendixPath(mainPath: string, appendixKind?: string): string {
  const normalizedPath = normalizeMarkdownPath(mainPath);
  const directory = path.posix.dirname(normalizedPath);
  const basename = path.posix.basename(normalizedPath, MARKDOWN_EXTENSION);
  const suffix = sanitizePathSegment(appendixKind ?? "AI附录");
  const fileName = `${basename}_${suffix}.md`;
  return directory === "." ? fileName : `${directory}/${fileName}`;
}

function wikilinkForPath(filePath: string): string {
  const basename = path.posix.basename(normalizeMarkdownPath(filePath), MARKDOWN_EXTENSION);
  return `[[${basename}]]`;
}

function projectAiIndexPath(projectPath: string): string {
  return `${projectPath}/${PROJECT_AI_INDEX_FILE}`;
}

function legacyProjectAiIndexPath(projectPath: string): string {
  return `${projectPath}/${LEGACY_PROJECT_AI_INDEX_FILE}`;
}

function legacyProjectOverviewPath(projectPath: string): string {
  return `${projectPath}/${LEGACY_PROJECT_OVERVIEW_FILE}`;
}

function isProjectAiIndexFile(fileName: string): boolean {
  return fileName === PROJECT_AI_INDEX_FILE || fileName === LEGACY_PROJECT_AI_INDEX_FILE;
}

function updateMarkdownSection(
  content: string,
  input: { heading: string; content: string; mode: "replace" | "append" | "prepend"; createIfMissing: boolean },
): { content: string; heading: string; created: boolean } {
  const lines = content.split(/\r?\n/);
  const normalizedHeading = normalizeHeading(input.heading);
  const startIndex = lines.findIndex((line) => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    return match ? normalizeHeading(match[1]) === normalizedHeading : false;
  });

  if (startIndex === -1) {
    if (!input.createIfMissing) throw new Error(`未找到章节：${input.heading}`);
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    return {
      content: `${content.trimEnd()}${separator}## ${input.heading}\n${input.content.trim()}\n`,
      heading: input.heading,
      created: true,
    };
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  const originalHeading = lines[startIndex].replace(/^##\s+/, "").trim();
  const existingBody = lines.slice(startIndex + 1, endIndex).join("\n").trim();
  const incomingBody = input.content.trim();
  const newBody = input.mode === "append"
    ? [existingBody, incomingBody].filter(Boolean).join("\n\n")
    : input.mode === "prepend"
      ? [incomingBody, existingBody].filter(Boolean).join("\n\n")
      : incomingBody;
  const replacement = [`## ${originalHeading}`, newBody].filter(Boolean).join("\n");

  return {
    content: [...lines.slice(0, startIndex), replacement, ...lines.slice(endIndex)].join("\n").trimEnd() + "\n",
    heading: originalHeading,
    created: false,
  };
}

function ensureFrontmatter(content: string, defaults: Record<string, string | string[]>): string {
  const normalizedDefaults = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [
    key,
    Array.isArray(value) ? `[${value.join(", ")}]` : value,
  ]));
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    const frontmatter = Object.entries(normalizedDefaults).map(([key, value]) => `${key}: ${value}`).join("\n");
    return `---\n${frontmatter}\n---\n\n${content.trimStart()}`;
  }

  const lines = match[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(normalizedDefaults)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`));
    if (index === -1) {
      lines.push(`${key}: ${value}`);
      continue;
    }

    if (lines[index].slice(key.length + 1).trim() === "") lines[index] = `${key}: ${value}`;
  }

  return content.replace(match[0], `---\n${lines.join("\n")}\n---`);
}

function tagsForPath(filePath: string): string[] {
  if (filePath.includes(PROJECT_AI_INDEX_FILE) || filePath.includes(LEGACY_PROJECT_AI_INDEX_FILE)) return ["AI索引", "项目"];
  if (filePath.includes("原始资料")) return ["原始资料", "项目"];
  if (filePath.includes("项目介绍")) return ["项目介绍", "用户可读"];
  if (filePath.includes("/产品背景")) return ["产品背景", "业务"];
  if (filePath.includes("/用户画像")) return ["用户画像", "待确认"];
  if (filePath.includes("/产品功能")) return ["功能", "待确认"];
  if (filePath.includes("/产品优势")) return ["产品优势", "待确认"];
  if (filePath.includes("/产品定位")) return ["产品定位", "待确认"];
  if (filePath.includes("/设计规范") || filePath.includes("/02-设计/")) return ["设计方案", "待确认"];
  if (filePath.includes("/竞品分析")) return ["竞品", "待确认"];
  if (filePath.includes("/迭代记录/")) return ["迭代记录", "项目"];
  if (filePath.includes("/03-AI分享/")) return ["AI", "分享"];
  if (filePath.includes("/04-技能教程/")) return ["skill", "教程"];
  if (filePath.includes("/05-文章/")) return ["文章", "草稿"];
  if (filePath.includes("/06-参考资料/")) return ["参考"];
  if (filePath.includes("/00-收件箱/")) return ["待整理"];
  return ["知识条目"];
}

function inferCanonicalPath(category: string | undefined, text: string): string | undefined {
  switch (category) {
    case "product_background":
    case "product_feature":
    case "product_advantage":
    case "product_positioning":
      return "01-项目/项目名/AI索引.md";
    case "design_strategy":
      return "01-项目/项目名/AI索引.md";
    case "design_resource":
      return "02-设计/案例收集/待整理.md";
    case "ai_share":
      return "03-AI分享/待整理.md";
    case "skill_tutorial":
      return "04-技能教程/待整理.md";
    case "article":
      return "05-文章/待整理.md";
    case "reference":
      return "06-参考资料/技术文档/待整理.md";
    default:
      if (/(设计策略|设计原则|策略)/.test(text)) return "01-项目/项目名/设计策略.md";
      if (/(AI|提示词|工作流)/i.test(text)) return "03-AI分享/待整理.md";
      if (/(教程|skill|技能)/i.test(text)) return "04-技能教程/待整理.md";
      if (/(文章|草稿|观点)/.test(text)) return "05-文章/待整理.md";
      return undefined;
  }
}

function inferDraftPath(category: string | undefined, text: string): string | undefined {
  if (category === "product_background" || category === "product_feature" || category === "product_advantage" || category === "product_positioning") {
    return "00-收件箱/待整理.md";
  }
  if (category === "design_strategy") return "02-设计/设计策略/待整理.md";
  if (category === "ai_share") return "03-AI分享/待整理.md";
  if (category === "skill_tutorial") return "04-技能教程/待整理.md";
  if (category === "article") return "05-文章/待整理.md";
  if (category === "reference") return "06-参考资料/技术文档/待整理.md";
  if (/(设计策略|设计原则|策略)/.test(text)) return "02-设计/设计策略/待整理.md";
  if (/(AI|提示词|工作流)/i.test(text)) return "03-AI分享/待整理.md";
  if (/(教程|skill|技能)/i.test(text)) return "04-技能教程/待整理.md";
  if (/(文章|草稿|观点)/.test(text)) return "05-文章/待整理.md";
  return "00-收件箱/待整理.md";
}

function hashManifest(manifest: Record<string, unknown>): string {
  const stable = JSON.stringify(sortObject(manifest));
  let hash = 0;
  for (let index = 0; index < stable.length; index += 1) {
    hash = (hash * 31 + stable.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function parseConnectorSnapshot(snapshot: Record<string, unknown>): ConnectorSnapshot {
  return {
    checkedAt: typeof snapshot.checkedAt === "string" ? snapshot.checkedAt : "",
    manifestPath: typeof snapshot.manifestPath === "string" ? snapshot.manifestPath : "",
    manifestHash: typeof snapshot.manifestHash === "string" ? snapshot.manifestHash : "",
    manifestVersion: typeof snapshot.manifestVersion === "string" ? snapshot.manifestVersion : undefined,
    minAppVersion: typeof snapshot.minAppVersion === "string" ? snapshot.minAppVersion : undefined,
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortObject(entry)]));
}

function compareSemver(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function semverParts(value: string): number[] {
  return value
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function extractTitle(content: string): string | undefined {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function buildExcerpt(content: string, keywords: string[]): string {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)));
  const start = Math.max(0, index - 1);
  const relevantLines = index === -1 ? lines.slice(0, 3) : lines.slice(start, start + 4);
  return relevantLines.join("\n").trim().slice(0, 500);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let position = haystack.indexOf(needle);
  while (position !== -1) {
    count += 1;
    position = haystack.indexOf(needle, position + needle.length);
  }
  return count;
}

function tokenize(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  const latinTokens = normalized.match(/[a-z0-9_-]{2,}/g) ?? [];
  const cjkTokens = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  return [...new Set([...latinTokens, ...cjkTokens])];
}

function normalizeMarkdownPath(relativePath: string): string {
  const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalizedPath.endsWith(MARKDOWN_EXTENSION) ? normalizedPath : `${normalizedPath}${MARKDOWN_EXTENSION}`;
}

function normalizeVaultPath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function buildAssetFileName(assetName: string | undefined, sourcePath: string): string {
  const sourceExtension = path.extname(sourcePath);
  const rawName = assetName?.trim() || path.basename(sourcePath);
  const parsed = path.parse(rawName);
  const baseName = sanitizePathSegment(parsed.name || "附件");
  const extension = sanitizeFileExtension(parsed.ext || sourceExtension);
  return `${baseName}${extension}`;
}

function sanitizeFileExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(normalized) ? normalized : "";
}

function sanitizePathSegment(segment: string): string {
  return segment.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, " ");
}

function oneLine(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim().slice(0, 160) || "知识库未填写";
}

function normalizeHeading(value: string): string {
  return value.toLowerCase().replace(/[ \t\r\n#：:，,。.!！?？()[\]【】「」"'“”‘’]/g, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n（内容过长，已截断）`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
