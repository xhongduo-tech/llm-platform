import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, Loader2, ArrowLeft, ArrowRight, Copy, Check,
  Eye, EyeOff, Search, KeyRound, FileText, ChevronRight, AlertCircle, RotateCcw, LogIn,
} from "lucide-react";
import { categoryLabels, type Model } from "./model-data";
import { useModels } from "./model-context";
import { useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router";
import { ProviderIcon } from "./provider-logos";

type PageMode = null | "apply" | "lookup";

// Clipboard helper with execCommand fallback
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
  el.focus();
  el.select();
  try { document.execCommand("copy"); } catch { /* silent */ }
  document.body.removeChild(el);
}

interface ApiRecord {
  id: string;
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

/** The base URL users should configure in their SDK — always the current nginx origin */
function getApiBaseUrl(): string {
  return window.location.origin;
}

// ── ModeSelector ─────────────────────────────────────────────────────────────
function ModeSelector({ onSelect }: { onSelect: (m: "apply" | "lookup") => void }) {
  return (
    <div className="animate-enter grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
      {[
        {
          key: "apply" as const,
          icon: FileText,
          title: "申请新 API Key",
          desc: "填写需求信息并选择模型，提交后自动审批，即时获取 Key",
          color: "text-primary",
          bg: "hover:border-primary/30 hover:bg-accent/60",
        },
        {
          key: "lookup" as const,
          icon: KeyRound,
          title: "查阅已申请记录",
          desc: "输入统一认证号，查看已获批的 API Key 与授权模型列表",
          color: "text-blue-500",
          bg: "hover:border-blue-300/40 hover:bg-blue-50/40",
        },
      ].map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className={`btn-tap group text-left bg-white rounded-2xl p-6 shadow-sm border border-border/20 transition-all ${opt.bg}`}
          >
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Icon className={`w-5 h-5 ${opt.color}`} />
            </div>
            <h3 className="text-[15px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>{opt.title}</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{opt.desc}</p>
            <div className={`flex items-center gap-1 mt-3 text-[12px] ${opt.color}`} style={{ fontWeight: 500 }}>
              进入 <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── LookupPanel ───────────────────────────────────────────────────────────────
function LookupPanel({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { models } = useModels();
  const { user } = useUser();

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [fetched, setFetched] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Fetch the current user's own records — auth_id comes from JWT on the server,
  // not from any client-supplied parameter. This prevents looking up others' keys.
  const fetchMyRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/apply/lookup", {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        setRecords(await res.json());
      } else {
        setRecords([]);
        if (res.status === 401) toast.error("登录已过期，请重新登录");
      }
    } catch {
      toast.error("查询失败，请检查网络连接");
      setRecords([]);
    }
    setFetched(true);
    setLoading(false);
  }, [user]);

  // Load on mount when user is already logged in
  useEffect(() => {
    if (user) fetchMyRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleVisible = (id: string) =>
    setVisibleKeys((v) => ({ ...v, [id]: !v[id] }));

  const copyKey = (key: string, id: string) => {
    copyToClipboard(key);
    setCopiedId(id);
    toast.success("API Key 已复制");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReapply = (rec: ApiRecord) => {
    sessionStorage.setItem("brdc_prefill_record", JSON.stringify(rec));
    navigate("/apply?mode=apply");
  };

  // ── Not logged in: show auth gate ─────────────────────────────────────────
  if (!user) {
    return (
      <div className="panel-slide max-w-xl mx-auto space-y-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 返回
        </button>

        <div className="bg-white rounded-2xl p-8 shadow-sm flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-[17px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>请先登录</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              查阅已申请记录需要通过统一认证登录，<br />系统将自动加载您名下的 API Key 记录。
            </p>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="btn-tap flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" /> 统一认证登录
          </button>
        </div>

        <UserAuthModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </div>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────────────────
  return (
    <div className="panel-slide max-w-xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> 返回
      </button>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] text-foreground" style={{ fontWeight: 600 }}>我的申请记录</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {user.name}（{user.authId}）· {user.department}
          </p>
        </div>
        <button
          onClick={fetchMyRecords}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/30 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          刷新
        </button>
      </div>

      {/* Loading state */}
      {loading && !fetched && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {fetched && (
        <div className="animate-enter">
          {records.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 shadow-sm text-center text-muted-foreground text-[14px]">
              暂无申请记录
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-muted-foreground pl-1">共 {records.length} 条记录</p>
              {records.map((rec, i) => {
                const isRevoked = !!rec.revoked;
                return (
                  <div
                    key={rec.id}
                    className={`animate-enter anim-delay-${Math.min(i, 7)} bg-white rounded-2xl p-5 shadow-sm border space-y-3 transition-all ${
                      isRevoked ? "border-red-100 opacity-70" : "border-border/15"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>{rec.projectName}</p>
                        {rec.projectDesc && (
                          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{rec.projectDesc}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-1">{rec.department} · 授权于 {rec.grantedAt}</p>
                      </div>
                      {isRevoked ? (
                        <span className="text-[11px] bg-red-50 text-red-600 px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1" style={{ fontWeight: 500 }}>
                          <AlertCircle className="w-3 h-3" /> 已失效
                        </span>
                      ) : (
                        <span className="text-[11px] bg-green-50 text-green-700 px-2.5 py-1 rounded-full shrink-0" style={{ fontWeight: 500 }}>
                          有效
                        </span>
                      )}
                    </div>

                    {/* API Key */}
                    <div className={`rounded-xl px-4 py-3 flex items-center gap-2 ${isRevoked ? "bg-gray-50" : "bg-secondary/50"}`}>
                      <code
                        className={`flex-1 text-[12px] break-all ${isRevoked ? "text-muted-foreground/50" : "text-foreground/90"}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {visibleKeys[rec.id]
                          ? rec.apiKey
                          : rec.apiKey.slice(0, 8) + "•".repeat(24)}
                      </code>
                      <button
                        onClick={() => toggleVisible(rec.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {visibleKeys[rec.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {!isRevoked && (
                        <button
                          onClick={() => copyKey(rec.apiKey, rec.id)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          {copiedId === rec.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {/* Models */}
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5">已授权模型</p>
                      <div className="flex flex-wrap gap-1.5">
                        {rec.models.map((id) => {
                          const m = models.find((x) => x.id === id);
                          return (
                            <span key={id} className={`text-[11px] px-2.5 py-0.5 rounded-lg ${isRevoked ? "bg-gray-100 text-gray-400" : "bg-accent"}`}>
                              {m?.name ?? id}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {!isRevoked && (
                      <p className="text-[11px] text-muted-foreground/50">
                        Base URL: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{getApiBaseUrl()}</code>
                      </p>
                    )}

                    {isRevoked && (
                      <div className="border-t border-red-50 pt-3">
                        <p className="text-[12px] text-muted-foreground mb-2">此申请已被管理员撤销，您可在原有基础上修改后重新申请。</p>
                        <button
                          onClick={() => handleReapply(rec)}
                          className="btn-tap flex items-center gap-1.5 px-4 py-2 bg-[#e8e7e6] hover:bg-[#dedcda] text-foreground rounded-xl text-[13px] transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> 修改并重新申请
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ApplyForm ─────────────────────────────────────────────────────────────────
function ApplyForm({ onBack }: { onBack: () => void }) {
  const { models } = useModels();
  const [searchParams] = useSearchParams();
  const preselectedModel = searchParams.get("model");

  // Check for prefill data from revoked record re-apply (stored in sessionStorage)
  const prefillRaw = sessionStorage.getItem("brdc_prefill_record");
  const prefill: ApiRecord | null = (() => {
    if (!prefillRaw) return null;
    try { return JSON.parse(prefillRaw); } catch { return null; }
  })();

  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    authId: prefill?.authId ?? "",
    projectName: prefill?.projectName ?? "",
    projectDesc: prefill?.projectDesc ?? "",
    department: prefill?.department ?? "",
    startDate: "",
    estimatedTokens: "100K",
    selectedModels: prefill?.models ?? ([] as string[]),
  });
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  // Clear prefill after mounting
  useEffect(() => {
    sessionStorage.removeItem("brdc_prefill_record");
  }, []);

  useEffect(() => {
    if (preselectedModel && models.find((m) => m.id === preselectedModel)) {
      setForm((f) => ({
        ...f,
        selectedModels: f.selectedModels.includes(preselectedModel)
          ? f.selectedModels
          : [...f.selectedModels, preselectedModel],
      }));
    }
  }, [preselectedModel, models]);

  const toggleModel = (id: string) =>
    setForm((f) => ({
      ...f,
      selectedModels: f.selectedModels.includes(id)
        ? f.selectedModels.filter((m) => m !== id)
        : [...f.selectedModels, id],
    }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          authId: form.authId,
          projectName: form.projectName,
          projectDesc: form.projectDesc,
          department: form.department,
          models: form.selectedModels,
          reason: form.projectDesc,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "提交失败，请重试");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setNewApiKey(data.apiKey);
      setSubmitted(true);
    } catch {
      toast.error("网络错误，请检查服务连接后重试");
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="animate-enter flex flex-col items-center justify-center py-12 text-center max-w-lg mx-auto">
        <div className="animate-enter anim-delay-1 w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-9 h-9 text-green-500" />
        </div>
        <h2 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>申请已自动审核通过</h2>
        <p className="text-muted-foreground mt-1.5 text-[14px]">API Key 已生成，请妥善保管</p>

        <div className="animate-enter anim-delay-2 w-full mt-6 bg-white rounded-2xl p-5 shadow-sm border border-border/20 text-left">
          <p className="text-[12px] text-muted-foreground mb-2">您的 API Key</p>
          <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-4 py-3 mb-4">
            <code className="flex-1 text-[12px] break-all" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {keyVisible ? newApiKey : newApiKey.slice(0, 8) + "•".repeat(24)}
            </code>
            <button onClick={() => setKeyVisible(!keyVisible)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { copyToClipboard(newApiKey); setKeyCopied(true); toast.success("已复制"); setTimeout(() => setKeyCopied(false), 2000); }}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {keyCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-2">已授权模型</p>
          <div className="flex flex-wrap gap-1.5">
            {form.selectedModels.map((id) => (
              <span key={id} className="bg-accent text-accent-foreground px-2.5 py-1 rounded-lg text-[12px]">{id}</span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/50 mt-3">
            Base URL: <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{getApiBaseUrl()}</code>
          </p>
        </div>

        <button
          onClick={onBack}
          className="btn-tap mt-5 px-6 py-2.5 bg-foreground text-background rounded-xl text-[13px] hover:opacity-80 transition-opacity"
        >
          返回首页
        </button>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 rounded-xl bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/15 border border-border/40 transition-all";
  const steps = ["基本信息", "选择模型", "确认"];
  const categoryOrder: Model["category"][] = ["flagship", "chat", "vision", "embedding", "reranker"];
  const onlineModels = models.filter((m) => m.status === "online");
  const groupedModels = categoryOrder
    .map((cat) => ({ category: cat, models: onlineModels.filter((m) => m.category === cat) }))
    .filter((g) => g.models.length > 0);

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> 返回
      </button>

      {prefill && (
        <div className="bg-amber-50 border border-amber-200/50 rounded-xl px-4 py-3 flex items-center gap-2 text-[13px] text-amber-700">
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          已从已失效申请「{prefill.projectName}」预填充，请修改后重新提交。
        </div>
      )}

      {/* Steps */}
      <div className="flex items-center justify-center gap-3">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <button onClick={() => i < step && setStep(i)} className="flex items-center gap-2">
              <div
                className="step-dot w-7 h-7 rounded-full flex items-center justify-center text-[12px]"
                style={{ fontWeight: 500, backgroundColor: i <= step ? "#2A2019" : "#ece5de", color: i <= step ? "#f5f0eb" : "#8b7e74" }}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-[13px] hidden sm:inline transition-colors ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
            </button>
            {i < steps.length - 1 && <div className="step-line w-10" style={{ backgroundColor: i < step ? "#2A2019" : "#e0d8cf" }} />}
          </div>
        ))}
      </div>

      <div>
        {/* ── Step 0 ── */}
        {step === 0 && (
          <div key="s0" className="panel-slide bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">申请人姓名 *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="您的姓名" />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">统一认证号 *</label>
                <input value={form.authId} onChange={(e) => setForm((f) => ({ ...f, authId: e.target.value }))} className={inputClass} placeholder="请输入统一认证号" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">需求名称 *</label>
                <input value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} className={inputClass} placeholder="如：智能客服系统" />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">需求负责部门 *</label>
                <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className={inputClass} placeholder="大数据应用部" />
              </div>
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground block mb-1.5">需求描述 *</label>
              <textarea value={form.projectDesc} onChange={(e) => setForm((f) => ({ ...f, projectDesc: e.target.value }))} rows={3} className={inputClass + " resize-none"} placeholder="简要描述使用场景与目标..." />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">需求开展时间</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1.5">预计 Token 用量（周）</label>
                <div className="flex gap-2 flex-wrap">
                  {["100K", "500K", "1M", "5M", "10M+"].map((q) => (
                    <button key={q} type="button" onClick={() => setForm((f) => ({ ...f, estimatedTokens: q }))}
                      className={`btn-tap px-3 py-1.5 rounded-lg text-[12px] transition-all ${form.estimatedTokens === q ? "bg-foreground text-background" : "bg-background text-muted-foreground border border-border/40 hover:text-foreground"}`}>
                      {q}<span className="text-[10px] opacity-50 ml-0.5">/周</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => {
                if (!form.name || !form.authId || !form.projectName || !form.department || !form.projectDesc) { toast.error("请填写所有必填字段"); return; }
                setStep(1);
              }} className="btn-tap flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity">
                下一步 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div key="s1" className="panel-slide bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-muted-foreground">选择需要使用的模型（支持多选）</p>
              {form.selectedModels.length > 0 && <span className="text-[12px] text-primary" style={{ fontWeight: 500 }}>已选 {form.selectedModels.length} 个</span>}
            </div>
            <div className="space-y-5">
              {groupedModels.map((group, gi) => (
                <div key={group.category}>
                  <p className="text-[11px] text-muted-foreground/60 mb-2 pl-0.5" style={{ fontWeight: 600, letterSpacing: "0.04em" }}>{categoryLabels[group.category]}</p>
                  <div className="space-y-1.5">
                    {group.models.map((m, i) => {
                      const sel = form.selectedModels.includes(m.id);
                      return (
                        <button key={m.id} type="button" onClick={() => toggleModel(m.id)}
                          className={`btn-tap w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-[14px] ${sel ? "bg-accent border border-primary/20" : "bg-background border border-transparent hover:border-border/40"}`}>
                          <div className="step-dot w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                            style={{ backgroundColor: sel ? "#2A2019" : "rgba(0,0,0,0)", borderColor: sel ? "#2A2019" : "#d4ccc3" }}>
                            {sel && <span className="text-white text-[11px]">✓</span>}
                          </div>
                          <ProviderIcon provider={m.provider} size="sm" />
                          <div className="flex-1 min-w-0">
                            <span style={{ fontWeight: 500 }}>{m.name}</span>
                            <span className="text-muted-foreground ml-2 text-[12px]">{m.provider} · {m.contextWindow}</span>
                          </div>
                          {m.badge && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${m.badge === "推荐" ? "bg-[#fce9e2] text-[#c96442]" : "bg-amber-100 text-amber-700"}`} style={{ fontWeight: 500 }}>{m.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-1">
              <button onClick={() => setStep(0)} className="btn-tap flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> 上一步
              </button>
              <button onClick={() => { if (form.selectedModels.length === 0) { toast.error("请至少选择一个模型"); return; } setStep(2); }}
                className="btn-tap flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity">
                下一步 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div key="s2" className="panel-slide bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-[15px]" style={{ fontWeight: 500 }}>确认信息</h3>
            <div className="space-y-0">
              {[
                { label: "申请人", value: form.name },
                { label: "统一认证号", value: form.authId },
                { label: "需求名称", value: form.projectName },
                { label: "负责部门", value: form.department },
                { label: "需求描述", value: form.projectDesc },
                ...(form.startDate ? [{ label: "开展时间", value: form.startDate }] : []),
                { label: "预计 Token", value: `${form.estimatedTokens} / 周` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-[14px] py-2.5 border-b border-border/20">
                  <span className="text-muted-foreground shrink-0">{item.label}</span>
                  <span className="text-right ml-4 break-all">{item.value}</span>
                </div>
              ))}
              <div className="pt-3">
                <span className="text-[13px] text-muted-foreground block mb-2">已选模型（{form.selectedModels.length}）</span>
                <div className="flex flex-wrap gap-2">
                  {form.selectedModels.map((id) => {
                    const m = onlineModels.find((x) => x.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1.5 bg-accent text-accent-foreground px-2.5 py-1.5 rounded-lg text-[12px]">
                        {m && <ProviderIcon provider={m.provider} size="xs" />}
                        {id}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="bg-green-50 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-green-700 leading-relaxed">提交后将自动审核通过，即时生成 API Key，无需等待人工审批。</p>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="btn-tap flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> 上一步
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="btn-tap flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity disabled:opacity-60">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "审核中..." : "确认提交"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ApplyPage (root) ──────────────────────────────────────────────────────────
export function ApplyPage() {
  const [searchParams] = useSearchParams();
  // Support navigating directly to apply mode (e.g. from re-apply button)
  const initialMode: PageMode = searchParams.get("mode") === "apply" ? "apply" : null;
  const [mode, setMode] = useState<PageMode>(initialMode);

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-[28px] sm:text-[34px] text-foreground">API 权限申请</h1>
        <p className="text-muted-foreground text-[14px] mt-1.5">
          {mode === null ? "请选择操作类型" : mode === "apply" ? "填写需求信息并选择模型，提交后自动审批" : "输入统一认证号查询已获批的 Key"}
        </p>
      </div>

      <div>
        {mode === null && (
          <div key="selector" className="animate-enter">
            <ModeSelector onSelect={setMode} />
          </div>
        )}
        {mode === "apply" && (
          <div key="apply" className="animate-enter">
            <ApplyForm onBack={() => setMode(null)} />
          </div>
        )}
        {mode === "lookup" && (
          <div key="lookup" className="animate-enter">
            <LookupPanel onBack={() => setMode(null)} />
          </div>
        )}
      </div>
    </div>
  );
}