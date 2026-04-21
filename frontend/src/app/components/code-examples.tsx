import { useState, useEffect, useRef } from "react";
import { Play, Square, Info, ImageIcon, Layers, RotateCcw, Code2 } from "lucide-react";
import { CodeBlock } from "./code-block";

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

// ── Basic Chat ─────────────────────────────────────────────────────────────
const PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="qwen3.5-35b",
    messages=[
        {"role": "system", "content": "你是一个有帮助的助手。"},
        {"role": "user",   "content": "请解释什么是大语言模型？"}
    ],
    temperature=0.7,
    max_tokens=1024,
    # ── 仅限 qwen3.5 系列：思考模式控制 ─────────────────────
    # 默认为思考模式（不传 extra_body 或 enable_thinking=True）
    # 传入以下参数可切换为非思考模式（关闭推理链输出）：
    # extra_body={"chat_template_kwargs": {"enable_thinking": False}},
)

print(response.choices[0].message.content)`;

const CURL = `curl -X POST ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-35b",
    "messages": [
      {"role": "system", "content": "你是一个有帮助的助手。"},
      {"role": "user",   "content": "请解释什么是大语言模型？"}
    ],
    "temperature": 0.7,
    "max_tokens": 1024
  }'`;

const NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

const response = await client.chat.completions.create({
  model: 'qwen3.5-35b',
  messages: [
    { role: 'system', content: '你是一个有帮助的助手。' },
    { role: 'user',   content: '请解释什么是大语言模型？' },
  ],
  temperature: 0.7,
  max_tokens: 1024,
});

console.log(response.choices[0].message.content);`;

// ── Stream ─────────────────────────────────────────────────────────────────
const STREAM_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

stream = client.chat.completions.create(
    model="qwen3.5-35b",
    messages=[{"role": "user", "content": "用 100 字介绍深度学习"}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)`;

const STREAM_CURL = `curl -X POST ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: text/event-stream" \\
  -d '{
    "model": "qwen3.5-35b",
    "messages": [
      {"role": "user", "content": "用 100 字介绍深度学习"}
    ],
    "stream": true
  }'

# 每个数据块格式为 SSE：
# data: {"choices":[{"delta":{"content":"..."},...}]}
# data: [DONE]`;

const STREAM_NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

const stream = await client.chat.completions.create({
  model: 'qwen3.5-35b',
  messages: [{ role: 'user', content: '用 100 字介绍深度学习' }],
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}`;

// ── Image Input ────────────────────────────────────────────────────────────
const IMAGE_PYTHON = `import base64
from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

with open("image.png", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

response = client.chat.completions.create(
    model="qwen3.5-35b",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "请描述这张图片的内容"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{img_b64}"
                    }
                }
            ]
        }
    ],
    max_tokens=1024,
)

print(response.choices[0].message.content)`;

const IMAGE_CURL = `# 先将图片编码为 base64
IMG_B64=$(base64 -i image.png | tr -d '\\n')

curl -X POST ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"model\\": \\"qwen3.5-35b\\",
    \\"messages\\": [
      {
        \\"role\\": \\"user\\",
        \\"content\\": [
          {\\"type\\": \\"text\\", \\"text\\": \\"请描述这张图片的内容\\"},
          {
            \\"type\\": \\"image_url\\",
            \\"image_url\\": {
              \\"url\\": \\"data:image/png;base64,\${IMG_B64}\\"
            }
          }
        ]
      }
    ],
    \\"max_tokens\\": 1024
  }"`;

const IMAGE_NODEJS = `import fs from 'fs';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

const imgB64 = fs.readFileSync('image.png').toString('base64');

const response = await client.chat.completions.create({
  model: 'qwen3.5-35b',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '请描述这张图片的内容' },
        {
          type: 'image_url',
          image_url: {
            url: \`data:image/png;base64,\${imgB64}\`,
          },
        },
      ],
    },
  ],
  max_tokens: 1024,
});

console.log(response.choices[0].message.content);`;

