import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Power, PowerOff, X, Loader2, Search, Lock,
  Database, Users, Bell, Edit2, Check, Download, RefreshCw,
  BarChart2, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  TrendingUp, Activity, Key, Server, Cpu, HardDrive, Layers,
  Pin, MessageSquare, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { type Model, categoryLabels, statusLabels, type NotificationItem } from "./model-data";
import { useModels } from "./model-context";
import { toast } from "sonner";
import { ProviderIcon } from "./provider-logos";

// ── Clipboard helper ───────────────────────────────────────────────────────
function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(el);
  el.focus(); el.select();
  try { document.execCommand("copy"); } catch { /* silent */ }
  document.body.removeChild(el);
}

// ── CSV export helper ──────────────────────────────────────────────────────
function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── API helpers ────────────────────────────────────────────────────────────
const API_BASE = "";
function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ── Time formatting ────────────────────────────────────────────────────────
// Backend timestamps are UTC but lack a timezone designator.
// Append 'Z' so JS Date correctly converts UTC → local before display.
function fmtTime(iso: string, showSeconds = false) {
  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return showSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

type Tab = "dashboard" | "infra" | "models" | "users" | "forum" | "notifications" | "usage";

// ── Static infrastructure data ────────────────────────────────────────────
interface ServerNode {
  ip: string;
  totalUnits: number;       // total GPU cards (A100) or physical nodes (V100)
  displayUnit: string;      // "GPU卡" | "节点"
  gpuModel: string;
  gpuMem: string;
  gpuType: string;
  note?: string;
  reservedUnits?: number;   // reserved for non-serving use
  reservedNote?: string;    // reason for reservation
  forceUsedUnits?: number;  // override calculated usage (for shared-node servers)
  sharedAnnotation?: string;// human-readable sharing note
}

interface ModelDeployment {
  modelId: string;
  serverIp: string | null;
  units: number;
  deployNote: string;
  quantization: string;
  archType: "MoE" | "Dense" | "Embedding" | "Reranker" | "VLM" | "Other";
  activeParams: string;
  concurrency?: number;
  hosted: "self" | "external"; // self = 自部署, external = 智涌
}

const SERVERS: ServerNode[] = [
  {
    ip: "73.16.126.154",
    totalUnits: 8,
    displayUnit: "GPU卡",
    gpuModel: "NVIDIA A100",
    gpuMem: "40G",
    gpuType: "PCIE",
    note: "主力推理节点 (4节点×2卡)",
    reservedUnits: 2,
    reservedNote: "模测保留",
  },
  {
    ip: "73.34.30.156",
    totalUnits: 2,
    displayUnit: "节点",
    gpuModel: "NVIDIA V100",
    gpuMem: "32G",
    gpuType: "SXM2",
    note: "Embedding / Reranker 专用",
    forceUsedUnits: 2,
    sharedAnnotation: "3 Embedding + 3 Reranker 共享 2 节点",
  },
  {
    ip: "73.34.30.157",
    totalUnits: 2,
    displayUnit: "节点",
    gpuModel: "NVIDIA V100",
    gpuMem: "32G",
    gpuType: "SXM2",
    note: "视觉 / 补充推理",
  },
];

const MODEL_DEPLOYMENTS: ModelDeployment[] = [
  {
    modelId: "qwen3.5-35b",
    serverIp: "73.16.126.154",
    units: 1,
    deployNote: "1节点 A100，AWQ 4bit 量化",
    quantization: "AWQ 4bit",
    archType: "MoE",
    activeParams: "3B",
    hosted: "self",
  },
  {
    modelId: "qwen3.5-122b",
    serverIp: "73.16.126.154",
    units: 3,
    deployNote: "3节点 A100，AWQ 4bit 量化",
    quantization: "AWQ 4bit",
    archType: "MoE",
    activeParams: "10B",
    hosted: "self",
  },
  {
    modelId: "gemma4-26b",
    serverIp: "73.34.30.157",
    units: 1,
    deployNote: "1节点 V100，GGUF 量化",
    quantization: "GGUF",
    archType: "MoE",
    activeParams: "4B",
    hosted: "self",
  },
  {
    modelId: "qwen2-72b",
    serverIp: "73.16.126.154",
    units: 2,
    deployNote: "2节点 A100，量化部署",
    quantization: "量化",
    archType: "Dense",
    activeParams: "72B",
    hosted: "self",
  },
  {
    modelId: "glm4.7-flash-30b",
    serverIp: null,
    units: 0,
    deployNote: "智涌托管部署",
    quantization: "—",
    archType: "MoE",
    activeParams: "30B",
    hosted: "external",
  },
  {
    modelId: "deepseek-v3",
    serverIp: null,
    units: 0,
    deployNote: "智涌托管部署",
    quantization: "—",
    archType: "MoE",
    activeParams: "37B",
    hosted: "external",
  },
  {
    modelId: "deepseek-r1-distill-32b",
    serverIp: null,
    units: 0,
    deployNote: "智涌托管部署",
    quantization: "—",
    archType: "Dense",
    activeParams: "32B",
    hosted: "external",
  },
  {
    modelId: "qwen2.5-vl-7b",
    serverIp: null,
    units: 0,
    deployNote: "智涌托管部署",
    quantization: "—",
    archType: "VLM",
    activeParams: "7B",
    hosted: "external",
  },
  {
    modelId: "bge-m3",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，2并发",
    quantization: "FP16",
    archType: "Embedding",
    activeParams: "570M",
    concurrency: 2,
    hosted: "self",
  },
  {
    modelId: "bge-reranker",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，2并发",
    quantization: "FP16",
    archType: "Reranker",
    activeParams: "560M",
    concurrency: 2,
    hosted: "self",
  },
  {
    modelId: "qwen3-embedding-8b",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，1并发",
    quantization: "FP16",
    archType: "Embedding",
    activeParams: "8B",
    concurrency: 1,
    hosted: "self",
  },
  {
    modelId: "qwen3-vl-embedding-2b",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，1并发",
    quantization: "FP16",
    archType: "Embedding",
    activeParams: "2B",
    concurrency: 1,
    hosted: "self",
  },
  {
    modelId: "qwen3-reranker-8b",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，1并发",
    quantization: "FP16",
    archType: "Reranker",
    activeParams: "8B",
    concurrency: 1,
    hosted: "self",
  },
  {
    modelId: "qwen3-vl-reranker-2b",
    serverIp: "73.34.30.156",
    units: 1,
    deployNote: "1节点 V100，1并发",
    quantization: "FP16",
    archType: "Reranker",
    activeParams: "2B",
    concurrency: 1,
    hosted: "self",
  },
];

interface ApiRecord {
  id?: string;
  name: string;
  authId: string;
  projectName: string;
  projectDesc?: string;
  department: string;
  models: string[];
  apiKey: string;
  grantedAt: string;
  revoked?: boolean;
}

interface ApplicationRecord {
  id: string;
  name: string;
  authId: string;
  department: string;
  projectName: string;
  projectDesc?: string;
  models: string[];
  reason?: string;
  status: string;
  createdAt: string;
}

interface UsageRecord {
  id: string;
  model_id: string;
  api_key_id: string;
  key_name: string;
  department: string;
  prompt_tokens: string;
  completion_tokens: string;
  total_tokens: string;
  latency_ms: string;
  status_code: string;
  created_at: string;
  error_detail?: string;
  response_preview?: string;
}

// ── Models Tab ─────────────────────────────────────────────────────────────
function ModelsTab({ token }: { token: string }) {
  const { models: adminModels, setModels: setAdminModels } = useModels();
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [importFormat, setImportFormat] = useState<"openai" | "custom">("openai");
  const [customHeaders, setCustomHeaders] = useState<{ key: string; val: string }[]>([{ key: "", val: "" }]);
  const [newModel, setNewModel] = useState({
    id: "", name: "", provider: "", description: "", contextWindow: "",
    category: "chat" as Model["category"],
    baseUrl: "", apiKey: "", modelApiName: "",
  });

  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", provider: "", description: "", contextWindow: "",
    category: "chat" as Model["category"],
    baseUrl: "", apiKey: "", modelApiName: "",
    badge: "" as string, tags: "",
  });
  const [editImportFormat, setEditImportFormat] = useState<"openai" | "custom">("openai");
  const [editCustomHeaders, setEditCustomHeaders] = useState<{ key: string; val: string }[]>([{ key: "", val: "" }]);
  const [saving, setSaving] = useState(false);

  const syncToBackend = useCallback(async (models: Model[]) => {
    try {
      await fetch(`${API_BASE}/api/admin/models/sync`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ models }),
      });
    } catch { /* non-critical */ }
  }, [token]);

  const openEdit = (m: Model) => {
    setEditingModel(m);
    setEditForm({
      name: m.name, provider: m.provider, description: m.description,
      contextWindow: m.contextWindow, category: m.category,
      baseUrl: m.baseUrl || "", apiKey: m.apiKey || "",
      modelApiName: m.modelApiName || "", badge: m.badge || "",
      tags: (m.tags || []).join("、"),
    });
    setEditImportFormat(m.importFormat || "openai");
    setEditCustomHeaders(
      m.customHeaders
        ? Object.entries(m.customHeaders).map(([key, val]) => ({ key, val }))
        : [{ key: "", val: "" }]
    );
  };

  const handleEditSave = async () => {
    if (!editingModel) return;
    setSaving(true);

    const resolvedHeaders =
      editImportFormat === "custom" && editCustomHeaders.some((h) => h.key && h.val)
        ? Object.fromEntries(editCustomHeaders.filter((h) => h.key && h.val).map((h) => [h.key, h.val]))
        : null;

    try {
      // Direct PATCH to update this model's config in the DB immediately
      const res = await fetch(`${API_BASE}/api/admin/models/${editingModel.id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          name:          editForm.name,
          provider:      editForm.provider,
          description:   editForm.description,
          contextWindow: editForm.contextWindow,
          category:      editForm.category,
          baseUrl:       editForm.baseUrl || null,
          apiKey:        editForm.apiKey  || null,
          modelApiName:  editForm.modelApiName || null,
          importFormat:  editImportFormat,
          customHeaders: resolvedHeaders,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`保存失败: ${err?.detail || res.status}`);
        return;
      }
    } catch {
      toast.error("保存失败：网络错误，请重试");
      return;
    } finally {
      setSaving(false);
    }

    // Update local React state to match what was saved
    setAdminModels((ms) => {
      const updated = ms.map((m) =>
        m.id === editingModel.id
          ? {
              ...m,
              name: editForm.name, provider: editForm.provider,
              description: editForm.description, contextWindow: editForm.contextWindow,
              category: editForm.category,
              baseUrl: editForm.baseUrl || undefined,
              apiKey: editForm.apiKey || undefined,
              modelApiName: editForm.modelApiName || undefined,
              badge: (editForm.badge as Model["badge"]) || undefined,
              tags: editForm.tags ? editForm.tags.split(/[，、,]+/).map((t) => t.trim()).filter(Boolean) : m.tags,
              importFormat: editImportFormat,
              customHeaders: resolvedHeaders ?? undefined,
            }
          : m
      );
      return updated;
    });

    setEditingModel(null);
    toast.success(`${editForm.name} 已更新`);
  };

  const filtered = adminModels.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = (id: string) => {
    const model = adminModels.find((m) => m.id === id);
    const goingOffline = model?.status === "online";
    setAdminModels((ms) => {
      const updated = ms.map((m) => (m.id === id ? { ...m, status: m.status === "online" ? "offline" as const : "online" as const } : m));
      syncToBackend(updated);
      return updated;
    });
    if (goingOffline) {
      toast.warning(`${model?.name} 已下线`, {
        description: "建议前往「通知管理」发布下线公告，以便相关用户及时知悉。",
        duration: 8000,
        action: {
          label: "去发布通知",
          onClick: () => window.dispatchEvent(new CustomEvent("brdc-switch-tab", { detail: "notifications" })),
        },
      });
    } else {
      toast.success(`${model?.name} 已重新上线`);
    }
  };

  const deleteModel = async (id: string) => {
    const model = adminModels.find((m) => m.id === id);
    setAdminModels((ms) => {
      const updated = ms.filter((m) => m.id !== id);
      syncToBackend(updated);
      return updated;
    });
    try {
      await fetch(`${API_BASE}/api/admin/models/${id}`, { method: "DELETE", headers: authHeaders(token) });
    } catch { /* non-critical */ }
    toast.success(`${model?.name} 已删除`);
  };

  const handleAdd = async () => {
    if (!newModel.id || !newModel.name || !newModel.provider) { toast.error("请填写必填字段"); return; }
    setAdding(true);

    const resolvedHeaders =
      importFormat === "custom" && customHeaders.some((h) => h.key && h.val)
        ? Object.fromEntries(customHeaders.filter((h) => h.key && h.val).map((h) => [h.key, h.val]))
        : null;

    const newEntry: Model = {
      ...newModel,
      shortDescription: newModel.description,
      pricing: "", status: "online" as const, speed: "fast" as const,
      addedAt: new Date().toISOString().split("T")[0],
      importFormat,
      baseUrl: newModel.baseUrl || undefined,
      apiKey: newModel.apiKey || undefined,
      modelApiName: newModel.modelApiName || undefined,
      customHeaders: resolvedHeaders ?? undefined,
    };

    try {
      // Sync the full list (adds the new model to DB via sync endpoint)
      const withNew = [newEntry, ...adminModels];
      const res = await fetch(`${API_BASE}/api/admin/models/sync`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ models: withNew }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`添加失败: ${err?.detail || res.status}`);
        return;
      }
    } catch {
      toast.error("添加失败：网络错误，请重试");
      return;
    } finally {
      setAdding(false);
    }

    setAdminModels((ms) => [newEntry, ...ms]);
    setNewModel({ id: "", name: "", provider: "", description: "", contextWindow: "", category: "chat", baseUrl: "", apiKey: "", modelApiName: "" });
    setCustomHeaders([{ key: "", val: "" }]);
    setImportFormat("openai");
    setShowAdd(false);
    toast.success("新模型已添加");
  };

  const exportCsv = () => {
    downloadCsv(
      `models_${new Date().toISOString().slice(0, 10)}.csv`,
      adminModels.map((m) => [m.id, m.name, m.provider, categoryLabels[m.category], statusLabels[m.status], m.contextWindow || "", m.baseUrl || "", m.modelApiName || ""]),
      ["ID", "名称", "提供商", "类别", "状态", "上下文窗口", "Base URL", "API模型名称"]
    );
  };

  const inputClass = "w-full px-4 py-3 rounded-xl bg-[#f5f0eb] text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/40 transition-all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-muted-foreground">共 {adminModels.length} 个模型</p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/30"
          >
            <Download className="w-3.5 h-3.5" /> 导出台账
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> 引入新模型
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-muted-foreground/50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模型..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/30 shadow-sm"
        />
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-7 space-y-5 shadow-xl overflow-y-auto animate-enter"
            style={{ maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] text-foreground" style={{ fontWeight: 600 }}>引入新模型</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">模型 ID *</label>
                  <input value={newModel.id} onChange={(e) => setNewModel((n) => ({ ...n, id: e.target.value }))} className={inputClass} placeholder="my-model-v1" />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">显示名称 *</label>
                  <input value={newModel.name} onChange={(e) => setNewModel((n) => ({ ...n, name: e.target.value }))} className={inputClass} placeholder="MyModel V1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">提供商 *</label>
                  <input value={newModel.provider} onChange={(e) => setNewModel((n) => ({ ...n, provider: e.target.value }))} className={inputClass} placeholder="通义千问" />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">类别</label>
                  <select value={newModel.category} onChange={(e) => setNewModel((n) => ({ ...n, category: e.target.value as Model["category"] }))} className={inputClass}>
                    {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">上下文窗口</label>
                  <input value={newModel.contextWindow} onChange={(e) => setNewModel((n) => ({ ...n, contextWindow: e.target.value }))} className={inputClass} placeholder="128K" />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">API 模型名称</label>
                  <input value={newModel.modelApiName} onChange={(e) => setNewModel((n) => ({ ...n, modelApiName: e.target.value }))} className={inputClass} placeholder="同 ID 可留空" />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">描述</label>
                <textarea value={newModel.description} onChange={(e) => setNewModel((n) => ({ ...n, description: e.target.value }))} rows={2} className={inputClass + " resize-none"} placeholder="模型简介..." />
              </div>
              <div className="border-t border-border/30 pt-3">
                <label className="text-[12px] text-muted-foreground block mb-2">接入格式</label>
                <div className="flex gap-2 mb-3">
                  {[{ k: "openai" as const, label: "标准 OpenAI" }, { k: "custom" as const, label: "自定义接入" }].map(({ k, label }) => (
                    <button key={k} type="button" onClick={() => setImportFormat(k)}
                      className={`flex-1 py-2 rounded-xl text-[13px] transition-all border ${importFormat === k ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border/40 hover:text-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground block mb-1.5">Base URL</label>
                    <input value={newModel.baseUrl} onChange={(e) => setNewModel((n) => ({ ...n, baseUrl: e.target.value }))} className={inputClass} placeholder="https://api.example.com" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground block mb-1.5">API Key</label>
                    <input type="password" value={newModel.apiKey} onChange={(e) => setNewModel((n) => ({ ...n, apiKey: e.target.value }))} className={inputClass} placeholder="sk-..." />
                  </div>
                  {importFormat === "custom" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[12px] text-muted-foreground">自定义请求头（可选）</label>
                        <button type="button" onClick={() => setCustomHeaders((h) => [...h, { key: "", val: "" }])} className="flex items-center gap-1 text-[11px] text-primary hover:opacity-80 transition-opacity">
                          <Plus className="w-3 h-3" /> 添加
                        </button>
                      </div>
                      <div className="space-y-2">
                        {customHeaders.map((h, hi) => (
                          <div key={hi} className="flex gap-2 items-center">
                            <input value={h.key} onChange={(e) => setCustomHeaders((hs) => hs.map((x, i) => i === hi ? { ...x, key: e.target.value } : x))} className={inputClass + " flex-1"} placeholder="Header 名称" />
                            <input value={h.val} onChange={(e) => setCustomHeaders((hs) => hs.map((x, i) => i === hi ? { ...x, val: e.target.value } : x))} className={inputClass + " flex-1"} placeholder="Header 值" />
                            {customHeaders.length > 1 && (
                              <button type="button" onClick={() => setCustomHeaders((hs) => hs.filter((_, i) => i !== hi))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">取消</button>
              <button onClick={handleAdd} disabled={adding} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-[13px] disabled:opacity-60">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {adding ? "添加中..." : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingModel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
          onClick={() => setEditingModel(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-7 space-y-5 shadow-xl overflow-y-auto animate-enter"
            style={{ maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[18px] text-foreground" style={{ fontWeight: 600 }}>编辑模型</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">ID: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{editingModel.id}</code></p>
              </div>
              <button onClick={() => setEditingModel(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">显示名称</label>
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">提供商</label>
                  <input value={editForm.provider} onChange={(e) => setEditForm((f) => ({ ...f, provider: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">类别</label>
                  <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value as Model["category"] }))} className={inputClass}>
                    {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">上下文窗口</label>
                  <input value={editForm.contextWindow} onChange={(e) => setEditForm((f) => ({ ...f, contextWindow: e.target.value }))} className={inputClass} placeholder="128K" />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">描述</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={2} className={inputClass + " resize-none"} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">标签（逗号/顿号分隔）</label>
                  <input value={editForm.tags} onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} className={inputClass} placeholder="代码、推理、中文" />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1.5">徽章</label>
                  <select value={editForm.badge} onChange={(e) => setEditForm((f) => ({ ...f, badge: e.target.value }))} className={inputClass}>
                    <option value="">无</option>
                    <option value="推荐">推荐</option>
                    <option value="热门">热门</option>
                    <option value="新上线">新上线</option>
                    <option value="蒸馏">蒸馏</option>
                    <option value="大参数">大参数</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-border/30 pt-3">
                <label className="text-[12px] text-muted-foreground block mb-2">接入配置</label>
                <div className="flex gap-2 mb-3">
                  {[{ k: "openai" as const, label: "标准 OpenAI" }, { k: "custom" as const, label: "自定义接入" }].map(({ k, label }) => (
                    <button key={k} type="button" onClick={() => setEditImportFormat(k)}
                      className={`flex-1 py-2 rounded-xl text-[13px] transition-all border ${editImportFormat === k ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border/40 hover:text-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground block mb-1.5">Base URL</label>
                    <input value={editForm.baseUrl} onChange={(e) => setEditForm((f) => ({ ...f, baseUrl: e.target.value }))} className={inputClass} placeholder="留空则使用平台默认" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground block mb-1.5">API Key</label>
                    <input type="password" value={editForm.apiKey} onChange={(e) => setEditForm((f) => ({ ...f, apiKey: e.target.value }))} className={inputClass} placeholder="留空则不变" />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground block mb-1.5">API 模型名称</label>
                    <input value={editForm.modelApiName} onChange={(e) => setEditForm((f) => ({ ...f, modelApiName: e.target.value }))} className={inputClass} placeholder="留空则同 ID" />
                  </div>
                  {editImportFormat === "custom" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[12px] text-muted-foreground">自定义请求头</label>
                        <button type="button" onClick={() => setEditCustomHeaders((h) => [...h, { key: "", val: "" }])} className="flex items-center gap-1 text-[11px] text-primary hover:opacity-80 transition-opacity">
                          <Plus className="w-3 h-3" /> 添加
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editCustomHeaders.map((h, hi) => (
                          <div key={hi} className="flex gap-2 items-center">
                            <input value={h.key} onChange={(e) => setEditCustomHeaders((hs) => hs.map((x, i) => i === hi ? { ...x, key: e.target.value } : x))} className={inputClass + " flex-1"} placeholder="Header 名称" />
                            <input value={h.val} onChange={(e) => setEditCustomHeaders((hs) => hs.map((x, i) => i === hi ? { ...x, val: e.target.value } : x))} className={inputClass + " flex-1"} placeholder="Header 值" />
                            {editCustomHeaders.length > 1 && (
                              <button type="button" onClick={() => setEditCustomHeaders((hs) => hs.filter((_, i) => i !== hi))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setEditingModel(null)} className="px-5 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">取消</button>
              <button onClick={handleEditSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-[13px] disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "保存中..." : "保存更改"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((m, i) => (
          <div
            key={m.id}
            className={`bg-white rounded-xl px-5 py-3.5 shadow-sm hover:shadow-md transition-shadow animate-enter anim-delay-${Math.min(i, 7)}`}
          >
            <div className="flex items-center gap-3">
              <ProviderIcon provider={m.provider} size="md" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>{m.name}</span>
                  <span className="text-[12px] text-muted-foreground">{m.provider}</span>
                  <span className="text-[11px] bg-secondary px-2 py-0.5 rounded">{categoryLabels[m.category]}</span>
                  {m.contextWindow && m.contextWindow !== "-" && (
                    <span className="text-[11px] bg-secondary px-2 py-0.5 rounded">{m.contextWindow}</span>
                  )}
                  {m.badge && (
                    <span className="text-[10px] bg-[#fce9e2] text-[#c96442] px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{m.badge}</span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{m.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[11px] px-2.5 py-0.5 rounded-md mr-1 ${
                  m.status === "online" ? "bg-green-50 text-green-700" : m.status === "maintenance" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {statusLabels[m.status]}
                </span>
                <button onClick={() => openEdit(m)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="编辑">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => toggleStatus(m.id)}
                  className={`p-2 rounded-lg transition-colors ${m.status === "online" ? "text-amber-500 hover:bg-amber-50" : "text-green-500 hover:bg-green-50"}`}
                  title={m.status === "online" ? "下线" : "上线"}>
                  {m.status === "online" ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                </button>
                <button onClick={() => deleteModel(m.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 transition-colors" title="删除">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────
function UsersTab({ token }: { token: string }) {
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showApps, setShowApps] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, appsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/keys`, { headers: authHeaders(token) }),
        fetch(`${API_BASE}/api/admin/applications`, { headers: authHeaders(token) }),
      ]);
      if (keysRes.ok) {
        const data = await keysRes.json();
        setRecords(data);
      }
      if (appsRes.ok) {
        const data = await appsRes.json();
        setApplications(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const revoke = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/admin/keys/${id}/revoke`, { method: "POST", headers: authHeaders(token) });
      setRecords((rs) => rs.map((r) => r.id === id ? { ...r, revoked: true } : r));
      toast.success("已撤销访问权限");
    } catch { toast.error("撤销失败，请重试"); }
  };

  const deleteKey = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/admin/keys/${id}`, { method: "DELETE", headers: authHeaders(token) });
      setRecords((rs) => rs.filter((r) => r.id !== id));
      toast.success("已删除");
    } catch { toast.error("删除失败，请重试"); }
  };

  const approveApp = async (app: ApplicationRecord) => {
    setApprovingId(app.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/applications/${app.id}/approve`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const newKey = await res.json();
        setApplications((as) => as.map((a) => a.id === app.id ? { ...a, status: "approved" } : a));
        setRecords((rs) => [...rs, newKey]);
        toast.success(`已批准 ${app.name}，API Key 已生成`, {
          description: newKey.apiKey,
          duration: 10000,
          action: { label: "复制", onClick: () => copyToClipboard(newKey.apiKey) },
        });
      }
    } catch { toast.error("批准失败，请重试"); }
    setApprovingId(null);
  };

  const rejectApp = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/admin/applications/${id}/reject`, { method: "POST", headers: authHeaders(token) });
      setApplications((as) => as.map((a) => a.id === id ? { ...a, status: "rejected" } : a));
      toast.success("已拒绝申请");
    } catch { toast.error("操作失败，请重试"); }
  };

  const exportCsv = () => {
    downloadCsv(
      `users_${new Date().toISOString().slice(0, 10)}.csv`,
      records.map((r) => [r.name, r.authId, r.department, r.projectName, r.models.join(";"), r.apiKey, r.grantedAt, r.revoked ? "已撤销" : "有效"]),
      ["姓名", "认证号", "部门", "项目名称", "授权模型", "API Key", "授权日期", "状态"]
    );
  };

  const filtered = records.filter((r) =>
    r.name.includes(search) || r.authId.includes(search) || r.projectName.includes(search) || r.department.includes(search)
  );
  const pendingApps = applications.filter((a) => a.status === "pending");

  return (
    <div className="space-y-4">
      {/* Pending applications banner */}
      {pendingApps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setShowApps((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] flex items-center justify-center" style={{ fontWeight: 600 }}>{pendingApps.length}</span>
              <span className="text-[14px] text-amber-800" style={{ fontWeight: 500 }}>待审批申请</span>
            </div>
            {showApps ? <ChevronDown className="w-4 h-4 text-amber-600" /> : <ChevronRight className="w-4 h-4 text-amber-600" />}
          </button>
          {showApps && (
            <div className="mt-3 space-y-2">
              {pendingApps.map((app) => (
                <div key={app.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>{app.name}</span>
                        <span className="text-[12px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">{app.authId}</span>
                        <span className="text-[12px] text-muted-foreground">{app.department}</span>
                      </div>
                      <p className="text-[13px] text-foreground/80 mb-1">{app.projectName}</p>
                      {app.reason && <p className="text-[12px] text-muted-foreground mb-1">"{app.reason}"</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {app.models.map((id) => (
                          <span key={id} className="text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded">{id}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => approveApp(app)}
                        disabled={approvingId === app.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        {approvingId === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        批准
                      </button>
                      <button
                        onClick={() => rejectApp(app.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> 拒绝
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-muted-foreground">共 {records.length} 个授权用户</p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/30"
          >
            <Download className="w-3.5 h-3.5" /> 导出台账
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-muted-foreground/50" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名、认证号、项目名称..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/30 shadow-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-[14px]">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/60 text-[14px]">
          {records.length === 0 ? "暂无授权用户记录" : "无匹配结果"}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rec, i) => (
            <div
              key={rec.id || i}
              className={`bg-white rounded-xl px-5 py-4 shadow-sm animate-enter anim-delay-${Math.min(i, 7)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>{rec.name}</span>
                    <span className="text-[12px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">{rec.authId}</span>
                    <span className="text-[12px] text-muted-foreground">{rec.department}</span>
                    {rec.revoked && <span className="text-[11px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full">已撤销</span>}
                  </div>
                  <p className="text-[13px] text-foreground/80 mb-1">{rec.projectName}</p>
                  {rec.projectDesc && (
                    <p className="text-[12px] text-muted-foreground/70 mb-2 leading-relaxed">{rec.projectDesc}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {rec.models.map((id) => (
                      <span key={id} className="text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded">{id}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 mt-2">
                    授权于 {rec.grantedAt} ·{" "}
                    <button
                      className="font-mono hover:text-primary transition-colors"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      onClick={() => { copyToClipboard(rec.apiKey); toast.success("已复制 API Key"); }}
                      title="点击复制"
                    >
                      {rec.apiKey.slice(0, 16)}…
                    </button>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!rec.revoked && (
                    <button
                      onClick={() => rec.id && revoke(rec.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <PowerOff className="w-3.5 h-3.5" /> 撤销
                    </button>
                  )}
                  <button
                    onClick={() => rec.id && deleteKey(rec.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notifications Tab ──────────────────────────────────────────────────────
const notifTypeOptions = [
  { value: "online", label: "上线", dot: "bg-green-400" },
  { value: "offline", label: "下线", dot: "bg-red-400" },
  { value: "maintenance", label: "维护", dot: "bg-amber-400" },
  { value: "info", label: "公告", dot: "bg-blue-400" },
] as const;

function NotificationsTab({ token }: { token: string }) {
  const { notifications, setNotifications } = useModels();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; type: NotificationItem["type"]; date: string; isNew: boolean }>({
    title: "", description: "", type: "info", date: new Date().toISOString().slice(0, 10), isNew: true,
  });

  const deleteNotif = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/admin/notifications/${id}`, { method: "DELETE", headers: authHeaders(token) });
      setNotifications((ns) => ns.filter((n) => n.id !== id));
      toast.success("通知已删除");
    } catch { toast.error("删除失败"); }
  };

  const toggleNew = async (n: NotificationItem) => {
    try {
      await fetch(`${API_BASE}/api/admin/notifications/${n.id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ isNew: !n.isNew }),
      });
      setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, isNew: !x.isNew } : x)));
    } catch { /* silent */ }
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/admin/notifications/${id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ title: form.title, description: form.description, type: form.type, date: form.date, isNew: form.isNew }),
      });
      setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, ...form } : n)));
      setEditId(null);
      toast.success("通知已更新");
    } catch { toast.error("保存失败"); }
    setSaving(false);
  };

  const addNotif = async () => {
    if (!form.title) { toast.error("请填写标题"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/notifications`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ title: form.title, description: form.description, type: form.type, date: form.date, isNew: form.isNew }),
      });
      const created = await res.json();
      setNotifications((ns) => [
        { id: created.id, title: form.title, description: form.description, type: form.type, date: form.date, isNew: form.isNew },
        ...ns,
      ]);
      setForm({ title: "", description: "", type: "info", date: new Date().toISOString().slice(0, 10), isNew: true });
      setShowAdd(false);
      toast.success("通知已发布");
    } catch { toast.error("发布失败"); }
    setSaving(false);
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl bg-[#f5f0eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/30 transition-all";
  const typeColor: Record<NotificationItem["type"], string> = {
    online: "bg-green-50 text-green-700",
    offline: "bg-red-50 text-red-600",
    maintenance: "bg-amber-50 text-amber-700",
    info: "bg-blue-50 text-blue-600",
  };
  const typeLabel: Record<NotificationItem["type"], string> = { online: "上线", offline: "下线", maintenance: "维护", info: "公告" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">共 {notifications.length} 条通知</p>
        <button
          onClick={() => { setShowAdd(true); setEditId(null); setForm({ title: "", description: "", type: "info", date: new Date().toISOString().slice(0, 10), isNew: true }); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> 新增通知
        </button>
      </div>

      {(showAdd || editId) && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-border/20 space-y-3 animate-enter">
          <h3 className="text-[14px]" style={{ fontWeight: 500 }}>{editId ? "编辑通知" : "新增通知"}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">标题 *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="通知标题" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">类型</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as NotificationItem["type"] }))} className={inputClass}>
                  {notifTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">日期</label>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">描述</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className={inputClass + " resize-none"} placeholder="通知详情..." />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer" onClick={() => setForm((f) => ({ ...f, isNew: !f.isNew }))}>
              <div
                className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{ backgroundColor: form.isNew ? "#2A2019" : "transparent", borderColor: form.isNew ? "#2A2019" : "#d4ccc3" }}
              >
                {form.isNew && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-[12px] text-muted-foreground">标记为新通知（显示红点）</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="px-4 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-secondary transition-colors">取消</button>
            <button
              onClick={editId ? () => saveEdit(editId) : addNotif}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {editId ? "保存" : "发布"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((n, i) => (
          <div key={n.id} className={`bg-white rounded-xl px-5 py-3.5 shadow-sm animate-enter anim-delay-${Math.min(i, 7)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md ${typeColor[n.type]}`}>{typeLabel[n.type]}</span>
                  <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>{n.title}</span>
                  {n.isNew && <span className="text-[10px] bg-[#fce9e2] text-[#c96442] px-1.5 py-0.5 rounded-full" style={{ fontWeight: 500 }}>New</span>}
                </div>
                <p className="text-[12px] text-muted-foreground truncate">{n.description}</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">{n.date}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    setEditId(n.id); setShowAdd(false);
                    setForm({ title: n.title, description: n.description, type: n.type, date: n.date, isNew: !!n.isNew });
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="编辑"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleNew(n)}
                  className={`p-1.5 rounded-lg transition-colors ${n.isNew ? "text-primary hover:bg-[#fce9e2]" : "text-muted-foreground hover:bg-secondary"}`}
                  title={n.isNew ? "取消标记为新" : "标记为新"}
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteNotif(n.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors" title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Usage Tab ─────────────────────────────────────────────────────────────
function UsageTab({ token }: { token: string }) {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modelFilter, setModelFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [overview, setOverview] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  // Load monthly overview stats
  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats/overview`, { headers: authHeaders(token) });
      if (res.ok) setOverview(await res.json());
    } catch { /* silent */ }
  }, [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        ...(modelFilter ? { model_id: modelFilter } : {}),
      });
      const res = await fetch(`${API_BASE}/api/admin/usage?${params}`, { headers: authHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [token, modelFilter, page]);

  useEffect(() => { loadData(); loadOverview(); }, [loadData]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/usage?limit=10000&offset=0${modelFilter ? `&model_id=${modelFilter}` : ""}`, { headers: authHeaders(token) });
      const data = await res.json();
      downloadCsv(
        `usage_${new Date().toISOString().slice(0, 10)}.csv`,
        (data.records || []).map((r: UsageRecord) => [r.created_at, r.model_id, r.key_name, r.department, r.prompt_tokens, r.completion_tokens, r.total_tokens, r.latency_ms, r.status_code]),
        ["时间", "模型", "用户", "部门", "输入Token", "输出Token", "总Token", "延迟(ms)", "状态码"]
      );
    } catch { toast.error("导出失败"); }
  };

  // Stats: use monthly overview for top-level KPIs; page records for avg latency
  const fmtNum = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
  const validLatRecs = records.filter((r) => parseInt(r.latency_ms || "0") > 0 && r.status_code === "200");
  const avgLatency = validLatRecs.length > 0
    ? Math.round(validLatRecs.reduce((s, r) => s + parseInt(r.latency_ms || "0"), 0) / validLatRecs.length)
    : 0;
  const errorCount = records.filter((r) => r.status_code !== "200").length;

  // Apply error filter client-side (server-side filter would require API change)
  const displayRecords = errorsOnly ? records.filter((r) => r.status_code !== "200") : records;

  return (
    <div className="space-y-4">
      {/* KPI cards — monthly stats from overview */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: "本月调用次数",
            value: overview ? fmtNum(overview.month.calls) : "—",
            sub: `累计 ${total.toLocaleString()} 条`,
          },
          {
            label: "本月 Token 消耗",
            value: overview ? fmtNum(overview.month.tokens) : "—",
            sub: "tokens",
          },
          {
            label: "成功均值延迟",
            value: avgLatency > 0 ? `${avgLatency} ms` : "—",
            sub: `基于本页 ${validLatRecs.length} 条成功`,
          },
          {
            label: "本页错误调用",
            value: errorCount > 0
              ? <span style={{ color: "#ef4444", fontWeight: 700 }}>{errorCount}</span>
              : <span style={{ color: "#22c55e" }}>0</span>,
            sub: `成功率 ${records.length > 0 ? Math.round(((records.length - errorCount) / records.length) * 100) : 100}%`,
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl px-4 py-3.5 shadow-sm">
            <p className="text-[12px] text-muted-foreground">{label}</p>
            <p className="text-[20px] text-foreground mt-0.5" style={{ fontWeight: 600 }}>{value}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* 404 diagnosis banner — shown when there are error records */}
      {errorCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-amber-800 space-y-0.5">
            <p className="font-medium">本页包含 {errorCount} 条错误调用记录</p>
            <p className="text-amber-700/80">
              若状态码为 <code className="bg-amber-100 px-1 rounded">404</code>，通常原因：
              ① <strong>base_url</strong> 配置错误（上游服务器地址有误）；
              ② <strong>model_api_name</strong> 与上游实际模型名不一致（如 vLLM 加载的是
              <code className="bg-amber-100 px-1 rounded mx-0.5">Qwen/Qwen3.5-35B-AWQ</code>
              但平台未设置该名称）。请进入「模型管理」编辑对应模型进行修正。
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <input
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
            placeholder="按模型ID过滤..."
            className="px-3 py-2 rounded-xl bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/30 w-48"
          />
          <button
            onClick={() => setErrorsOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] transition-colors border ${
              errorsOnly
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-white text-muted-foreground border-border/30 hover:text-foreground"
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            {errorsOnly ? "仅显示错误" : "全部记录"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/30">
            <Download className="w-3.5 h-3.5" /> 导出记录
          </button>
          <button onClick={() => { loadData(); loadOverview(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-[14px]">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : displayRecords.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/60 text-[14px]">
          {errorsOnly ? "本页无错误记录 🎉" : "暂无调用记录"}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/30">
                  {["时间", "模型", "用户/部门", "Token", "延迟", "状态"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
                <tr>
                  <td colSpan={6} className="px-4 py-1 bg-[#fafafa] border-b border-border/20">
                    <span className="text-[11px] text-muted-foreground/50">点击任意行可展开查看详细日志</span>
                  </td>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r, i) => {
                  const isErr = r.status_code !== "200";
                  const isExpanded = expandedId === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className={`border-b border-border/10 cursor-pointer transition-colors hover:bg-[#f5f0eb]/60 ${isErr ? "bg-red-50/40" : i % 2 === 0 ? "" : "bg-[#faf8f6]"} ${isExpanded ? "bg-[#f5f0eb]/80" : ""}`}
                      >
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{fmtTime(r.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <code className="text-[12px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.model_id}</code>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-foreground">{r.key_name}</span>
                          {r.department && <span className="text-muted-foreground ml-1">· {r.department}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.total_tokens || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.latency_ms ? `${r.latency_ms}ms` : "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${r.status_code === "200" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                            {r.status_code}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={r.id + "_detail"} className="border-b border-border/10 bg-[#faf8f6]">
                          <td colSpan={6} className="px-5 py-3 space-y-3">
                            {/* Metadata grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-2 text-[12px]">
                              {[
                                { label: "记录 ID",    value: r.id, mono: true, small: true },
                                { label: "时间（精确）", value: fmtTime(r.created_at, true), mono: false, small: false },
                                { label: "模型",       value: r.model_id, mono: true, small: false },
                                { label: "Key 名称",   value: r.key_name || "—", mono: true, small: false },
                                { label: "部门",       value: r.department || "—", mono: false, small: false },
                                { label: "输入 Token", value: r.prompt_tokens || "—", mono: false, small: false },
                                { label: "输出 Token", value: r.completion_tokens || "—", mono: false, small: false },
                                { label: "总 Token",   value: r.total_tokens || "—", mono: false, small: false },
                                { label: "延迟",       value: r.latency_ms ? `${r.latency_ms} ms` : "—", mono: false, small: false },
                                { label: "状态码",     value: r.status_code, mono: false, small: false },
                              ].map(({ label, value, mono, small }) => (
                                <div key={label}>
                                  <span className="text-muted-foreground/60">{label}：</span>
                                  <span className="text-foreground/80 ml-0.5" style={{ fontFamily: mono ? "'JetBrains Mono', monospace" : undefined, fontSize: small ? "11px" : undefined }}>
                                    {value}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {/* Error detail */}
                            {r.error_detail && (
                              <div className="text-[12px]">
                                <span className="text-red-500/70 font-medium">错误详情：</span>
                                <code className="ml-1 text-red-600 bg-red-50 px-2 py-0.5 rounded text-[11px] break-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  {r.error_detail}
                                </code>
                              </div>
                            )}
                            {/* Response preview */}
                            {r.response_preview && (
                              <div className="text-[12px]">
                                <span className="text-muted-foreground/60 font-medium">响应内容预览（前 500 字）：</span>
                                <div className="mt-1 bg-white border border-border/20 rounded-lg px-3 py-2 text-[12px] text-foreground/75 leading-relaxed whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  {r.response_preview}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[13px] text-muted-foreground">
            <span>共 {total} 条 · 第 {page + 1} 页</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40">上一页</button>
              <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40">下一页</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Infra Tab ─────────────────────────────────────────────────────────────
const archColors: Record<ModelDeployment["archType"], { bg: string; text: string }> = {
  MoE:       { bg: "#fff7ed", text: "#c2410c" },
  Dense:     { bg: "#eff6ff", text: "#1d4ed8" },
  Embedding: { bg: "#f0fdf4", text: "#15803d" },
  Reranker:  { bg: "#fdf4ff", text: "#7e22ce" },
  VLM:       { bg: "#fffbeb", text: "#92400e" },
  Other:     { bg: "#f9fafb", text: "#4b5563" },
};

const INFRA_SERVERS_KEY     = "brdc_infra_servers";
const INFRA_DEPLOYMENTS_KEY = "brdc_infra_deployments";

function loadInfraServers(): ServerNode[] {
  try { const r = localStorage.getItem(INFRA_SERVERS_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return SERVERS;
}
function loadInfraDeployments(): ModelDeployment[] {
  try { const r = localStorage.getItem(INFRA_DEPLOYMENTS_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return MODEL_DEPLOYMENTS;
}

const BLANK_SERVER: ServerNode = { ip: "", totalUnits: 1, displayUnit: "GPU卡", gpuModel: "NVIDIA A100", gpuMem: "40G", gpuType: "PCIE", note: "" };
const BLANK_DEPLOY: ModelDeployment = { modelId: "", serverIp: "", units: 1, deployNote: "", quantization: "", archType: "Dense", activeParams: "", hosted: "self" };

function InfraTab() {
  const { models: allModels } = useModels();
  const [exportMenu, setExportMenu] = useState(false);

  // ── Editable state (persisted to localStorage) ──────────────────────────
  const [servers, setServers]         = useState<ServerNode[]>(loadInfraServers);
  const [deploys, setDeploys]         = useState<ModelDeployment[]>(loadInfraDeployments);

  // Edit dialogs
  const [editServerIdx, setEditServerIdx]   = useState<number | "new" | null>(null);
  const [editDeployIdx, setEditDeployIdx]   = useState<number | "new" | null>(null);
  const [serverDraft,   setServerDraft]     = useState<ServerNode>(BLANK_SERVER);
  const [deployDraft,   setDeployDraft]     = useState<ModelDeployment>(BLANK_DEPLOY);

  const saveServers = (next: ServerNode[]) => {
    setServers(next);
    localStorage.setItem(INFRA_SERVERS_KEY, JSON.stringify(next));
  };
  const saveDeploys = (next: ModelDeployment[]) => {
    setDeploys(next);
    localStorage.setItem(INFRA_DEPLOYMENTS_KEY, JSON.stringify(next));
  };

  // Open server edit
  const openEditServer = (idx: number | "new") => {
    setServerDraft(idx === "new" ? { ...BLANK_SERVER } : { ...servers[idx as number] });
    setEditServerIdx(idx);
  };
  const commitServer = () => {
    if (!serverDraft.ip.trim()) { toast.error("IP 不能为空"); return; }
    if (editServerIdx === "new") {
      saveServers([...servers, serverDraft]);
    } else {
      saveServers(servers.map((s, i) => i === editServerIdx ? serverDraft : s));
    }
    setEditServerIdx(null);
  };
  const deleteServer = (idx: number) => {
    if (!confirm("确认删除该服务器条目？")) return;
    saveServers(servers.filter((_, i) => i !== idx));
  };

  // Open deployment edit
  const openEditDeploy = (idx: number | "new") => {
    setDeployDraft(idx === "new" ? { ...BLANK_DEPLOY } : { ...deploys[idx as number] });
    setEditDeployIdx(idx);
  };
  const commitDeploy = () => {
    if (!deployDraft.modelId.trim()) { toast.error("模型 ID 不能为空"); return; }
    if (editDeployIdx === "new") {
      saveDeploys([...deploys, deployDraft]);
    } else {
      saveDeploys(deploys.map((d, i) => i === editDeployIdx ? deployDraft : d));
    }
    setEditDeployIdx(null);
  };
  const deleteDeploy = (idx: number) => {
    if (!confirm("确认删除该部署记录？")) return;
    saveDeploys(deploys.filter((_, i) => i !== idx));
  };

  // Merge deployment data with live model status from context
  const deployments = deploys.map((d) => {
    const liveModel = allModels.find((m) => m.id === d.modelId);
    return { ...d, status: liveModel?.status ?? "offline", displayName: liveModel?.name ?? d.modelId };
  });

  // Compute per-server unit usage
  const serverUsage = servers.map((s) => {
    const hosted = deployments.filter((d) => d.serverIp === s.ip);
    const calculatedUsed = hosted.reduce((sum, d) => sum + d.units, 0);
    const usedUnits = s.forceUsedUnits !== undefined ? s.forceUsedUnits : calculatedUsed;
    return { ...s, hostedModels: hosted, usedUnits };
  });

  // Group deployments: self-hosted vs external
  const selfHosted = deployments.filter((d) => d.hosted === "self");
  const external   = deployments.filter((d) => d.hosted === "external");

  const exportServerCsv = () => {
    downloadCsv(
      `servers_${new Date().toISOString().slice(0, 10)}.csv`,
      servers.map((s) => [s.ip, `${s.totalUnits} ${s.displayUnit}`, `${s.gpuModel} ${s.gpuMem} ${s.gpuType}`, s.note || ""]),
      ["IP", "节点数", "GPU型号", "备注"]
    );
  };

  const exportModelCsv = () => {
    downloadCsv(
      `model_deployments_${new Date().toISOString().slice(0, 10)}.csv`,
      deployments.map((d) => [
        d.modelId, d.hosted === "external" ? "智涌" : (d.serverIp || ""), String(d.units),
        d.quantization, d.archType, d.activeParams, d.concurrency ? String(d.concurrency) : "—",
        d.deployNote, d.status,
      ]),
      ["模型ID", "服务器IP/托管方", "节点数", "量化方式", "架构类型", "激活参数", "并发数", "部署说明", "状态"]
    );
  };

  // Shared input style for edit modals
  const fi = "w-full px-3 py-2 rounded-xl bg-background text-[13px] border border-border/40 focus:outline-none focus:ring-2 focus:ring-primary/15";

  const statusDot = (s: string) =>
    s === "online" ? "dot-green" :
    s === "unstable" || s === "maintenance" ? "dot-amber" : "dot-gray";

  const statusLabel = (s: string) =>
    s === "online" ? "在线" :
    s === "unstable" ? "非稳定" :
    s === "maintenance" ? "维护中" :
    s === "offline" ? "已下线" : s;

  return (
    <div className="space-y-6">
      {/* ── Header actions ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-muted-foreground">
          {servers.length} 台服务器 · {selfHosted.length} 个自部署模型 · {external.length} 个外部托管
        </p>
        <div className="relative">
          <button
            onClick={() => setExportMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/30"
          >
            <Download className="w-3.5 h-3.5" /> 导出台账
          </button>
          {exportMenu && (
            <div
              className="absolute right-0 mt-1 bg-white border border-border/30 rounded-xl shadow-lg py-1 z-10 animate-enter"
              style={{ minWidth: "160px" }}
              onMouseLeave={() => setExportMenu(false)}
            >
              <button onClick={() => { exportServerCsv(); setExportMenu(false); }}
                className="w-full text-left px-4 py-2 text-[13px] hover:bg-secondary transition-colors">
                导出服务器台账
              </button>
              <button onClick={() => { exportModelCsv(); setExportMenu(false); }}
                className="w-full text-left px-4 py-2 text-[13px] hover:bg-secondary transition-colors">
                导出模型部署台账
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Server Cards ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[13px] text-muted-foreground" style={{ fontWeight: 500 }}>服务器资源</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.3 }} />
          <button
            onClick={() => openEditServer("new")}
            className="flex items-center gap-1 text-[12px] text-primary hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> 新增服务器
          </button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {serverUsage.map((s, i) => {
            return (
              <div key={s.ip + i} className={`bg-white rounded-2xl p-5 shadow-sm animate-enter anim-delay-${Math.min(i,7)}`}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#f0f4ff] flex items-center justify-center shrink-0">
                      <Server className="w-4 h-4 text-[#4c6ef5]" />
                    </div>
                    <div>
                      <p className="text-[14px] text-foreground" style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{s.ip}</p>
                      <p className="text-[11px] text-muted-foreground">{s.note}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-2 py-1 rounded-lg bg-[#f0f4ff] text-[#4c6ef5]" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {s.totalUnits} {s.displayUnit}
                    </span>
                    <button
                      onClick={() => openEditServer(i)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteServer(i)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* GPU info */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-secondary/40 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">GPU 型号</p>
                    <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{s.gpuModel}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-0.5">显存 / 类型</p>
                    <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{s.gpuMem} {s.gpuType}</p>
                  </div>
                </div>
                {/* Unit usage bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{s.displayUnit}占用</span>
                    <span className="text-[11px] text-foreground" style={{ fontWeight: 500 }}>
                      {s.usedUnits}/{s.totalUnits}
                      {s.reservedUnits ? ` (+${s.reservedUnits} ${s.reservedNote})` : ""}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full transition-all"
                      style={{ width: `${Math.min((s.usedUnits / s.totalUnits) * 100, 100)}%`, background: "#4c6ef5" }}
                    />
                    {s.reservedUnits ? (
                      <div
                        className="h-full transition-all"
                        style={{ width: `${Math.min((s.reservedUnits / s.totalUnits) * 100, 100)}%`, background: "#f59e0b", opacity: 0.6 }}
                      />
                    ) : null}
                  </div>
                  {s.reservedUnits && (
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: "#4c6ef5" }} />
                        <span className="text-[10px] text-muted-foreground">模型服务</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
                        <span className="text-[10px] text-muted-foreground">{s.reservedNote}</span>
                      </div>
                    </div>
                  )}
                  {s.sharedAnnotation && (
                    <p className="text-[10px] text-muted-foreground mt-1 opacity-60">{s.sharedAnnotation}</p>
                  )}
                </div>
                {/* Deployed models mini list */}
                {s.hostedModels.length > 0 && (
                  <div className="space-y-1">
                    {s.hostedModels.map((d) => (
                      <div key={d.modelId} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors">
                        <span className={statusDot(d.status)} />
                        <code className="text-[11px] text-foreground flex-1 truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.modelId}</code>
                        <span className="text-[10px] text-muted-foreground">{d.units}{s.displayUnit}</span>
                        {d.concurrency && <span className="text-[10px] text-muted-foreground">{d.concurrency}并发</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Self-hosted deployments table ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[13px] text-muted-foreground" style={{ fontWeight: 500 }}>自部署模型台账</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.3 }} />
          <button
            onClick={() => { openEditDeploy("new"); setDeployDraft({ ...BLANK_DEPLOY, hosted: "self" }); }}
            className="flex items-center gap-1 text-[12px] text-primary hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> 新增部署
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: "720px" }}>
              <thead>
                <tr className="border-b border-border/30 bg-[#faf8f6]">
                  {["模型", "服务器", "单元", "架构", "量化方式", "激活参数", "并发", "状态", "操作"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selfHosted.map((d, i) => {
                  const ac = archColors[d.archType];
                  const globalIdx = deploys.findIndex((x) => x.modelId === d.modelId && x.hosted === "self");
                  return (
                    <tr key={d.modelId} className={`border-b border-border/10 ${i % 2 === 0 ? "" : "bg-[#faf8f6]"}`}>
                      <td className="px-4 py-3">
                        <code className="text-[12px] text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.modelId}</code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-[11px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.serverIp}</code>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-foreground">{d.units}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: ac.bg, color: ac.text, fontWeight: 500 }}>
                          {d.archType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">{d.quantization}</td>
                      <td className="px-4 py-3 text-[12px] text-foreground" style={{ fontWeight: 500 }}>{d.activeParams}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">{d.concurrency ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={statusDot(d.status)} />
                          <span className="text-[11px] text-muted-foreground">{statusLabel(d.status)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditDeploy(globalIdx)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors" title="编辑">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteDeploy(globalIdx)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── External (智涌) deployments ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[13px] text-muted-foreground" style={{ fontWeight: 500 }}>智涌托管模型</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.3 }} />
          <button
            onClick={() => { openEditDeploy("new"); setDeployDraft({ ...BLANK_DEPLOY, hosted: "external", serverIp: null }); }}
            className="flex items-center gap-1 text-[12px] text-primary hover:opacity-80 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> 新增外部托管
          </button>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {external.map((d, i) => {
            const ac = archColors[d.archType];
            const globalIdx = deploys.findIndex((x) => x.modelId === d.modelId && x.hosted === "external");
            return (
              <div key={d.modelId} className={`bg-white rounded-xl px-4 py-3.5 shadow-sm flex items-center gap-3 animate-enter anim-delay-${Math.min(i, 7)}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: ac.bg }}>
                  <Layers className="w-3.5 h-3.5" style={{ color: ac.text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <code className="text-[12px] text-foreground block truncate" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{d.modelId}</code>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: ac.bg, color: ac.text }}>{d.archType}</span>
                    <span className="text-[10px] text-muted-foreground">激活 {d.activeParams}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className={statusDot(d.status)} />
                    <span className="text-[10px] text-muted-foreground">{statusLabel(d.status)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground/60">智涌</span>
                    <button onClick={() => openEditDeploy(globalIdx)}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteDeploy(globalIdx)}
                      className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Server Edit Modal ─────────────────────────────────────────── */}
      {editServerIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditServerIdx(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-enter space-y-4 overflow-y-auto" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] text-foreground" style={{ fontWeight: 600 }}>
                {editServerIdx === "new" ? "新增服务器" : "编辑服务器"}
              </h3>
              <button onClick={() => setEditServerIdx(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "IP 地址 *", key: "ip", placeholder: "e.g. 73.16.126.154" },
                { label: "GPU 型号", key: "gpuModel", placeholder: "e.g. NVIDIA A100" },
                { label: "显存", key: "gpuMem", placeholder: "e.g. 40G" },
                { label: "GPU 类型", key: "gpuType", placeholder: "e.g. PCIE / SXM2" },
                { label: "备注说明", key: "note", placeholder: "e.g. 主力推理节点" },
                { label: "保留说明", key: "reservedNote", placeholder: "e.g. 模测保留" },
                { label: "共享说明", key: "sharedAnnotation", placeholder: "e.g. 3 Embedding 共享 2 节点" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-[12px] text-muted-foreground block mb-1">{label}</label>
                  <input
                    value={(serverDraft as any)[key] ?? ""}
                    onChange={(e) => setServerDraft((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={fi}
                  />
                </div>
              ))}
              {[
                { label: "单元数量 *", key: "totalUnits" },
                { label: "保留单元数", key: "reservedUnits" },
                { label: "强制占用单元数", key: "forceUsedUnits" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-[12px] text-muted-foreground block mb-1">{label}</label>
                  <input
                    type="number" min={0}
                    value={(serverDraft as any)[key] ?? ""}
                    onChange={(e) => setServerDraft((d) => ({ ...d, [key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                    className={fi}
                  />
                </div>
              ))}
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">单元名称</label>
                <select value={serverDraft.displayUnit}
                  onChange={(e) => setServerDraft((d) => ({ ...d, displayUnit: e.target.value }))}
                  className={fi}>
                  <option>GPU卡</option>
                  <option>节点</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditServerIdx(null)}
                className="px-4 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-secondary transition-colors">取消</button>
              <button onClick={commitServer}
                className="btn-tap px-5 py-2 rounded-xl text-[13px] bg-primary text-white hover:opacity-90 transition-opacity">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deployment Edit Modal ─────────────────────────────────────── */}
      {editDeployIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditDeployIdx(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-enter space-y-4 overflow-y-auto" style={{ maxHeight: "90vh" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] text-foreground" style={{ fontWeight: 600 }}>
                {editDeployIdx === "new" ? "新增部署记录" : "编辑部署记录"}
              </h3>
              <button onClick={() => setEditDeployIdx(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">模型 ID *</label>
                <input value={deployDraft.modelId}
                  onChange={(e) => setDeployDraft((d) => ({ ...d, modelId: e.target.value }))}
                  placeholder="e.g. qwen3.5-35b" className={fi} />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">托管方式</label>
                <select value={deployDraft.hosted}
                  onChange={(e) => setDeployDraft((d) => ({ ...d, hosted: e.target.value as "self" | "external", serverIp: e.target.value === "external" ? null : (d.serverIp ?? "") }))}
                  className={fi}>
                  <option value="self">自部署</option>
                  <option value="external">外部托管（智涌）</option>
                </select>
              </div>
              {deployDraft.hosted === "self" && (
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1">服务器 IP</label>
                  <input value={deployDraft.serverIp ?? ""}
                    onChange={(e) => setDeployDraft((d) => ({ ...d, serverIp: e.target.value }))}
                    placeholder="e.g. 73.16.126.154" className={fi} />
                </div>
              )}
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">占用单元数</label>
                <input type="number" min={0} value={deployDraft.units}
                  onChange={(e) => setDeployDraft((d) => ({ ...d, units: Number(e.target.value) }))}
                  className={fi} />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">架构类型</label>
                <select value={deployDraft.archType}
                  onChange={(e) => setDeployDraft((d) => ({ ...d, archType: e.target.value as ModelDeployment["archType"] }))}
                  className={fi}>
                  {(["MoE", "Dense", "Embedding", "Reranker", "VLM", "Other"] as const).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              {[
                { label: "激活参数", key: "activeParams", placeholder: "e.g. 3B" },
                { label: "量化方式", key: "quantization", placeholder: "e.g. AWQ 4bit" },
                { label: "部署说明", key: "deployNote", placeholder: "e.g. 1节点 A100，AWQ 4bit 量化" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-[12px] text-muted-foreground block mb-1">{label}</label>
                  <input value={(deployDraft as any)[key] ?? ""}
                    onChange={(e) => setDeployDraft((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder} className={fi} />
                </div>
              ))}
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">并发数（留空则不限）</label>
                <input type="number" min={1} value={deployDraft.concurrency ?? ""}
                  onChange={(e) => setDeployDraft((d) => ({ ...d, concurrency: e.target.value === "" ? undefined : Number(e.target.value) }))}
                  className={fi} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditDeployIdx(null)}
                className="px-4 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-secondary transition-colors">取消</button>
              <button onClick={commitDeploy}
                className="btn-tap px-5 py-2 rounded-xl text-[13px] bg-primary text-white hover:opacity-90 transition-opacity">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────
const PIE_COLORS = ["#da7757", "#3a3a3a", "#6c8ebf", "#82b366", "#d6b656", "#ae4132", "#6d4c41", "#37474f"];

function DashboardTab({ token }: { token: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [byUser, setByUser] = useState<any[]>([]);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = authHeaders(token);
      const [ov, d, m, bm, bu] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats/overview`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/stats/daily?days=${period}`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/stats/monthly?year=${currentYear}`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/stats/by_model?days=${period}`, { headers: h }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/stats/by_user?days=${period}`, { headers: h }).then((r) => r.json()),
      ]);
      setOverview(ov);
      setDaily(Array.isArray(d) ? d : []);
      setMonthly(Array.isArray(m) ? m.map((r: any) => ({ ...r, label: `${r.month}月` })) : []);
      setByModel(Array.isArray(bm) ? bm.slice(0, 8) : []);
      setByUser(Array.isArray(bu) ? bu.slice(0, 10) : []);
    } catch { /* silent */ }
    setLoading(false);
  }, [token, period, currentYear]);

  useEffect(() => { load(); }, [load]);

  const fmtNum = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);

  const kpiCards = overview ? [
    { label: "今日调用", value: fmtNum(overview.today.calls), sub: `${fmtNum(overview.today.tokens)} Token`, icon: Activity, color: "#da7757" },
    { label: "本月调用", value: fmtNum(overview.month.calls), sub: `${fmtNum(overview.month.tokens)} Token`, icon: TrendingUp, color: "#3a3a3a" },
    { label: "本年调用", value: fmtNum(overview.year.calls), sub: `${fmtNum(overview.year.tokens)} Token`, icon: BarChart2, color: "#6c8ebf" },
    { label: "有效密钥", value: String(overview.active_keys), sub: `${overview.online_models} 个模型在线`, icon: Key, color: "#82b366" },
  ] : [];

  const chartData = viewMode === "daily" ? daily.map((d: any) => ({ ...d, label: d.day?.slice(5) })) : monthly;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-border/30 rounded-xl px-3 py-2.5 shadow-lg text-[12px]">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toLocaleString()}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm h-24 animate-pulse" style={{ opacity: 0.6 }} />
            ))
          : kpiCards.map(({ label, value, sub, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl px-5 py-4 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-[12px] text-muted-foreground">{label}</p>
                  <p className="text-[22px] text-foreground" style={{ fontWeight: 700 }}>{value}</p>
                  <p className="text-[11px] text-muted-foreground/70">{sub}</p>
                </div>
              </div>
            ))
        }
      </div>

      {/* Chart controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-secondary/60 p-1 rounded-xl">
          {(["daily", "monthly"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-[12px] transition-all ${viewMode === m ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "daily" ? "日视图" : "月视图"}
            </button>
          ))}
        </div>
        {viewMode === "daily" && (
          <div className="flex gap-1 bg-secondary/60 p-1 rounded-xl">
            {(["7", "30", "90"] as const).map((d) => (
              <button key={d} onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-[12px] transition-all ${period === d ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                近{d}天
              </button>
            ))}
          </div>
        )}
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {/* Calls trend chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-[14px] mb-4" style={{ fontWeight: 600 }}>调用趋势</h3>
        {loading ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...</div>
        ) : chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-[13px]">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d8" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b7e74" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b7e74" }} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="calls" name="调用次数" stroke="#da7757" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Token consumption chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-[14px] mb-4" style={{ fontWeight: 600 }}>Token 消耗趋势</h3>
        {loading ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin mr-2" />加载中...</div>
        ) : chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-[13px]">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d8" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b7e74" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b7e74" }} width={50} tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}w` : String(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="tokens" name="Token 消耗" fill="#3a3a3a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom row: by model pie + top users table */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {/* By-model pie */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] mb-3" style={{ fontWeight: 600 }}>模型调用分布</h3>
          {loading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : byModel.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground/50 text-[13px]">暂无数据</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie data={byModel} dataKey="calls" nameKey="model_id" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                    {byModel.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, "次"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {byModel.slice(0, 6).map((m, i) => (
                  <div key={m.model_id} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-[11px] text-muted-foreground truncate flex-1">{m.model_id}</span>
                    <span className="text-[11px] text-foreground shrink-0" style={{ fontWeight: 500 }}>{m.calls}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top users */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] mb-3" style={{ fontWeight: 600 }}>活跃用户 Top 10</h3>
          {loading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : byUser.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground/50 text-[13px]">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {byUser.map((u, i) => {
                const maxCalls = byUser[0]?.calls || 1;
                return (
                  <div key={u.auth_id} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-4 shrink-0" style={{ fontWeight: i < 3 ? 600 : 400 }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[12px] text-foreground truncate">{u.name || u.auth_id}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{u.calls}次</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(u.calls / maxCalls) * 100}%`, backgroundColor: i < 3 ? "#da7757" : "#d4ccc3" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Infra Summary (kanban) ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px]" style={{ fontWeight: 600 }}>基础设施概览</h3>
          <span className="text-[11px] text-muted-foreground/60">{loadInfraServers().length} 台服务器 · {loadInfraDeployments().length} 个模型</span>
        </div>

        {/* Server strips */}
        <div className="space-y-3 mb-5">
          {loadInfraServers().map((s) => {
            const calculatedUsed = loadInfraDeployments().filter((d) => d.serverIp === s.ip).reduce((sum, d) => sum + d.units, 0);
            const usedUnits = s.forceUsedUnits !== undefined ? s.forceUsedUnits : calculatedUsed;
            const pct = s.totalUnits > 0 ? Math.round((usedUnits / s.totalUnits) * 100) : 0;
            return (
              <div key={s.ip} className="flex items-center gap-3">
                <div className="flex items-center gap-2 shrink-0" style={{ width: "170px" }}>
                  <Server className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <code className="text-[11px] text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.ip}</code>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-muted-foreground">{s.gpuModel} {s.gpuMem} × {s.totalUnits}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{usedUnits}/{s.totalUnits} {s.displayUnit}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 90 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#22c55e" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Model status grid */}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {loadInfraDeployments().map((d) => {
            const liveStatus = (overview as any)?.model_statuses?.[d.modelId] ?? "—";
            return (
              <div key={d.modelId} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors">
                <Cpu className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                <code className="text-[11px] text-foreground flex-1 truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.modelId}</code>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{d.hosted === "external" ? "智涌" : d.serverIp?.split(".").slice(-1)[0]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Forum Tab ─────────────────────────────────────────────────────────────
interface ForumPostAdmin {
  id: string;
  auth_id: string;
  author_name: string;
  department: string;
  title: string;
  content: string;
  is_pinned: boolean;
  reply_count: number;
  created_at: string;
}

function ForumTab({ token }: { token: string }) {
  const [posts, setPosts] = useState<ForumPostAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/forum/posts?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        { headers: authHeaders(token) }
      );
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setTotal(data.total || 0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [token, page]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const deletePost = async (postId: string, title: string) => {
    setDeletingId(postId);
    try {
      const res = await fetch(`${API_BASE}/api/forum/posts/${postId}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (res.ok) {
        setPosts((ps) => ps.filter((p) => p.id !== postId));
        setTotal((t) => t - 1);
        toast.success(`帖子「${title.slice(0, 20)}」已删除`);
      } else {
        toast.error("删除失败");
      }
    } catch { toast.error("删除失败，请重试"); }
    setDeletingId(null);
  };

  const togglePin = async (post: ForumPostAdmin) => {
    try {
      await fetch(`${API_BASE}/api/forum/posts/${post.id}/pin`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ pinned: !post.is_pinned }),
      });
      setPosts((ps) => ps.map((p) => p.id === post.id ? { ...p, is_pinned: !p.is_pinned } : p));
      toast.success(post.is_pinned ? "已取消置顶" : "已置顶");
    } catch { toast.error("操作失败"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] text-muted-foreground">共 {total} 条帖子</p>
        <button
          onClick={loadPosts}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-[14px]">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/60 text-[14px]">暂无帖子</div>
      ) : (
        <div className="space-y-2">
          {posts.map((post, i) => (
            <div key={post.id} className={`bg-white rounded-xl px-5 py-4 shadow-sm animate-enter anim-delay-${Math.min(i, 7)}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {post.is_pinned && (
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>置顶</span>
                    )}
                    <span className="text-[14px] text-foreground truncate" style={{ fontWeight: 500 }}>{post.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground mb-1">
                    <span>{post.author_name}</span>
                    {post.department && <><span>·</span><span>{post.department}</span></>}
                    <span className="text-[11px] bg-secondary px-1.5 py-0.5 rounded">{post.auth_id}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground/70 line-clamp-2 mb-1">{post.content}</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground/50">
                    <span>{fmtTime(post.created_at)}</span>
                    <span>{post.reply_count} 条回复</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePin(post)}
                    className={`p-1.5 rounded-lg transition-colors text-[12px] flex items-center gap-1 ${post.is_pinned ? "text-amber-500 hover:bg-amber-50" : "text-muted-foreground hover:bg-secondary"}`}
                    title={post.is_pinned ? "取消置顶" : "置顶"}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deletePost(post.id, post.title)}
                    disabled={deletingId === post.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deletingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[13px] text-muted-foreground">
          <span>共 {total} 条 · 第 {page + 1} 页</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40">上一页</button>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40">下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main AdminPage ─────────────────────────────────────────────────────────
export function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab;
      if (detail) setActiveTab(detail);
    };
    window.addEventListener("brdc-switch-tab", handler);
    return () => window.removeEventListener("brdc-switch-tab", handler);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogging(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setAuthed(true);
      } else {
        toast.error("密码错误");
        setPassword("");
      }
    } catch {
      toast.error("连接后端失败，请检查服务状态");
    }
    setLogging(false);
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "数据看板", icon: TrendingUp },
    { key: "infra", label: "基础设施", icon: Server },
    { key: "models", label: "模型管理", icon: Database },
    { key: "users", label: "用户管理", icon: Users },
    { key: "forum", label: "社区管理", icon: MessageSquare },
    { key: "notifications", label: "通知管理", icon: Bell },
    { key: "usage", label: "调用记录", icon: BarChart2 },
  ];

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto pt-20 animate-enter">
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center space-y-5">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-[20px] text-foreground" style={{ fontWeight: 600 }}>管理员验证</h2>
            <p className="text-[13px] text-muted-foreground mt-1">请输入管理员密码以访问后台</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-3 rounded-xl bg-background text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/40"
              autoFocus
            />
            <button
              type="submit"
              disabled={logging || !password}
              className="w-full py-2.5 bg-primary text-white rounded-xl text-[14px] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {logging ? "验证中..." : "进入管理后台"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>管理后台</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">数据看板 · 基础设施台账 · 模型与用户授权管理</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/60 p-1 rounded-xl w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-all ${
              activeTab === key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{ fontWeight: activeTab === key ? 500 : 400 }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "dashboard" && <DashboardTab token={token} />}
        {activeTab === "infra" && <InfraTab />}
        {activeTab === "models" && <ModelsTab token={token} />}
        {activeTab === "users" && <UsersTab token={token} />}
        {activeTab === "forum" && <ForumTab token={token} />}
        {activeTab === "notifications" && <NotificationsTab token={token} />}
        {activeTab === "usage" && <UsageTab token={token} />}
      </div>
    </div>
  );
}
