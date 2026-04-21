export interface Model {
  id: string;
  name: string;
  provider: string;
  shortDescription: string;
  description: string;
  contextWindow: string;
  pricing: string;
  status: "online" | "offline" | "maintenance" | "exclusive" | "unstable";
  offlineReason?: string;
  category: "flagship" | "chat" | "embedding" | "vision" | "reranker";
  speed: "fast" | "medium" | "slow";
  addedAt: string;
  tags?: string[];
  badge?: "推荐" | "热门" | "新上线" | "蒸馏" | "大参数" | "稠密" | "MoE";
  baseUrl?: string;
  apiKey?: string;
  modelApiName?: string;
  importFormat?: "openai" | "custom";
  customHeaders?: Record<string, string>;
}

export const models: Model[] = [
  // 全能旗舰
  {
    id: "qwen3.5-35b",
    name: "qwen3.5-35b",
    provider: "通义千问",
    shortDescription: "MoE 四模态旗舰，内置 Thinking 推理，中文综合能力第一梯队",
    description: "Qwen3.5 系列最强旗舰，MoE 混合专家架构（激活参数约 35B），原生支持文本、图像、视频、音频四模态输入，内置 Thinking 模式可切换深度推理，中文综合能力位列开源模型第一梯队",
    contextWindow: "128K",
    pricing: "",
    status: "online",
    category: "flagship",
    speed: "fast",
    addedAt: "2026-03-20",
    tags: ["MoE", "多模态", "代码", "推理", "中文", "长文本"],
    badge: "热门",
  },
  {
    id: "qwen3.5-122b",
    name: "qwen3.5-122b",
    provider: "通义千问",
    shortDescription: "122B 超大 MoE 旗舰，推理深度与知识广度全面领先",
    description: "Qwen3.5 旗舰大参数版本，122B 总参数 MoE 架构，在复杂推理、长文本理解与专业知识问答上较 35B 版本全面提升，适合对模型能力天花板有较高要求的核心业务场景",
    contextWindow: "128K",
    pricing: "",
    status: "online",
    category: "flagship",
    speed: "medium",
    addedAt: "2026-04-01",
    tags: ["MoE", "多模态", "推理", "中文", "大参数"],
    badge: "大参数",
  },
  {
    id: "gemma4-26b",
    name: "gemma4-26b",
    provider: "Google",
    shortDescription: "Google MoE 旗舰，多语言与视觉基准领先，指令遵循优异",
    description: "Google Gemma4 系列 MoE 旗舰，激活参数约 26B，原生支持图文交错输入，在 MMLU / MMMU / MATH 等多语言与视觉基准上领先同级模型，指令遵循与安全对齐表现优异",
    contextWindow: "128K",
    pricing: "",
    status: "online",
    category: "flagship",
    speed: "fast",
    addedAt: "2026-03-15",
    tags: ["MoE", "多模态", "多语言", "代码", "视觉"],
    badge: "推荐",
  },
  {
    id: "glm4.7-flash-30b",
    name: "glm4.7-flash-30b",
    provider: "智谱AI",
    shortDescription: "MoE 高速旗舰，TTFT < 200ms，多模态快速响应",
    description: "智谱 GLM4.7 MoE 高速旗舰，激活参数约 30B，首 Token 延迟极低（TTFT < 200ms），原生图文理解，适合需要快速响应的多模态生产环境，中文对话体验自然流畅",
    contextWindow: "128K",
    pricing: "",
    status: "online",
    category: "flagship",
    speed: "fast",
    addedAt: "2026-03-01",
    tags: ["MoE", "多模态", "高速", "中文", "视觉"],
    badge: "推荐",
  },
  // 文本生成
  {
    id: "qwen2-72b",
    name: "qwen2-72b",
    provider: "通义千问",
    shortDescription: "72B 超大参数，中文理解深度领先，非稳定支持",
    description: "72B 超大参数量密集模型，中文语义理解深度与知识覆盖面在同级中领先，长文本（128K）处理能力出色，适合金融、法律、教育等需要高准确度的专业领域。当前处于非稳定支持状态，可能随模型调测进行调整",
    contextWindow: "128K",
    pricing: "",
    status: "unstable",
    category: "chat",
    speed: "medium",
    addedAt: "2025-11-05",
    tags: ["中文", "推理", "长文本"],
    badge: "大参数",
  },
  {
    id: "deepseek-v3",
    name: "deepseek-v3",
    provider: "DeepSeek",
    shortDescription: "671B MoE 架构，代码基准全球前列，非稳定支持",
    description: "DeepSeek 第三代旗舰，671B 总参数 MoE 架构（激活 37B），在 HumanEval / SWE-Bench 等代码基准位居全球前列，数学推理与多语言能力突出，国产开源模型标杆。当前处于非稳定支持状态，可能随模型调测进行调整",
    contextWindow: "64K",
    pricing: "",
    status: "unstable",
    category: "chat",
    speed: "fast",
    addedAt: "2026-01-10",
    tags: ["代码", "推理", "多语言"],
    badge: "大参数",
  },
  {
    id: "deepseek-r1-distill-32b",
    name: "deepseek-r1-distill-32b",
    provider: "DeepSeek",
    shortDescription: "R1 蒸馏推理模型，完整链式思维，维护中",
    description: "从 DeepSeek-R1 满血版蒸馏而来的 32B 推理专精模型，继承了完整的链式思维（Chain-of-Thought）能力，可自动展开多步推导过程，在数学竞赛题与复杂逻辑问题上表现优异。当前正在维护中，暂时不接受新请求",
    contextWindow: "64K",
    pricing: "",
    status: "maintenance",
    category: "chat",
    speed: "medium",
    addedAt: "2026-02-15",
    tags: ["推理", "思维链", "复杂问题"],
    badge: "蒸馏",
  },
  // 视觉理解
  {
    id: "qwen2.5-vl-7b",
    name: "qwen2.5-vl-7b",
    provider: "通义千问",
    shortDescription: "7B 视觉语言模型，文档 OCR 与表格解析，非稳定支持",
    description: "专为视觉语言任务设计的 7B 轻量模型，在文档 OCR、表格解析、图表理解等结构化视觉任务上精度领先，支持任意分辨率图像输入，推理速度快，是视觉理解场景的性价比之选。当前处于非稳定支持状态，可能随模型调测进行调整",
    contextWindow: "32K",
    pricing: "",
    status: "unstable",
    category: "vision",
    speed: "fast",
    addedAt: "2026-02-01",
    tags: ["图像理解", "文档解析", "多模态"],
  },
  // 向量嵌入
  {
    id: "bge-m3",
    name: "bge-m3",
    provider: "BAAI",
    shortDescription: "稠密+稀疏+ColBERT 三合一嵌入，100+ 语言支持",
    description: "北京智源（BAAI）开源的多功能嵌入模型，独创稠密 + 稀疏 + 多粒度（ColBERT）三合一检索架构，支持 100+ 语言，是构建多语言 RAG 系统的首选向量化方案",
    contextWindow: "8K",
    pricing: "",
    status: "online",
    category: "embedding",
    speed: "fast",
    addedAt: "2025-12-01",
    tags: ["多语言", "语义搜索", "RAG"],
    badge: "推荐",
  },
  {
    id: "qwen3-embedding-8b",
    name: "qwen3-embedding-8b",
    provider: "通义千问",
    shortDescription: "8B 嵌入模型，32K 长文本向量化，中文语义精细",
    description: "8B 参数高维文本嵌入模型，支持 32K 超长文本向量化，中文语义细粒度表达能力强，适合需要对完整文档或长段落进行语义索引的场景",
    contextWindow: "32K",
    pricing: "",
    status: "online",
    category: "embedding",
    speed: "fast",
    addedAt: "2026-03-10",
    tags: ["长文本", "语义搜索", "中文"],
  },
  {
    id: "qwen3-vl-embedding-2b",
    name: "qwen3-vl-embedding-2b",
    provider: "通义千问",
    shortDescription: "多模态嵌入，图文统一向量，支持跨模态检索",
    description: "多模态嵌入模型，可同时对文本和图像生成统一语义向量，支持图搜文、文搜图、图搜图等跨模态检索，是构建多模态 RAG 系统的核心组件",
    contextWindow: "8K",
    pricing: "",
    status: "online",
    category: "embedding",
    speed: "fast",
    addedAt: "2026-03-10",
    tags: ["图文检索", "多模态", "RAG"],
  },
  // 重排序
  {
    id: "bge-reranker",
    name: "bge-reranker",
    provider: "BAAI",
    shortDescription: "交叉编码器精排，RAG 检索精度提升 15-30%",
    description: "北京智源开源的交叉编码器重排序模型，对查询-文档对进行精细语义匹配打分，可将 RAG 检索精度提升 15-30%，延迟低、效果稳定，业界 RAG 方案的标配精排组件",
    contextWindow: "8K",
    pricing: "",
    status: "online",
    category: "reranker",
    speed: "fast",
    addedAt: "2025-12-01",
    tags: ["重排序", "精度优化", "RAG"],
    badge: "推荐",
  },
  {
    id: "qwen3-reranker-8b",
    name: "qwen3-reranker-8b",
    provider: "通义千问",
    shortDescription: "8B 重排序模型，32K 长文本精排，中文精度领先",
    description: "8B 参数文本重排序模型，支持 32K 长文本精排，中文语义理解精度优于同级模型，适合中文主导的企业级 RAG 精排场景",
    contextWindow: "32K",
    pricing: "",
    status: "online",
    category: "reranker",
    speed: "fast",
    addedAt: "2026-03-10",
    tags: ["重排序", "中文", "精度优化"],
  },
  {
    id: "qwen3-vl-reranker-2b",
    name: "qwen3-vl-reranker-2b",
    provider: "通义千问",
    shortDescription: "多模态重排序，图文混合检索跨模态精排",
    description: "多模态重排序模型，可对图文混合检索结果进行跨模态精排，在图文交错文档、产品图搜索等场景中显著提升排序质量",
    contextWindow: "8K",
    pricing: "",
    status: "online",
    category: "reranker",
    speed: "fast",
    addedAt: "2026-03-10",
    tags: ["图文重排", "多模态", "精度优化"],
  },
];