// ── Tool Call ──────────────────────────────────────────────────────────────
const TOOL_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

# 定义工具列表
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的实时天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称，如：北京"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "温度单位"
                    }
                },
                "required": ["city"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="qwen3.5-35b",
    messages=[{"role": "user", "content": "北京今天天气如何？"}],
    tools=tools,
    tool_choice="auto",
)

tool_call = response.choices[0].message.tool_calls[0]
print(f"函数名: {tool_call.function.name}")
print(f"参数:   {tool_call.function.arguments}")`;

const TOOL_CURL = `curl -X POST ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-35b",
    "messages": [
      {"role": "user", "content": "北京今天天气如何？"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "获取指定城市的实时天气信息",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {
                "type": "string",
                "description": "城市名称，如：北京"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "温度单位"
              }
            },
            "required": ["city"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'`;

const TOOL_NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

// 定义工具列表
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的实时天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如：北京',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: '温度单位',
          },
        },
        required: ['city'],
      },
    },
  },
];

const response = await client.chat.completions.create({
  model: 'qwen3.5-35b',
  messages: [{ role: 'user', content: '北京今天天气如何？' }],
  tools,
  tool_choice: 'auto',
});

const toolCall = response.choices[0].message.tool_calls[0];
console.log('函数名:', toolCall.function.name);
console.log('参数:  ', toolCall.function.arguments);`;

// ── Embedding ──────────────────────────────────────────────────────────────
const EMBEDDING_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

# 单条文本向量化
response = client.embeddings.create(
    model="bge-m3",        # 或 qwen3-embedding-8b
    input="深度学习是机器学习的一个分支",
    encoding_format="float",
)

vector = response.data[0].embedding
print(f"向量维度: {len(vector)}")
print(f"前5维: {vector[:5]}")

# 批量文本向量化
texts = [
    "深度学习是机器学习的一个分支",
    "大语言模型改变了NLP领域",
    "Transformer架构于2017年提出",
]
response = client.embeddings.create(
    model="bge-m3",
    input=texts,
    encoding_format="float",
)
vectors = [d.embedding for d in response.data]
print(f"批量向量数量: {len(vectors)}")`;

const EMBEDDING_CURL = `# 单条文本向量化
curl -X POST ${BASE_URL}/v1/embeddings \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "bge-m3",
    "input": "深度学习是机器学习的一个分支",
    "encoding_format": "float"
  }'

# 批量文本向量化
curl -X POST ${BASE_URL}/v1/embeddings \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "bge-m3",
    "input": [
      "深度学习是机器学习的一个分支",
      "大语言模型改变了NLP领域",
      "Transformer架构于2017年提出"
    ],
    "encoding_format": "float"
  }'`;

const EMBEDDING_NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

// 单条文本向量化
const single = await client.embeddings.create({
  model: 'bge-m3',   // 或 qwen3-embedding-8b
  input: '深度学习是机器学习的一个分支',
  encoding_format: 'float',
});
const vector = single.data[0].embedding;
console.log('向量维度:', vector.length);

