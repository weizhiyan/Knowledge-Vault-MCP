#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { injectAgentShellConfig } from "./configInjector.js";
import { AgentProfile } from "./types.js";
import { VaultService } from "./vault.js";

const DEFAULT_VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH ?? process.env.WORK_VAULT_PATH ?? process.cwd();
const vault = new VaultService(DEFAULT_VAULT_ROOT);

const server = new McpServer({
  name: "obsidian-knowledge-mcp",
  version: "0.1.0",
});

server.tool(
  "knowledge.ensureBaseStructure",
  "Create the recommended AI-readable WorkVault folders and templates for work/product, design, AI sharing, skills/tutorials, articles, and references.",
  {},
  async () => toTextResult(await vault.ensureBaseStructure()),
);

server.tool(
  "knowledge.skills",
  "List built-in knowledge-base skills that guide agents when reading, writing, classifying, and maintaining the vault.",
  {},
  async () => toTextResult(await vault.listBuiltInSkills()),
);

server.tool(
  "knowledge.outline",
  "Return the recommended knowledge-base areas and templates for this AI/user shared vault.",
  {},
  async () => toTextResult(await vault.knowledgeOutline()),
);

server.tool(
  "knowledge.detectObsidianVault",
  "Detect whether the current knowledge folder is already an Obsidian vault and list installed Obsidian plugins if present.",
  {},
  async () => toTextResult(await vault.detectObsidianVault()),
);

server.tool(
  "knowledge.recommendNoteStrategy",
  "Recommend whether a note should be shared as one document, split into user-facing and AI-facing parts, or captured raw first.",
  {
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional().describe("Optional knowledge category hint, such as 产品功能, 设计策略, AI分享, 教程, 文章."),
  },
  async (input) => toTextResult(await vault.recommendNoteStrategy(input)),
);

server.tool(
  "knowledge.planNoteWrite",
  "Plan a note write by detecting vault mode, classifying the content, and recommending a direct or split write strategy.",
  {
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional(),
    projectName: z.string().optional(),
  },
  async (input) => toTextResult(await vault.planNoteWrite(input)),
);

server.tool(
  "knowledge.projects",
  "List projects under 01-Projects without reading every project file.",
  {},
  async () => toTextResult(await vault.listProjects()),
);

server.tool(
  "knowledge.loadProject",
  "Load one project's _项目概览.md as the high-signal project background.",
  {
    projectName: z.string().min(1).describe("Project name or partial project name."),
  },
  async ({ projectName }) => toTextResult(await vault.loadProjectContext(projectName)),
);

server.tool(
  "knowledge.search",
  "Search markdown file names, titles, tags, frontmatter, and content. Returns top matches with excerpts only.",
  {
    query: z.string().min(1).describe("Search query or keywords."),
    limit: z.number().int().positive().max(20).default(5).describe("Maximum number of results."),
  },
  async ({ query, limit }) => toTextResult(await vault.search(query, limit)),
);

server.tool(
  "knowledge.get",
  "Read one markdown file by relative path from the vault.",
  {
    path: z.string().min(1).describe("Vault-relative markdown path."),
  },
  async ({ path }) => ({
    content: [{ type: "text", text: await vault.readFile(path) }],
  }),
);

server.tool(
  "knowledge.getSection",
  "Read one H2 section from a markdown file by heading, returning available headings for precise follow-up reads.",
  {
    path: z.string().min(1).describe("Vault-relative markdown path."),
    heading: z.string().min(1).describe("H2 heading to read, exact or partial match."),
  },
  async (input) => toTextResult(await vault.readSection(input.path, input.heading)),
);

server.tool(
  "knowledge.sections",
  "List H2 headings and short excerpts from one markdown file without reading the full file into context.",
  {
    path: z.string().min(1).describe("Vault-relative markdown path."),
  },
  async ({ path }) => toTextResult(await vault.listSections(path)),
);

server.tool(
  "knowledge.createProject",
  "Create a project knowledge-base folder with overview, user, feature, positioning, design, competitor, and iteration files.",
  {
    name: z.string().min(1).describe("Project folder name."),
    type: z.string().optional().describe("Project type, e.g. 产品设计项目."),
    status: z.string().optional().describe("Project status, default 进行中."),
  },
  async (input) => toTextResult(await vault.createProject(input)),
);

server.tool(
  "knowledge.createIteration",
  "Create a dated iteration record under a project's 迭代记录 folder.",
  {
    projectName: z.string().min(1).describe("Project name."),
    topic: z.string().min(1).describe("Iteration topic used in the filename."),
    summary: z.string().optional().describe("Optional iteration background summary."),
    date: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Optional YYYY-MM prefix."),
  },
  async (input) => toTextResult(await vault.createIteration(input)),
);