export const categoryLabels: Record<Model["category"], string> = {
  flagship: "全能旗舰",
  chat: "文本生成",
  vision: "视觉理解",
  embedding: "向量嵌入",
  reranker: "重排序",
};

export const statusLabels: Record<Model["status"], string> = {
  online: "在线",
  offline: "离线",
  maintenance: "维护中",
  exclusive: "独占",
  unstable: "非稳定",
};

// bg colours are computed as: hex @ 10% opacity on white (#fff)
// = Math.round(hex_channel * 0.1 + 255 * 0.9)
export const providerColors: Record<string, { bg: string; text: string; initial: string }> = {
  "通义千问": { bg: "bg-[#eeebfb]", text: "text-[#6c54d4]", initial: "千" },   // #6c54d4 10%
  Google:    { bg: "bg-[#e8f0fe]", text: "text-[#4285f4]", initial: "G"   },   // #4285f4 10%
  DeepSeek:  { bg: "bg-[#eaecfe]", text: "text-[#5c67f7]", initial: "D"   },   // #5c67f7 10%
  "智谱AI":  { bg: "bg-[#e9ecfb]", text: "text-[#4060e0]", initial: "智"  },   // #4060e0 10%
  BAAI:      { bg: "bg-[#e8e8e8]", text: "text-[#333333]", initial: "B"   },   // #222 10%
};