// 批量文本向量化
const batch = await client.embeddings.create({
  model: 'bge-m3',
  input: [
    '深度学习是机器学习的一个分支',
    '大语言模型改变了NLP领域',
    'Transformer架构于2017年提出',
  ],
  encoding_format: 'float',
});
const vectors = batch.data.map(d => d.embedding);
console.log('批量向量数量:', vectors.length);`;

// ── Reranker ───────────────────────────────────────────────────────────────
const RERANKER_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

# BGE-Reranker 通过 chat 接口调用，使用固定提示词格式：
# "<query>{query}</query><passage>{text}</passage>"
# 模型输出 "Yes" / "No" 表示相关 / 不相关（取 Yes token 的 logit 作为分数）

query = "深度学习的应用场景有哪些？"
passages = [
    "深度学习广泛应用于图像识别、语音识别和自然语言处理等领域",
    "今天天气晴朗，适合户外运动",
    "卷积神经网络在计算机视觉任务上取得了突破性进展",
    "股票市场今日下跌，投资者情绪谨慎",
]

def rerank_score(query: str, passage: str) -> float:
    """获取单个 passage 的相关性得分（logprob of Yes token）"""
    resp = client.chat.completions.create(
        model="bge-reranker",
        messages=[{
            "role": "user",
            "content": f"<query>{query}</query><passage>{passage}</passage>"
        }],
        max_tokens=1,
    )
    # 简化版：直接取输出内容（Yes=相关，No=不相关）
    return 1.0 if resp.choices[0].message.content.strip().lower() == "yes" else 0.0

# 批量重排序
results = []
for i, passage in enumerate(passages):
    score = rerank_score(query, passage)
    results.append({"index": i, "score": score, "text": passage[:30] + "..."})

# 按分数降序排列
results.sort(key=lambda x: x["score"], reverse=True)
for r in results:
    print(f"[{r['score']:.2f}] {r['text']}")`;

const RERANKER_CURL = `# BGE-Reranker 通过 chat 接口调用
# 格式：<query>{查询}</query><passage>{文本}</passage>
curl -X POST ${BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "bge-reranker",
    "messages": [
      {
        "role": "user",
        "content": "<query>深度学习的应用场景有哪些？</query><passage>深度学习广泛应用于图像识别、语音识别和自然语言处理等领域</passage>"
      }
    ],
    "max_tokens": 1
  }'

# 返回 "Yes"（相关）或 "No"（不相关）
# 通过对多个 passage 评分后排序实现重排序`;

const RERANKER_NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

const query = '深度学习的应用场景有哪些？';
const passages = [
  '深度学习广泛应用于图像识别、语音识别和自然语言处理等领域',
  '今天天气晴朗，适合户外运动',
  '卷积神经网络在计算机视觉任务上取得了突破性进展',
];

async function rerankScore(query: string, passage: string): Promise<number> {
  const resp = await client.chat.completions.create({
    model: 'bge-reranker',
    messages: [{
      role: 'user',
      content: \`<query>\${query}</query><passage>\${passage}</passage>\`,
    }],
    max_tokens: 1,
  });
  return resp.choices[0].message.content?.trim().toLowerCase() === 'yes' ? 1.0 : 0.0;
}

// 批量重排序
const scored = await Promise.all(
  passages.map(async (p, i) => ({
    index: i,
    score: await rerankScore(query, p),
    text: p.slice(0, 30) + '...',
  }))
);

scored.sort((a, b) => b.score - a.score);
scored.forEach(r => console.log(\`[\${r.score.toFixed(2)}] \${r.text}\`));`;

// ── 代码补全 (Text Completions) ─────────────────────────────────────────────
const FIM_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE_URL}/v1",
    api_key="YOUR_API_KEY",
)

# 代码补全：将光标前的代码作为 prompt，模型续写后续内容
# 使用 /v1/completions 接口（不是 /v1/chat/completions）
response = client.completions.create(
    model="qwen3.5-35b",
    prompt="def fibonacci(n: int) -> int:\\n    if n <= 1:\\n        return n\\n    ",
    max_tokens=128,
    temperature=0.2,
    stop=["\\n\\n"],
)

print(response.choices[0].text)

# ── 流式代码补全 ───────────────────────────────────────────────────────────
stream = client.completions.create(
    model="qwen3.5-35b",
    prompt="import numpy as np\\n\\ndef cosine_similarity(a, b):\\n    ",
    max_tokens=128,
    temperature=0.1,
    stream=True,
)

for chunk in stream:
    text = chunk.choices[0].text
    if text:
        print(text, end="", flush=True)`;

const FIM_CURL = `# 代码补全（非流式）
# 注意：使用 /v1/completions，不是 /v1/chat/completions
curl -X POST ${BASE_URL}/v1/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.5-35b",
    "prompt": "def fibonacci(n: int) -> int:\\n    if n <= 1:\\n        return n\\n    ",
    "max_tokens": 128,
    "temperature": 0.2,
    "stop": ["\\n\\n"]
  }'

# 流式代码补全
curl -X POST ${BASE_URL}/v1/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: text/event-stream" \\
  -d '{
    "model": "qwen3.5-35b",
    "prompt": "import numpy as np\\n\\ndef cosine_similarity(a, b):\\n    ",
    "max_tokens": 128,
    "temperature": 0.1,
    "stream": true
  }'`;

const FIM_NODEJS = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${BASE_URL}/v1',
  apiKey:  'YOUR_API_KEY',
});