server.tool(
  "knowledge.suggestTarget",
  "Return a user_choice payload for AgentShell to ask where a knowledge entry should be stored.",
  {
    content: z.string().optional().describe("Knowledge content to classify. Currently used as UI context only."),
    projectName: z.string().optional().describe("Known project name; when present returns file choices inside that project."),
  },
  async (input) => toTextResult(await vault.suggestKnowledgeTarget(input)),
);

server.tool(
  "knowledge.classifyEntry",
  "Classify a knowledge entry and return a recommended target path plus user_choice payload. This is heuristic and transparent.",
  {
    content: z.string().min(1).describe("Knowledge entry content to classify."),
    projectName: z.string().optional().describe("Known project name; when present recommends project-local files."),
    title: z.string().optional().describe("Optional title for extra classification context."),
  },
  async (input) => toTextResult(await vault.classifyEntry(input)),
);

server.tool(
  "knowledge.store",
  "Create or append a knowledge entry in one markdown file. Use only after user confirmation for writes.",
  {
    targetPath: z.string().min(1).describe("Vault-relative markdown target path."),
    content: z.string().min(1).describe("Knowledge entry content."),
    title: z.string().optional().describe("Optional section or file title."),
    append: z.boolean().default(true).describe("Append to existing file when true."),
  },
  async (input) => toTextResult(await vault.storeKnowledge(input)),
);

server.tool(
  "knowledge.update",
  "Append to or replace one knowledge file. Use only after user confirmation for writes.",
  {
    targetPath: z.string().min(1).describe("Vault-relative markdown target path."),
    content: z.string().min(1).describe("New content."),
    mode: z.enum(["append", "replace"]).default("append"),
    sectionTitle: z.string().optional().describe("Optional section title for appended content."),
  },
  async (input) => toTextResult(await vault.updateKnowledge(input)),
);

server.tool(
  "knowledge.updateSection",
  "Replace, append, or prepend content inside one H2 section. Use only after user confirmation for writes.",
  {
    targetPath: z.string().min(1).describe("Vault-relative markdown target path."),
    heading: z.string().min(1).describe("H2 heading to update."),
    content: z.string().min(1).describe("New section content."),
    mode: z.enum(["replace", "append", "prepend"]).default("replace"),
    createIfMissing: z.boolean().default(false).describe("Create the H2 section if it does not exist."),
  },
  async (input) => toTextResult(await vault.updateSection(input)),
);

server.tool(
  "knowledge.archiveInbox",
  "Move/copy/append one inbox markdown file into a target knowledge file. Use only after user confirmation.",
  {
    inboxPath: z.string().min(1).describe("Inbox markdown path, e.g. 00-Inbox/foo.md."),
    targetPath: z.string().min(1).describe("Target vault-relative markdown path."),
    mode: z.enum(["append", "move", "copy"]).default("append"),
    title: z.string().optional().describe("Optional title when appending/copying."),
  },
  async (input) => toTextResult(await vault.archiveInbox(input)),
);

server.tool(
  "knowledge.inbox",
  "List 00-Inbox markdown items with excerpts and a user_choice payload for archive triage.",
  {},
  async () => toTextResult(await vault.listInbox()),
);

server.tool(
  "knowledge.compareProjects",
  "Load two or more project overviews and produce a structured comparison scaffold.",
  {
    projectNames: z.array(z.string().min(1)).min(2).max(6),
    dimension: z.enum(["users", "positioning", "features", "full"]).default("full"),
  },
  async (input) => toTextResult(await vault.compareProjects(input)),
);

server.tool(
  "knowledge.analyzeProject",
  "Load project core files and produce a project diagnosis scaffold plus save-choice payload.",
  {
    projectName: z.string().min(1),
    angle: z.enum(["positioning", "users", "competitors", "risks", "full"]).default("full"),
  },
  async (input) => toTextResult(await vault.analyzeProject(input)),
);

server.tool(
  "knowledge.userAnalysisContext",
  "Load 用户画像.md and return analysis-dimension choices for AgentShell.",
  {
    projectName: z.string().min(1),
  },
  async ({ projectName }) => toTextResult(await vault.userAnalysis(projectName)),
);

server.tool(
  "knowledge.designReviewContext",
  "Load project overview and design spec, then return review-dimension choices for AgentShell.",
  {
    projectName: z.string().min(1),
  },
  async ({ projectName }) => toTextResult(await vault.designReviewContext(projectName)),
);

server.tool(
  "knowledge.competitorAnalysisContext",
  "Load 竞品分析.md, report staleness, and return comparison-dimension choices for AgentShell.",
  {
    projectName: z.string().min(1),
  },
  async ({ projectName }) => toTextResult(await vault.competitorAnalysis(projectName)),
);