export const categoryColors: Record<Model["category"], string> = {
  flagship: "bg-purple-50 text-purple-700",
  chat: "bg-blue-50 text-blue-600",
  vision: "bg-amber-50 text-amber-700",
  embedding: "bg-emerald-50 text-emerald-600",
  reranker: "bg-pink-50 text-pink-600",
};

export const categoryIcons: Record<Model["category"], string> = {
  flagship: "✦",
  chat: "T",
  vision: "◎",
  embedding: "⊕",
  reranker: "⇅",
};

export const tagColors: Record<string, string> = {
  "多模态": "bg-purple-50 text-purple-600",
  "代码": "bg-blue-50 text-blue-600",
  "推理": "bg-indigo-50 text-indigo-600",
  "中文": "bg-red-50 text-red-600",
  "长文本": "bg-teal-50 text-teal-600",
  "多语言": "bg-cyan-50 text-cyan-600",
  "高速": "bg-green-50 text-green-600",
  "视觉": "bg-amber-50 text-amber-600",
  "稳定": "bg-gray-100 text-gray-600",
  "思维链": "bg-violet-50 text-violet-600",
  "复杂问题": "bg-indigo-50 text-indigo-600",
  "图像理解": "bg-amber-50 text-amber-600",
  "文档解析": "bg-orange-50 text-orange-600",
  "语义搜索": "bg-emerald-50 text-emerald-600",
  "RAG": "bg-teal-50 text-teal-600",
  "图文检索": "bg-amber-50 text-amber-600",
  "重排序": "bg-pink-50 text-pink-600",
  "精度优化": "bg-rose-50 text-rose-600",
  "图文重排": "bg-orange-50 text-orange-600",
  "稠密": "bg-teal-50 text-teal-600",
  "MoE": "bg-orange-50 text-orange-600",
  "数学": "bg-indigo-50 text-indigo-600",
  "指令遵循": "bg-sky-50 text-sky-600",
};

