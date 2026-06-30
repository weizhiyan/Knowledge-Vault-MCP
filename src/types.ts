export type ChoiceStyle = "single_select" | "multi_select" | "confirm" | "input";

export interface UserChoiceOption {
  label: string;
  value: string;
  description?: string;
}

export interface UserChoicePayload {
  type: "user_choice";
  question: string;
  style: ChoiceStyle;
  options: UserChoiceOption[];
  placeholder?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  excerpt: string;
  updatedAt?: string;
}

export interface ProjectSummary {
  name: string;
  path: string;
  overviewPath?: string;
  status?: string;
  updatedAt?: string;
}

export interface AgentProfile {
  identity: {
    role: string;
    systemPrompt: string;
    guidelines?: string[];
    responseStyle?: "concise" | "balanced" | "detailed";
    thinkingDepth?: "quick" | "standard" | "deep";
  };
  skills?: Array<{
    name: string;
    triggers: string[];
    description: string;
    promptTemplate?: string;
    requireConfirm?: boolean;
    enabled?: boolean;
  }>;
  memoryScope?: "none" | "session" | "project" | "user";
  knowledgeBases?: Array<{
    id: string;
    name: string;
    description: string;
    retrievalTopK?: number;
    usageScenario?: string;
  }>;
}
