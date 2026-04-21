import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";

interface LogRecord {
  id: number;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status_code: number;
  created_at: string;
  error_detail?: string;
  response_preview?: string;
}

interface LogsResponse {
  total: number;
  records: LogRecord[];
}

const PAGE_SIZE = 50;

function formatTime(iso: string) {
  // The backend stores timestamps in UTC but serialises without a timezone
  // designator (no trailing 'Z'). Without it, JS Date treats the string as
  // *local* time, making getHours() return the UTC value — wrong for UTC+N
  // users. Appending 'Z' forces correct UTC→local conversion.
  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return "#22c55e";
  if (code >= 400 && code < 500) return "#f59e0b";
  return "#ef4444";
}

function exportCsv(records: LogRecord[]) {
  const header = "时间,模型,Prompt Tokens,Completion Tokens,总Token,延迟(ms),状态码";
  const rows = records.map((r) =>
    [
      `"${r.created_at}"`,
      `"${r.model_id}"`,
      r.prompt_tokens,
      r.completion_tokens,
      r.total_tokens,
      r.latency_ms,
      r.status_code,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface MonthStats { calls: number; tokens: number }

export function LogsPage() {
  const { user } = useUser();
  const [showAuth, setShowAuth] = useState(false);
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  // Fetch monthly stats from /api/user/stats
  const fetchMonthStats = useCallback(async () => {
    if (!user) return;
    try {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const res = await fetch(
        `${window.location.origin}/api/user/stats?year=${year}`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const cur = (data.monthly || []).find((m: { month: number }) => m.month === month);
      setMonthStats({ calls: cur?.calls ?? 0, tokens: cur?.tokens ?? 0 });
    } catch { /* silent */ }
  }, [user]);

  const fetchLogs = useCallback(
    async (pageNum: number) => {
      if (!user) return;
      setLoading(true);
      try {
        const offset = pageNum * PAGE_SIZE;
        const res = await fetch(
          `${window.location.origin}/api/user/logs?limit=${PAGE_SIZE}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${user.token}` } }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.message || err?.error || "加载日志失败");
          return;
        }
        const data: LogsResponse = await res.json();
        // The backend stores and returns numeric fields (latency_ms, tokens,
        // status_code) as strings. Parse them to numbers so arithmetic works
        // correctly — without this, reduce() does string concatenation.
        const parsed = (data.records || []).map((r: any) => ({
          ...r,
          prompt_tokens:     Number(r.prompt_tokens     || 0),
          completion_tokens: Number(r.completion_tokens || 0),
          total_tokens:      Number(r.total_tokens      || 0),
          latency_ms:        Number(r.latency_ms        || 0),
          status_code:       Number(r.status_code       || 0),
        }));
        setRecords(parsed);
        setTotal(data.total || 0);
      } catch {
        toast.error("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) {
      setPage(0);
      fetchLogs(0);
      fetchMonthStats();
    }
  }, [user]);

  function handlePageChange(p: number) {
    setPage(p);
    fetchLogs(p);
  }

  // Average latency: only successful calls with valid (>0) latency
  const validLatencyRecs = records.filter((r) => r.latency_ms > 0 && r.status_code >= 200 && r.status_code < 300);
  const avgLatency =
    validLatencyRecs.length > 0
      ? Math.round(validLatencyRecs.reduce((s, r) => s + r.latency_ms, 0) / validLatencyRecs.length)
      : 0;

  if (!user) {
    return (
      <>
        <div className="animate-enter">
          <div className="mb-6">
            <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>
              使用日志
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">查看您的 API 调用历史记录</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-12 border border-[rgba(0,0,0,0.06)] flex flex-col items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "#f5f0eb" }}
            >
              <LogIn className="w-6 h-6 text-[#da7757]" />
            </div>
            <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
              登录后查看使用日志
            </p>
            <p className="text-[13px] text-muted-foreground text-center max-w-xs">
              登录账号后，您可以查看完整的 API 调用历史、Token 消耗统计等信息
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="px-6 py-2.5 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
              style={{ fontWeight: 500 }}
            >
              立即登录
            </button>
          </div>
        </div>
        <UserAuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </>
    );
  }

  return (
    <>
      <div className="animate-enter">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>
              使用日志
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {user.name} · {user.department}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs(page)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] transition-colors disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button
              onClick={() => exportCsv(records)}
              disabled={records.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              <Download className="w-3.5 h-3.5" />
              导出 CSV
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            {
              label: "本月调用次数",
              value: monthStats ? monthStats.calls.toLocaleString() : "—",
              sub: `累计 ${total} 条记录`,
            },
            {
              label: "本月 Token 消耗",
              value: monthStats
                ? monthStats.tokens >= 10000
                  ? `${(monthStats.tokens / 10000).toFixed(1)}万`
                  : monthStats.tokens.toLocaleString()
                : "—",
              sub: "tokens",
            },
            {
              label: "成功调用均值延迟",
              value: avgLatency > 0 ? `${avgLatency} ms` : "—",
              sub: validLatencyRecs.length > 0 ? `基于本页 ${validLatencyRecs.length} 条成功记录` : "暂无成功记录",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-2xl shadow-sm p-4 border border-[rgba(0,0,0,0.06)]"
            >
              <p className="text-[12px] text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-[20px] text-foreground" style={{ fontWeight: 600 }}>
                {stat.value}
              </p>
              <p className="text-[12px] text-muted-foreground">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.06)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-[13px]">
              加载中...
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
                暂无日志记录
              </p>
              <p className="text-[13px] text-muted-foreground">您还没有调用过 API</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {["时间", "模型", "Token（总）", "Prompt", "Completion", "延迟", "状态码"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: 500,
                            color: "var(--muted-foreground)",
                            whiteSpace: "nowrap",
                            background: "#fafafa",
                          }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                  <tr>
                    <td colSpan={7} style={{ padding: "4px 16px", background: "#fafafa", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <span style={{ fontSize: "11px", color: "rgba(0,0,0,0.3)" }}>点击任意行可展开查看详细信息</span>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const isExpanded = expandedId === r.id;
                    return (
                      <>
                        <tr
                          key={r.id}
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          style={{
                            borderBottom: "1px solid rgba(0,0,0,0.05)",
                            background: isExpanded ? "#f5f0eb" : i % 2 === 0 ? "#fff" : "#fdfcfb",
                            cursor: "pointer",
                            transition: "background 0.15s",
                          }}
                        >
                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                            {formatTime(r.created_at)}
                          </td>
                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                background: "#f5f0eb",
                                fontSize: "12px",
                                fontWeight: 500,
                              }}
                            >
                              {r.model_id}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", fontWeight: 500 }}>
                            {r.total_tokens.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 16px", color: "var(--muted-foreground)" }}>
                            {r.prompt_tokens.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 16px", color: "var(--muted-foreground)" }}>
                            {r.completion_tokens.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                            {r.latency_ms} ms
                          </td>
                          <td style={{ padding: "10px 16px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                background: `${statusColor(r.status_code)}18`,
                                color: statusColor(r.status_code),
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              {r.status_code}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={r.id + "_detail"} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#faf8f6" }}>
                            <td colSpan={7} style={{ padding: "10px 16px" }}>
                              {/* Metadata grid */}
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "6px 24px", fontSize: "12px", marginBottom: "8px" }}>
                                {[
                                  { label: "记录 ID",    value: String(r.id), mono: true, small: true },
                                  { label: "时间（精确）", value: (() => {
                                      const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(r.created_at) ? r.created_at : r.created_at + "Z";
                                      const d = new Date(normalized);
                                      const p = (n: number) => String(n).padStart(2, "0");
                                      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
                                    })(), mono: false, small: false },
                                  { label: "模型",       value: r.model_id, mono: true, small: false },
                                  { label: "输入 Token", value: r.prompt_tokens > 0 ? r.prompt_tokens.toLocaleString() : "—", mono: false, small: false },
                                  { label: "输出 Token", value: r.completion_tokens > 0 ? r.completion_tokens.toLocaleString() : "—", mono: false, small: false },
                                  { label: "总 Token",   value: r.total_tokens > 0 ? r.total_tokens.toLocaleString() : "—", mono: false, small: false },
                                  { label: "延迟",       value: r.latency_ms > 0 ? `${r.latency_ms} ms` : "—", mono: false, small: false },
                                  { label: "状态码",     value: String(r.status_code), mono: false, small: false },
                                ].map(({ label, value, mono, small }) => (
                                  <div key={label}>
                                    <span style={{ color: "rgba(0,0,0,0.4)" }}>{label}：</span>
                                    <span style={{ color: "rgba(0,0,0,0.75)", fontFamily: mono ? "'JetBrains Mono', monospace" : undefined, fontSize: small ? "11px" : undefined }}>
                                      {value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {/* Error detail */}
                              {r.error_detail && (
                                <div style={{ fontSize: "12px", marginBottom: "6px" }}>
                                  <span style={{ color: "#ef4444", fontWeight: 500 }}>错误详情：</span>
                                  <code style={{ marginLeft: "4px", color: "#dc2626", background: "#fef2f2", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>
                                    {r.error_detail}
                                  </code>
                                </div>
                              )}
                              {/* Response preview */}
                              {r.response_preview && (
                                <div style={{ fontSize: "12px" }}>
                                  <span style={{ color: "rgba(0,0,0,0.4)", fontWeight: 500 }}>响应内容预览（前 500 字）：</span>
                                  <div style={{ marginTop: "4px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "rgba(0,0,0,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "120px", overflowY: "auto", fontFamily: "'JetBrains Mono', monospace" }}>
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
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[rgba(0,0,0,0.06)]">
              <p className="text-[12px] text-muted-foreground">
                第 {page + 1} / {totalPages} 页，共 {total} 条
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page === 0}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-3 py-1.5 rounded-lg text-[12px] border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p =
                    totalPages <= 5
                      ? i
                      : page < 3
                      ? i
                      : page > totalPages - 3
                      ? totalPages - 5 + i
                      : page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className="w-8 h-8 rounded-lg text-[12px] transition-colors"
                      style={{
                        background: p === page ? "#da7757" : "transparent",
                        color: p === page ? "#fff" : "var(--foreground)",
                        fontWeight: p === page ? 600 : 400,
                        border: p === page ? "none" : "1px solid rgba(0,0,0,0.10)",
                      }}
                    >
                      {p + 1}
                    </button>
                  );
                })}
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-3 py-1.5 rounded-lg text-[12px] border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