export const badgeStyle: Record<string, string> = {
  "推荐": "bg-[#fce9e2] text-[#c96442]",   // #da7757 @ 10% on white → explicit hex
  "热门": "bg-amber-100 text-amber-700",
  "新上线": "bg-green-100 text-green-700",
  "蒸馏": "bg-violet-100 text-violet-700",
  "大参数": "bg-blue-100 text-blue-700",
  "稠密": "bg-teal-100 text-teal-700",
  "MoE": "bg-orange-100 text-orange-700",
};

// Notification data
export interface NotificationItem {
  id: string;
  type: "online" | "offline" | "maintenance" | "info";
  title: string;
  description: string;
  date: string;
  isNew?: boolean;
}

export const notifications: NotificationItem[] = [
  { id: "1", type: "online", title: "qwen3.5-35b / 9b 已上线", description: "Qwen3.5 系列模型已接入，支持 128K 上下文窗口。", date: "2026-03-20", isNew: true },
  { id: "2", type: "online", title: "gemma4-26b 已上线", description: "Google 最新原生多模态旗舰模型已可用。", date: "2026-03-15", isNew: true },
  { id: "3", type: "online", title: "向量模型批量接入", description: "qwen3-embedding-8b、qwen3-reranker-8b 等向量模型已上线。", date: "2026-03-10", isNew: true },
  { id: "4", type: "online", title: "glm4.7-flash-30b 已上线", description: "智谱 AI 原生多模态高速推理模型已接入。", date: "2026-03-01" },
  { id: "5", type: "online", title: "deepseek-r1-distill-32b 已上线", description: "DeepSeek 深度推理蒸馏模型已可用。", date: "2026-02-15" },
  { id: "6", type: "online", title: "qwen2.5-vl-7b 已上线", description: "Qwen 视觉语言模型已接入，支持图像理解。", date: "2026-02-01" },
  { id: "7", type: "online", title: "deepseek-v3 已上线", description: "国��代码能力最强模型，已通过安全审核。", date: "2026-01-10" },
  { id: "8", type: "info", title: "API 格式升级", description: "所有模型全面支持 OpenAI 兼容格式。", date: "2025-12-20" },
];