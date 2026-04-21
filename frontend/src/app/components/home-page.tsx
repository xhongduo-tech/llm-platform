import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowUp, Box, Code2, Zap, ArrowRight } from "lucide-react";
import { type Model } from "./model-data";
import { useModels } from "./model-context";
import brdcLogo from "../../assets/b4f5eede468480ea703457a9aa6437d3a2beade8.png";
import { ProviderIcon } from "./provider-logos";

/* ── Scenario recommendation rules ──────────────────────────────────── */
interface ScenarioRule { keywords: string[]; modelIds: string[]; reason: string; tips?: string; }

const scenarioRules: ScenarioRule[] = [
  // ── 业务研发 ────────────────────────────────────────────────────────────
  { keywords: ["业务研发","需求开发","功能开发","业务逻辑","微服务","接口开发","后端","springboot","spring","mybatis","java","python","go","golang","restful","api开发","开发任务"], modelIds: ["deepseek-v3","qwen3.5-35b","deepseek-r1-distill-32b"], reason: "针对业务研发场景，推荐以下代码能力强、熟悉主流框架的模型：", tips: "设置 temperature=0 可提升代码确定性；复杂业务逻辑建议先描述数据模型与接口契约再让模型生成代码" },
  { keywords: ["代码","编程","code","开发","编写","debug","调试","程序","sql","函数","接口","单测","重构","review","代码审查"], modelIds: ["deepseek-v3","qwen3.5-35b","deepseek-r1-distill-32b"], reason: "针对代码生成与研发辅助任务，推荐以下模型。deepseek-v3 在 HumanEval、SWE-Bench 等代码基准位居前列；qwen3.5-35b 支持代码推理；deepseek-r1-distill-32b 适合复杂算法设计：", tips: "复杂逻辑可开启 temperature=0 + max_tokens=4096；单元测试生成建议提供函数签名与边界条件" },

  // ── 测试自动化 ────────────────────────────────────────────────────────
  { keywords: ["测试","自动化测试","test","单元测试","集成测试","接口测试","ui测试","e2e","selenium","playwright","pytest","junit","mock","桩","测试用例","测试脚本","缺陷","bug分析","质量"], modelIds: ["deepseek-v3","qwen3.5-35b","qwen3.5-9b"], reason: "针对测试自动化场景，推荐以下模型。可生成测试用例、接口测试脚本、Mock 数据及缺陷分析报告：", tips: "提供接口文档或 Swagger JSON 可让模型直接生成完整测试脚本；缺陷分析建议附上日志与复现步骤" },

  // ── 需求维度 ───────────────────────────────────────────────────────────
  { keywords: ["需求","用户故事","user story","产品","prd","需求文档","原型","功能点","需求分析","业务需求","需求评审","验收标准","ac","acceptance","场景分析","流程梳理","流程图"], modelIds: ["qwen3.5-35b","deepseek-v3","qwen2-72b"], reason: "针对需求分析与文档撰写场景，推荐以下中文写作与结构化能力强的模型：", tips: "提供原始用户反馈或会议纪要，模型可自动提炼用户故事、拆解 AC；temperature=0.3~0.5 保持输出稳定性" },
  { keywords: ["写作","文案","撰写","生成","内容","文章","报告","总结","摘要","润色","文字","邮件","周报","汇报","文稿"], modelIds: ["qwen3.5-35b","qwen2-72b","deepseek-v3"], reason: "对于业务文档写作与内容生成，推荐以下中文表达能力强的模型：", tips: "设置 temperature=0.6~0.8 提升表达多样性；可在 system prompt 中指定写作风格（正式/简洁/汇报体）" },

  // ── 数据运营 ───────────────────────────────────────────────────────────
  { keywords: ["数据运营","数据分析","数据质量","数据治理","指标","kpi","kv","留存","转化","漏斗","ab测","用户行为","埋点","日志分析","点击流","数据探查","数据清洗","etl"], modelIds: ["deepseek-r1-distill-32b","qwen3.5-35b","deepseek-v3"], reason: "针对数据运营与分析场景，推荐以下逻辑推理强、支持 Function Calling 的模型：", tips: "可结合 tools 接口让模型自动调用 SQL 查询；指标分析建议先明确「分子/分母/时间粒度」再让模型解读" },
  { keywords: ["数据","分析","报表","统计","excel","表格","数字","dashboard","可视化","报告","数仓","hive","spark","flink","clickhouse","mysql","postgresql"], modelIds: ["deepseek-r1-distill-32b","qwen3.5-35b","deepseek-v3"], reason: "数据查询、报表生成与数仓任务，推荐以下模型：", tips: "SQL 生成建议提供表结构（CREATE TABLE DDL）；复杂聚合查询可先让模型拆解为子查询步骤" },

  // ── 数据可视化看板 ────────────────────────────────────────────────────
  { keywords: ["可视化","看板","大屏","图表","echarts","d3","图形","折线图","柱状图","饼图","地图","仪表盘","bi","superset","grafana","tableau","可视化方案","前端图表"], modelIds: ["deepseek-v3","qwen3.5-35b","qwen3.5-9b"], reason: "针对数据可视化与大屏看板开发场景，推荐以下前端代码能力强的模型：", tips: "提供数据结构与目标图表类型，模型可直接生成 ECharts option 配置或 React 组件；大屏布局建议描述分辨率与模块数量" },

  // ── RAG / 知识库 ──────────────────────────────────────────────────────
  { keywords: ["rag","知识库","检索增强","向量检索","企业知识","内部文档","文档问答","知识管理","问答系统","语义搜索","文档理解"], modelIds: ["bge-m3","qwen3-embedding-8b","bge-reranker","qwen3-reranker-8b","deepseek-v3","qwen3.5-35b"], reason: "针对 RAG / 知识库场景，推荐以下模型组合：向量化阶段使用 bge-m3 或 qwen3-embedding-8b，精排阶段引入 bge-reranker 提升检索精度，生成阶段推荐 deepseek-v3 或 qwen3.5-35b 进行答案合成：", tips: "建议流程：文档切片 → Embedding → 向量检索 → Reranker 精排 Top-K → LLM 生成" },

  // ── Agent / 工作流 ────────────────────────────────────────────────────
  { keywords: ["agent","自动化","工作流","workflow","任务链","多步骤","规划","执行","调度","流程","function calling","工具调用"], modelIds: ["qwen3.5-35b","deepseek-v3","deepseek-r1-distill-32b"], reason: "针对 Agent 与自动化工作流场景，推荐以下支持 Function Calling 和工具调用的模型：", tips: "善用 tool_choice 参数控制工具调用策略；多步骤任务建议拆解后分轮调用" },

  // ── 结构化输出 ────────────────────────────────────────────────────────
  { keywords: ["提取","抽取","结构化","json","格式化","实体","分类","标注","解析","信息抽取"], modelIds: ["deepseek-v3","qwen3.5-35b","qwen3.5-9b"], reason: "信息提取与结构化输出场景，推荐以下支持 JSON Mode 的模型：", tips: "设置 response_format={\"type\": \"json_object\"} 强制输出合法 JSON；复杂模式可在 prompt 中给出 schema 示例" },

  // ── 推理 / 逻辑分析 ──────────────────────────────────────────────────
  { keywords: ["推理","逻辑","数学","证明","思考","reasoning","复杂","分析","计算","策略","规划","方案设计"], modelIds: ["deepseek-r1-distill-32b","qwen3.5-35b"], reason: "对于深度推理与复杂方案设计，推荐以下模型。deepseek-r1-distill-32b 具备链式思维（CoT）能力；qwen3.5-35b 支持 enable_thinking 参数：", tips: "传入 extra_body={\"enable_thinking\": true} 可激活 qwen3.5 的 Thinking 模式，展示完整推理链路" },

  // ── 向量嵌入 / 语义搜索 ───────────────────────────────────────────────
  { keywords: ["嵌入","向量","embedding","embed","语义","相似度","相似","聚类","召回"], modelIds: ["bge-m3","qwen3-embedding-8b","qwen3-vl-embedding-2b"], reason: "向量嵌入与语义召回场景推荐以下模型：", tips: "调用 /v1/embeddings 接口；输出向量建议 L2 归一化后存入向量库（Milvus/Faiss/Chroma）" },

  // ── 图像 / 多模态 ─────────────────────────────────────────────────────
  { keywords: ["图","图像","图片","视觉","多模态","image","visual","ocr","识别","截图","扫描","pdf","文档图片"], modelIds: ["qwen3.5-35b","gemma4-26b","glm4.7-flash-30b","qwen2.5-vl-7b"], reason: "对于图像理解与文档 OCR 任务，推荐以下支持多模态的模型：", tips: "图片建议转 base64 后通过 image_url.url 字段传入；大批量 OCR 建议拆页并发请求" },

  // ── 高并发 / 低延迟 ───────────────────────────────────────────────────
  { keywords: ["快","速度","延迟","高并发","实时","低延迟","tps","吞吐","流式","streaming"], modelIds: ["qwen3.5-9b","glm4.7-flash-30b","gemma3-27b"], reason: "以下模型推理速度最快，适合高并发与延迟敏感场景（TTFT < 300ms）：", tips: "建议开启 stream=True 流式输出，提升用户体验；max_tokens≤512 可进一步控制延迟" },

  // ── 兜底推荐 ─────────────────────────────────────────────────────────
  { keywords: ["对比","哪个","哪些","区别","差异","比较","选择","推荐","用什么","哪款","怎么选","入门","试试","不知道","随便","第一次"], modelIds: ["qwen3.5-35b","deepseek-v3","deepseek-r1-distill-32b","gemma4-26b"], reason: "以下是当前平台综合能力最强的模型，适合大多数业务研发场景：" },
];