// 代码补全（非流式）
// 使用 completions.create，不是 chat.completions.create
const response = await client.completions.create({
  model: 'qwen3.5-35b',
  prompt: 'def fibonacci(n: int) -> int:\\n    if n <= 1:\\n        return n\\n    ',
  max_tokens: 128,
  temperature: 0.2,
  stop: ['\\n\\n'],
});
console.log(response.choices[0].text);

// 流式代码补全
const stream = await client.completions.create({
  model: 'qwen3.5-35b',
  prompt: 'import numpy as np\\n\\ndef cosine_similarity(a, b):\\n    ',
  max_tokens: 128,
  temperature: 0.1,
  stream: true,
});

for await (const chunk of stream) {
  const text = chunk.choices[0]?.text;
  if (text) process.stdout.write(text);
}`;

// ── Per-tab lookup tables ──────────────────────────────────────────────────
const tabs = [
  { key: "python", label: "Python",  lang: "python"     },
  { key: "curl",   label: "cURL",    lang: "bash"       },
  { key: "nodejs", label: "Node.js", lang: "javascript" },
] as const;

type TabKey = "python" | "curl" | "nodejs";

const tabCode: Record<TabKey, string>     = { python: PYTHON,       curl: CURL,        nodejs: NODEJS        };
const tabFile: Record<TabKey, string>     = { python: "example.py", curl: "example.sh",nodejs: "example.mjs" };
const tabLang: Record<TabKey, "python" | "bash" | "javascript"> = {
  python: "python", curl: "bash", nodejs: "javascript",
};

const streamCode: Record<TabKey, string>  = { python: STREAM_PYTHON, curl: STREAM_CURL, nodejs: STREAM_NODEJS };
const streamFile: Record<TabKey, string>  = { python: "stream.py",   curl: "stream.sh", nodejs: "stream.mjs"  };

const imageCode: Record<TabKey, string>   = { python: IMAGE_PYTHON,  curl: IMAGE_CURL,  nodejs: IMAGE_NODEJS  };
const imageFile: Record<TabKey, string>   = { python: "vision.py",   curl: "vision.sh", nodejs: "vision.mjs"  };

const toolCode: Record<TabKey, string>    = { python: TOOL_PYTHON,   curl: TOOL_CURL,   nodejs: TOOL_NODEJS   };
const toolFile: Record<TabKey, string>    = { python: "tool_call.py",curl: "tool_call.sh",nodejs: "tool_call.mjs" };

const embeddingCode: Record<TabKey, string> = { python: EMBEDDING_PYTHON, curl: EMBEDDING_CURL, nodejs: EMBEDDING_NODEJS };
const embeddingFile: Record<TabKey, string> = { python: "embedding.py", curl: "embedding.sh", nodejs: "embedding.mjs" };

const rerankerCode: Record<TabKey, string>  = { python: RERANKER_PYTHON, curl: RERANKER_CURL, nodejs: RERANKER_NODEJS };
const rerankerFile: Record<TabKey, string>  = { python: "reranker.py", curl: "reranker.sh", nodejs: "reranker.mjs" };

const fimCode: Record<TabKey, string>       = { python: FIM_PYTHON, curl: FIM_CURL, nodejs: FIM_NODEJS };
const fimFile: Record<TabKey, string>       = { python: "fim.py", curl: "fim.sh", nodejs: "fim.mjs" };

type SectionKey = "chat" | "embedding" | "fim";
const sections: { key: SectionKey; label: string; icon: "chat" | "embed" | "fim" }[] = [
  { key: "chat",      label: "Chat / 对话",       icon: "chat" },
  { key: "embedding", label: "Embedding / Reranker", icon: "embed" },
  { key: "fim",       label: "代码补全 / Completions", icon: "fim" },
];

// ── Stream demo text ───────────────────────────────────────────────────────
// Use a template literal so Chinese quotation marks (\u201C\u201D) inside the
// text are never mistaken for JS string delimiters by the Babel parser.
const streamFull = `MoE (Mixture of Experts) 是一种稀疏激活的神经网络架构。` +
  `它通过将模型参数拆分为多个独立的专家网络（Experts），` +
  `并引入一个门控网络（Gating Network）来实现高效能。\n\n` +
  `在推理过程中，门控网络根据输入数据的特征，动态地仅激活少数几个最相关的专家进行计算，` +
  `而非运行全部参数。` +
  `这种动态路由机制使得模型能在保持计算量（FLOPs）相对恒定的前提下，` +
  `极大地扩展参数总量，从而在实现万亿级参数规模的同时，兼顾推理速度与预测精度。`;

// ── Component ──────────────────────────────────────────────────────────────
export function CodeExamples() {
  const [activeTab, setActiveTab] = useState<TabKey>("python");
  const [activeSection, setActiveSection] = useState<SectionKey>("chat");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [rightHovered, setRightHovered] = useState(false);
  const [isLg, setIsLg] = useState(false);
  const idxRef   = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsLg(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auto-scroll stream box as text arrives
  useEffect(() => {
    if (streamBoxRef.current) {
      streamBoxRef.current.scrollTop = streamBoxRef.current.scrollHeight;
    }
  }, [streamText]);

  const startStream = () => {
    if (streaming) { stopStream(); return; }
    setStreaming(true);
    setStreamText("");
    idxRef.current = 0;
    timerRef.current = setInterval(() => {
      if (idxRef.current >= streamFull.length) { stopStream(); return; }
      const n = Math.floor(Math.random() * 4) + 1;
      setStreamText((p) => p + streamFull.slice(idxRef.current, idxRef.current + n));
      idxRef.current += n;
    }, 22);
  };

  const stopStream = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStreaming(false);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const monoFont = { fontFamily: "'JetBrains Mono', monospace" };
  const lang = tabLang[activeTab];

  // Column widths: right hover → right expands, left shrinks
  const leftBasis  = isLg ? (rightHovered ? "36%" : "59%") : "100%";
  const rightBasis = isLg ? (rightHovered ? "60%" : "37%") : "100%";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-enter">
        <h1 className="text-[28px] sm:text-[34px] text-foreground">调用示例</h1>
        <p className="text-muted-foreground text-[14px] mt-1.5">全部接口兼容 OpenAI 格式，支持官方 SDK 直接接入</p>
      </div>

      {/* Tip */}
      <div
        className="animate-enter anim-delay-1 bg-accent rounded-xl p-4 flex gap-3"
      >
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[13px] text-foreground/70 leading-relaxed">
          将 <code className="bg-white/60 px-1.5 py-0.5 rounded" style={monoFont}>base_url</code> 设为{" "}
          <code className="bg-white/60 px-1.5 py-0.5 rounded" style={monoFont}>{BASE_URL}</code>，
          将 <code className="bg-white/60 px-1.5 py-0.5 rounded ml-1" style={monoFont}>YOUR_API_KEY</code> 替换为申请到的 Key，即可使用 openai SDK 直接调用。
        </p>
      </div>

      {/* ── Section switcher ── */}
      <div className="animate-enter anim-delay-2 flex items-center gap-1 bg-secondary/60 rounded-xl p-1 w-fit">
        {sections.map((s) => {
          const Icon = s.icon === "chat" ? Info : s.icon === "embed" ? Layers : Code2;
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`btn-tap flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] transition-all ${
                activeSection === s.key
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={activeSection === s.key ? { fontWeight: 500 } : {}}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Shared language tab switcher ── */}
      <div className="animate-enter anim-delay-2 flex items-center gap-1 bg-secondary/60 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`btn-tap px-4 py-1.5 rounded-lg text-[13px] transition-all ${
              activeTab === t.key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={activeTab === t.key ? { fontWeight: 500 } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ CHAT section ══════════════════════════════════════════════════════ */}
      {activeSection === "chat" && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* LEFT col */}
          <div
            className="w-full lg:min-w-0 space-y-5"
            style={{ flexBasis: leftBasis, transition: "flex-basis 0.38s cubic-bezier(0.25,0.1,0.25,1)" }}
          >
            <div className="animate-enter">
              <div key={activeTab + "_basic"} className="animate-enter">
                <CodeBlock code={tabCode[activeTab]} lang={lang} label={tabFile[activeTab]} />
              </div>
            </div>
            <div className="animate-enter">
              <p className="text-[13px] text-foreground/70 mb-3 pl-0.5" style={{ fontWeight: 500 }}>
                工具调用 (Function Calling)
              </p>
              <div key={activeTab + "_tool"} className="animate-enter">
                <CodeBlock code={toolCode[activeTab]} lang={lang} label={toolFile[activeTab]} maxHeight={380} />
              </div>
            </div>
          </div>

          {/* RIGHT col — hover to expand */}
          <div
            className="w-full lg:min-w-0 space-y-5"
            style={{ flexBasis: rightBasis, transition: "flex-basis 0.38s cubic-bezier(0.25,0.1,0.25,1)" }}
            onMouseEnter={() => isLg && setRightHovered(true)}
            onMouseLeave={() => isLg && setRightHovered(false)}
          >
            {/* Multimodal tip banner */}
            <div className="animate-enter bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3.5 flex gap-3">
              <ImageIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] text-amber-800 leading-relaxed">
                  <span style={{ fontWeight: 500 }}>多模态场景提示：</span> 测试环境提供 base64 / HTML / SVG ↔ 图片格式互转服务，可在下述网址通过前端处理，或参考提供的文档使用 API 批处理。
                </p>
                <span className="inline-flex items-center gap-1 mt-1.5 text-[12px] text-amber-700" style={{ fontWeight: 500 }}>
                  请联系平台管理员获取图像转换服务地址
                </span>
              </div>
            </div>

            {/* Stream interactive demo */}
            <div className="animate-enter bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
                <span className="text-[14px]" style={{ fontWeight: 500 }}>流式输出演示</span>
                <button
                  onClick={startStream}
                  className={`btn-tap flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                    streaming ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-[#fce9e2] text-[#c96442] hover:bg-[#fbd7cc]"
                  }`}
                >
                  {streaming ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {streaming ? "停止" : "开始演示"}
                </button>
              </div>
              <div
                ref={streamBoxRef}
                className="p-5 bg-[#faf8f6] overflow-y-auto"
                style={{ minHeight: 160, maxHeight: 280 }}
              >
                {streamText ? (
                  <div className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                    {streamText}
                    {streaming && (
                      <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 align-text-bottom animate-pulse" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[120px] text-[13px] text-muted-foreground/50">
                    点击「开始演示」查看流式输出效果
                  </div>
                )}
              </div>
            </div>

            <div className="animate-enter">
              <p className="text-[13px] text-foreground/70 mb-3 pl-0.5" style={{ fontWeight: 500 }}>流式输出代码</p>
              <div key={activeTab + "_stream"} className="animate-enter">
                <CodeBlock code={streamCode[activeTab]} lang={lang} label={streamFile[activeTab]} />
              </div>
            </div>

            <div className="animate-enter">
              <p className="text-[13px] text-foreground/70 mb-3 pl-0.5" style={{ fontWeight: 500 }}>图片输入示例</p>
              <div key={activeTab + "_image"} className="animate-enter">
                <CodeBlock code={imageCode[activeTab]} lang={lang} label={imageFile[activeTab]} maxHeight={320} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ EMBEDDING / RERANKER section ══════════════════════════════════════ */}
      {activeSection === "embedding" && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* LEFT col — Embedding */}
          <div className="w-full lg:min-w-0 space-y-5" style={{ flexBasis: "50%" }}>
            <div className="animate-enter bg-green-50 border border-green-200/60 rounded-xl px-4 py-3.5 flex gap-3">
              <Layers className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-green-800 leading-relaxed">
                <span style={{ fontWeight: 500 }}>Embedding 模型：</span>将文本转换为浮点向量，可用于语义检索、相似度计算等场景。接口兼容 OpenAI
                {" "}<code className="bg-green-100 px-1 rounded">/v1/embeddings</code>，支持 OpenAI SDK 直接调用。
              </p>
            </div>
            <div className="animate-enter">
              <p className="text-[13px] text-foreground/70 mb-3 pl-0.5" style={{ fontWeight: 500 }}>Embedding 示例</p>
              <div key={activeTab + "_emb"} className="animate-enter">
                <CodeBlock code={embeddingCode[activeTab]} lang={lang} label={embeddingFile[activeTab]} maxHeight={420} />
              </div>
            </div>
          </div>

          {/* RIGHT col — Reranker */}
          <div className="w-full lg:min-w-0 space-y-5" style={{ flexBasis: "50%" }}>
            <div className="animate-enter bg-purple-50 border border-purple-200/60 rounded-xl px-4 py-3.5 flex gap-3">
              <RotateCcw className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-purple-800 leading-relaxed">
                <span style={{ fontWeight: 500 }}>Reranker 模型：</span>对候选文本列表进行相关性重排序。通过
                {" "}<code className="bg-purple-100 px-1 rounded">/v1/chat/completions</code> 接口调用，使用固定提示词格式传入 query 和 passage，模型输出 Yes/No 表示相关性。
              </p>
            </div>
            <div className="animate-enter">
              <p className="text-[13px] text-foreground/70 mb-3 pl-0.5" style={{ fontWeight: 500 }}>Reranker 示例</p>
              <div key={activeTab + "_rerank"} className="animate-enter">
                <CodeBlock code={rerankerCode[activeTab]} lang={lang} label={rerankerFile[activeTab]} maxHeight={420} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ FIM section ═══════════════════════════════════════════════════════ */}
      {activeSection === "fim" && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="w-full space-y-5">
            <div className="animate-enter bg-blue-50 border border-blue-200/60 rounded-xl px-4 py-3.5 flex gap-3">
              <Code2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] text-blue-800 leading-relaxed">
                  <span style={{ fontWeight: 500 }}>代码补全（Text Completions）：</span>
                  将光标前的代码作为 <code className="bg-blue-100 px-1 rounded">prompt</code>，
                  模型续写后续代码内容。使用
                  {" "}<code className="bg-blue-100 px-1 rounded">/v1/completions</code> 接口（不是 /v1/chat/completions），
                  返回值在 <code className="bg-blue-100 px-1 rounded">choices[0].text</code> 字段中。
                </p>
              </div>
            </div>
            <div className="animate-enter">
              <div key={activeTab + "_fim"} className="animate-enter">
                <CodeBlock code={fimCode[activeTab]} lang={lang} label={fimFile[activeTab]} maxHeight={460} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}