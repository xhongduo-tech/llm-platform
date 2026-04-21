import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { BarChart2, LogIn, ChevronLeft, ChevronRight } from "lucide-react";
import { useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";

interface MonthlyData {
  month: number;
  calls: number;
  tokens: number;
}

interface StatsResponse {
  year: number;
  monthly: MonthlyData[];
  total_tokens: number;
  total_calls: number;
}

const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function buildChartData(monthly: MonthlyData[]) {
  return MONTH_NAMES.map((name, i) => {
    const found = monthly.find((m) => m.month === i + 1);
    return {
      month: name,
      调用次数: found?.calls ?? 0,
      Token消耗: found?.tokens ?? 0,
    };
  });
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl px-4 py-3 shadow-lg text-[13px]"
    >
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const { user } = useUser();
  const [showAuth, setShowAuth] = useState(false);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const minYear = currentYear - 2;
  const maxYear = currentYear;

  async function fetchStats(y: number) {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/user/stats?year=${y}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || err?.error || "加载统计数据失败");
        return;
      }
      const data: StatsResponse = await res.json();
      setStats(data);
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) fetchStats(year);
    else setStats(null);
  }, [user, year]);

  function prevYear() {
    if (year > minYear) setYear(year - 1);
  }
  function nextYear() {
    if (year < maxYear) setYear(year + 1);
  }

  if (!user) {
    return (
      <>
        <div className="animate-enter">
          <div className="mb-6">
            <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>
              用量统计
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">查看您的 API 使用趋势分析</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-12 border border-[rgba(0,0,0,0.06)] flex flex-col items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "#f5f0eb" }}
            >
              <LogIn className="w-6 h-6 text-[#da7757]" />
            </div>
            <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
              登录后查看用量统计
            </p>
            <p className="text-[13px] text-muted-foreground text-center max-w-xs">
              登录账号后，您可以查看月度调用趋势、Token 消耗走势等统计图表
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

  const chartData = stats ? buildChartData(stats.monthly) : buildChartData([]);

  // ── Monthly KPIs ──────────────────────────────────────────────────────────
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const isCurrentYear = year === new Date().getFullYear();

  function getMonth(m: number) {
    return stats?.monthly.find((x) => x.month === m) ?? { calls: 0, tokens: 0 };
  }

  // For the selected year, show the latest month with data; default to current month
  const focusMonth = isCurrentYear ? currentMonth : 12;
  const thisMo  = getMonth(focusMonth);
  const lastMo  = getMonth(focusMonth - 1);

  // Month-over-month growth helpers
  function growth(curr: number, prev: number): string {
    if (prev === 0) return curr > 0 ? "+100%" : "—";
    const pct = Math.round(((curr - prev) / prev) * 100);
    return (pct >= 0 ? "+" : "") + pct + "%";
  }
  function growthColor(curr: number, prev: number): string {
    if (prev === 0) return curr > 0 ? "#22c55e" : "#9ca3af";
    return curr >= prev ? "#22c55e" : "#ef4444";
  }

  // Monthly average (only months that have data)
  const activeMonths = stats ? stats.monthly.filter((m) => m.calls > 0) : [];
  const monthlyAvgCalls  = activeMonths.length > 0 ? Math.round(activeMonths.reduce((s, m) => s + m.calls, 0)  / activeMonths.length) : 0;
  const monthlyAvgTokens = activeMonths.length > 0 ? Math.round(activeMonths.reduce((s, m) => s + m.tokens, 0) / activeMonths.length) : 0;

  const monthLabel = isCurrentYear ? "本月" : `${year}年${focusMonth}月`;

  return (
    <>
      <div className="animate-enter">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>
              用量统计
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {user.name} · {user.department}
            </p>
          </div>
          {/* Year selector */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-[rgba(0,0,0,0.10)] px-3 py-1.5 shadow-sm">
            <button
              onClick={prevYear}
              disabled={year <= minYear}
              className="p-1 rounded-lg hover:bg-[#f5f0eb] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[14px] min-w-[60px] text-center" style={{ fontWeight: 600 }}>
              {year} 年
            </span>
            <button
              onClick={nextYear}
              disabled={year >= maxYear}
              className="p-1 rounded-lg hover:bg-[#f5f0eb] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {/* Card 1: Monthly calls */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-[rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#da7757" }} />
              <p className="text-[12px] text-muted-foreground">{monthLabel}调用次数</p>
            </div>
            <p className="text-[24px]" style={{ fontWeight: 700, color: "#da7757" }}>
              {loading ? <span className="text-[16px] text-muted-foreground">加载中...</span> : (stats ? thisMo.calls.toLocaleString() : "—")}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[12px] text-muted-foreground">环比</p>
              <p className="text-[12px]" style={{ fontWeight: 600, color: growthColor(thisMo.calls, lastMo.calls) }}>
                {stats ? growth(thisMo.calls, lastMo.calls) : "—"}
              </p>
            </div>
          </div>

          {/* Card 2: Monthly tokens */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-[rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#3a3a3a" }} />
              <p className="text-[12px] text-muted-foreground">{monthLabel} Token 消耗</p>
            </div>
            <p className="text-[24px]" style={{ fontWeight: 700, color: "#3a3a3a" }}>
              {loading ? <span className="text-[16px] text-muted-foreground">加载中...</span>
                : stats ? (thisMo.tokens >= 10000 ? `${(thisMo.tokens / 10000).toFixed(1)}万` : thisMo.tokens.toLocaleString()) : "—"}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[12px] text-muted-foreground">环比</p>
              <p className="text-[12px]" style={{ fontWeight: 600, color: growthColor(thisMo.tokens, lastMo.tokens) }}>
                {stats ? growth(thisMo.tokens, lastMo.tokens) : "—"}
              </p>
            </div>
          </div>

          {/* Card 3: Monthly average */}
          <div className="bg-white rounded-2xl shadow-sm p-5 border border-[rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#6b7280" }} />
              <p className="text-[12px] text-muted-foreground">月均调用</p>
            </div>
            <p className="text-[24px]" style={{ fontWeight: 700, color: "#6b7280" }}>
              {loading ? <span className="text-[16px] text-muted-foreground">加载中...</span> : (stats ? monthlyAvgCalls.toLocaleString() : "—")}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              月均 Token: {stats ? (monthlyAvgTokens >= 10000 ? `${(monthlyAvgTokens / 10000).toFixed(1)}万` : monthlyAvgTokens.toLocaleString()) : "—"}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-4 h-4 text-[#da7757]" />
            <h2 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
              月度使用趋势 · {year}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64 text-[13px] text-muted-foreground">
              加载中...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                barGap={4}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#888" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="calls"
                  orientation="left"
                  tick={{ fontSize: 11, fill: "#aaa" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="tokens"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#aaa" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Legend
                  wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                  iconType="square"
                  iconSize={10}
                />
                <Bar
                  yAxisId="calls"
                  dataKey="调用次数"
                  fill="#da7757"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  yAxisId="tokens"
                  dataKey="Token消耗"
                  fill="#3a3a3a"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Empty state */}
        {stats && stats.total_calls === 0 && !loading && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-8 border border-[rgba(0,0,0,0.06)] flex flex-col items-center gap-2 text-center">
            <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
              {year} 年暂无调用记录
            </p>
            <p className="text-[13px] text-muted-foreground">
              开始使用 API 后，这里将显示您的月度统计数据
            </p>
          </div>
        )}
      </div>
    </>
  );
}