function recommendModels(query: string, models: Model[]) {
  const q = query.toLowerCase();
  for (const rule of scenarioRules) {
    if (rule.keywords.some((kw) => q.includes(kw))) {
      const recommended = rule.modelIds
        .map((id) => models.find((m) => m.id === id))
        .filter((m): m is Model => !!m && m.status !== "offline")
        .slice(0, 5);
      if (recommended.length > 0) return { text: rule.reason, tips: rule.tips, recommended };
    }
  }
  const fallback = models.filter((m) => m.status === "online" && m.category === "chat").slice(0, 4);
  return { text: "以下是推荐的在线模型。您可以输入更具体的场景获得专业推荐：", recommended: fallback };
}

interface Message { id: number; role: "user" | "assistant"; content: string; tips?: string; models?: Model[]; }

const ALL_QUICK_QUESTIONS = [
  "业务接口开发和代码 Review",    "生成自动化测试用例和脚本",
  "需求文档和用户故事拆解",       "数据运营指标分析与报表",
  "ECharts 大屏看板开发",         "数仓 SQL 查询优化",
  "构建内部 RAG 知识库",          "Agent 工作流自动化",
  "结构化 JSON 信息提取",         "高并发低延迟推理场景",
  "测试缺陷定位与原因分析",       "我是第一次用，推荐个模型",
];