server.tool(
  "knowledge.weeklyBrief",
  "Generate a weekly or monthly work brief from recent iteration records. Can save to 08-Journal after confirmation.",
  {
    period: z.enum(["week", "month"]).default("week"),
    projectName: z.string().optional(),
    save: z.boolean().default(false).describe("Save generated brief to 08-Journal when true."),
  },
  async (input) => toTextResult(await vault.weeklyBrief(input)),
);

server.tool(
  "knowledge.healthCheck",
  "Check missing project overviews, stale files, inbox items, and incomplete frontmatter. Returns a next-action user_choice payload.",
  {
    staleDays: z.number().int().positive().max(3650).default(90).describe("Days before a file is considered stale."),
  },
  async ({ staleDays }) => toTextResult(await vault.healthCheck(staleDays)),
);

server.tool(
  "knowledge.repairHealthIssue",
  "Repair one health-check issue where safe: create missing overview, repair frontmatter, or touch stale metadata. Use only after user confirmation.",
  {
    type: z.enum(["missing_overview", "stale_file", "incomplete_frontmatter", "inbox_item"]),
    path: z.string().min(1).describe("Issue path from knowledge.healthCheck."),
  },
  async (input) => toTextResult(await vault.repairHealthIssue(input)),
);

server.tool(
  "knowledge.recommendObsidianConnector",
  "Return a concise recommendation for using an existing Obsidian MCP/REST connector instead of reimplementing vault access.",
  {},
  async () => toTextResult({
    recommendation: "Use an existing Obsidian community plugin or REST+MCP connector as the vault bridge, and keep this server focused on workflow, knowledge organization, and AgentShell injection.",
    options: [
      "Local REST API with MCP",
      "REST and MCP server",
      "Semantic Notes Vault MCP",
    ],
  }),
);

server.tool(
  "knowledge.checkObsidianConnector",
  "Check an installed Obsidian connector plugin manifest for version drift, minimum Obsidian compatibility, and optional remote update availability.",
  {
    manifestPath: z.string().optional().describe("Vault-relative path to the connector plugin manifest.json."),
    snapshotPath: z.string().optional().describe("Vault-relative JSON path used to remember the previous connector manifest state."),
    obsidianAppVersion: z.string().optional().describe("Optional current Obsidian app version for minAppVersion compatibility checks."),
    latestVersionUrl: z.string().url().optional().describe("Optional JSON endpoint such as a GitHub releases/latest API URL."),
    persistSnapshot: z.boolean().default(false).describe("When true, write the current connector manifest snapshot."),
  },
  async (input) => toTextResult(await vault.checkConnectorStatus(input)),
);

server.tool(
  "knowledge.setObsidianConnectorSnapshot",
  "Persist the current Obsidian connector plugin manifest snapshot for future version drift checks.",
  {
    manifestPath: z.string().min(1).describe("Vault-relative path to the connector plugin manifest.json."),
    snapshotPath: z.string().min(1).describe("Vault-relative JSON path to store the connector snapshot."),
  },
  async (input) => toTextResult(await vault.setConnectorSnapshot(input)),
);

server.tool(
  "agentshell.injectConfig",
  "Inject an AgentShell profile into CLAUDE.md and/or AGENTS.md using marker blocks.",
  {
    projectRoot: z.string().min(1).describe("Project root where CLAUDE.md / AGENTS.md should be written."),
    targets: z.array(z.enum(["claude", "agents"])).default(["claude", "agents"]),
    mcpServerUrl: z.string().optional().describe("Displayed MCP endpoint, e.g. http://localhost:3750/mcp or stdio command."),
    profile: z.object({
      identity: z.object({
        role: z.string().min(1),
        systemPrompt: z.string().min(1),
        guidelines: z.array(z.string()).optional(),
        responseStyle: z.enum(["concise", "balanced", "detailed"]).optional(),
        thinkingDepth: z.enum(["quick", "standard", "deep"]).optional(),
      }),
      skills: z.array(z.object({
        name: z.string().min(1),
        triggers: z.array(z.string()),
        description: z.string().min(1),
        promptTemplate: z.string().optional(),
        requireConfirm: z.boolean().optional(),
        enabled: z.boolean().optional(),
      })).optional(),
      memoryScope: z.enum(["none", "session", "project", "user"]).optional(),
      knowledgeBases: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
        retrievalTopK: z.number().int().positive().max(20).optional(),
        usageScenario: z.string().optional(),
      })).optional(),
    }),
  },
  async ({ profile, projectRoot, targets, mcpServerUrl }) => toTextResult(await injectAgentShellConfig({
    profile: profile as AgentProfile,
    projectRoot,
    targets,
    mcpServerUrl,
  })),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function toTextResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