export function HomePage() {
  const { models } = useModels();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [questionPage, setQuestionPage] = useState(0);
  const [questionVisible, setQuestionVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Cycle quick questions every 5s (CSS fade, no JS animation)
  useEffect(() => {
    if (messages.length > 0) return;
    const timer = setInterval(() => {
      setQuestionVisible(false);
      setTimeout(() => { setQuestionPage((p) => (p + 1) % 2); setQuestionVisible(true); }, 280);
    }, 5000);
    return () => clearInterval(timer);
  }, [messages.length]);

  const visibleQuestions = ALL_QUICK_QUESTIONS.slice(questionPage * 4, questionPage * 4 + 4);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: text }]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      const result = recommendModels(text, models);
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: result.text, tips: result.tips, models: result.recommended }]);
      setIsTyping(false);
    }, 500 + Math.random() * 400);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const hasMessages = messages.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 140px)" }}>
      {/* Hero header */}
      <div className="animate-fade" style={{
        textAlign: "center",
        paddingBottom: hasMessages ? "20px" : "24px",
        paddingTop: hasMessages ? "8px" : undefined,
        flex: hasMessages ? undefined : "1",
        display: hasMessages ? undefined : "flex",
        flexDirection: "column" as const,
        justifyContent: hasMessages ? undefined : "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "12px" }}>
          <img src={brdcLogo} alt="BRDC.ai" style={{ width: hasMessages ? "28px" : "40px", height: hasMessages ? "28px" : "40px", objectFit: "contain", transition: "width 0.3s, height 0.3s" }} />
          <h1 style={{
            fontWeight: 600, color: "var(--foreground)",
            fontSize: hasMessages ? "22px" : (typeof CSS !== "undefined" && CSS.supports("font-size", "clamp(1px,1vw,2px)") ? "clamp(26px, 4vw, 36px)" : "30px"),
            transition: "font-size 0.3s",
          }}>
            你想用哪个模型？
          </h1>
        </div>
        {!hasMessages && (
          <p style={{ fontSize: "15px", color: "var(--muted-foreground)" }}>
            描述你的需求，我来帮你找到最合适的大语言模型
          </p>
        )}
      </div>

      {/* Chat + input column */}
      <div style={{ maxWidth: "680px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Messages */}
        {hasMessages && (
          <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {messages.map((msg) => (
              <div key={msg.id} className="animate-enter"
                style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "user" ? (
                  <div style={{
                    background: "var(--foreground)", color: "var(--background)",
                    padding: "12px 20px", borderRadius: "20px 20px 4px 20px",
                    maxWidth: "80%", fontSize: "14px", lineHeight: 1.55,
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: "100%", width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{
                      background: "#ffffff", padding: "16px 20px",
                      borderRadius: "20px 20px 20px 4px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      fontSize: "14px", color: "rgba(26,22,19,0.8)", lineHeight: 1.65,
                      border: "1px solid var(--border)",
                    }}>
                      {msg.content}
                    </div>
                    {msg.tips && (
                      <div style={{ background: "#f0ece7", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", color: "rgba(26,22,19,0.55)", lineHeight: 1.65, display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ color: "#c96442", flexShrink: 0, marginTop: "1px" }}>💡</span>
                        <span>{msg.tips}</span>
                      </div>
                    )}
                    {msg.models && msg.models.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {msg.models.map((m, i) => (
                          <div key={m.id} className={`animate-enter anim-delay-${Math.min(i, 7)}`}
                            style={{
                              background: "#ffffff", borderRadius: "14px",
                              padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                              border: "1px solid rgba(0,0,0,0.07)",
                              transition: "box-shadow 0.15s",
                            }}>
                            <ProviderIcon provider={m.provider} size="md" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                              <div style={{ fontSize: "12px", color: "var(--muted-foreground)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
                                <span>{m.provider}</span>
                                <span style={{ opacity: 0.3 }}>·</span>
                                <span>{m.contextWindow}</span>
                                <span style={{ opacity: 0.3 }}>·</span>
                                <span className={m.status === "online" ? "dot-green" : "dot-gray"} />
                                <span>{m.status === "online" ? "在线" : "离线"}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => navigate(`/apply?model=${encodeURIComponent(m.id)}`)}
                              style={{
                                flexShrink: 0, display: "flex", alignItems: "center", gap: "4px",
                                fontSize: "11px", fontWeight: 500, padding: "6px 10px",
                                borderRadius: "8px", border: "none", cursor: "pointer",
                                color: "#c96442", background: "#fdf4f0",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#fce9e2")}
                              onMouseLeave={e => (e.currentTarget.style.background = "#fdf4f0")}
                            >
                              申请 <ArrowRight style={{ width: "11px", height: "11px" }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator — CSS animation, no JS */}
            {isTyping && (
              <div className="animate-fade" style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  background: "#ffffff", padding: "12px 18px",
                  borderRadius: "20px 20px 20px 4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: "5px",
                }}>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick questions — CSS opacity transition */}
        {!hasMessages && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px",
            opacity: questionVisible ? 1 : 0,
            transition: "opacity 0.25s ease",
          }}>
            {visibleQuestions.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                style={{
                  padding: "10px 14px", background: "#ffffff", borderRadius: "12px",
                  fontSize: "13px", color: "var(--muted-foreground)", textAlign: "left",
                  lineHeight: 1.45, border: "none", cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  transition: "box-shadow 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--foreground)"; e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="animate-fade">
          <div style={{
            position: "relative", background: "#ffffff",
            borderRadius: "16px", border: "1px solid var(--border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            transition: "box-shadow 0.2s, border-color 0.2s",
          }}
            onFocusCapture={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(218,119,87,0.3)"; }}
            onBlurCapture={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="描述你的使用场景，例如：我需要一个写代码的模型..."
              style={{
                width: "100%", padding: "16px 56px 16px 20px",
                background: "transparent", fontSize: "14px", outline: "none",
                borderRadius: "16px", color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
            <button type="submit" disabled={!input.trim() || isTyping}
              style={{
                position: "absolute", right: "10px", top: "50%",
                transform: "translateY(-50%)",
                width: "36px", height: "36px", borderRadius: "10px",
                background: "var(--foreground)", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: (!input.trim() || isTyping) ? 0.2 : 1,
                transition: "opacity 0.15s",
              }}>
              <ArrowUp style={{ width: "15px", height: "15px", color: "var(--background)" }} />
            </button>
          </div>
        </form>
      </div>

      {/* Quick links */}
      {!hasMessages && (
        <div className="animate-fade anim-delay-3"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", maxWidth: "900px", margin: "40px auto 0", width: "100%" }}>
          {[
            { to: "/models", Icon: Box,   label: "浏览模型清单", desc: "查看全部已接入模型与详细信息" },
            { to: "/apply",  Icon: Zap,   label: "申请 API Key", desc: "填写信息、选择模型，快速获取权限" },
            { to: "/examples",Icon: Code2, label: "查看调用示例", desc: "Python / cURL / Node.js 多语言代码" },
          ].map((c) => (
            <Link key={c.to} to={c.to}
              style={{
                display: "block", background: "#ffffff", borderRadius: "16px",
                padding: "22px 24px", border: "1px solid rgba(0,0,0,0.07)",
                textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                transition: "box-shadow 0.18s, border-color 0.18s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.07)"; }}
            >
              <c.Icon style={{ width: "18px", height: "18px", color: "var(--muted-foreground)", marginBottom: "14px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--foreground)" }}>{c.label}</span>
                <ArrowRight style={{ width: "13px", height: "13px", color: "var(--muted-foreground)", opacity: 0.5 }} />
              </div>
              <p style={{ fontSize: "13px", color: "var(--muted-foreground)", lineHeight: 1.55 }}>{c.desc}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="animate-fade anim-delay-4" style={{ textAlign: "center", padding: "32px 0 8px" }}>
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", opacity: 0.6 }}>
          2026 大数据应用部 | brdc.ai 人工智能小组 提供服务
        </p>
      </footer>
    </div>
  );
}
