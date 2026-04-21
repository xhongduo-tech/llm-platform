import { useMemo } from "react";
import { ArrowUpCircle, ArrowDownCircle, Wrench, Info, Bell } from "lucide-react";
import { useModels } from "./model-context";
import type { NotificationItem } from "./model-data";

const config: Record<NotificationItem["type"], { icon: typeof Info; dot: string; bg: string; text: string; iconBg: string }> = {
  online: { icon: ArrowUpCircle, dot: "bg-green-400", bg: "bg-green-50/80", text: "text-green-600", iconBg: "bg-green-50 text-green-500" },
  offline: { icon: ArrowDownCircle, dot: "bg-red-400", bg: "bg-red-50/80", text: "text-red-500", iconBg: "bg-red-50 text-red-400" },
  maintenance: { icon: Wrench, dot: "bg-amber-400", bg: "bg-amber-50/80", text: "text-amber-600", iconBg: "bg-amber-50 text-amber-500" },
  info: { icon: Info, dot: "bg-blue-400", bg: "bg-blue-50/80", text: "text-blue-500", iconBg: "bg-blue-50 text-blue-400" },
};

const typeLabel: Record<NotificationItem["type"], string> = { online: "上线", offline: "下线", maintenance: "维护", info: "公告" };

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  if (diff < 30) return `${Math.floor(diff / 7)} 周前`;
  return `${Math.floor(diff / 30)} 个月前`;
}

function groupByMonth(items: NotificationItem[]): { label: string; items: NotificationItem[] }[] {
  const groups: Record<string, NotificationItem[]> = {};
  for (const n of items) {
    const d = new Date(n.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const [y, m] = key.split("-");
      return { label: `${y} 年 ${parseInt(m)} 月`, items };
    });
}

export function NotificationsPage() {
  const { notifications } = useModels();

  const monthGroups = useMemo(() => groupByMonth(notifications), [notifications]);
  const newCount = notifications.filter((n) => n.isNew).length;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="animate-enter">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] sm:text-[32px] text-foreground" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
              通知记录
            </h1>
            <p className="text-muted-foreground text-[13.5px] mt-1">
              模型状态变更与平台公告
            </p>
          </div>
          {newCount > 0 && (
            <div
              className="animate-enter anim-delay-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#fdf0eb] text-[#c96442] text-[12px]"
              style={{ fontWeight: 500 }}
            >
              <Bell className="w-3.5 h-3.5" />
              {newCount} 条新通知
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="flex gap-3 mt-5">
          {(["online", "offline", "maintenance", "info"] as const).map((type) => {
            const count = notifications.filter((n) => n.type === type).length;
            if (count === 0) return null;
            const c = config[type];
            const Icon = c.icon;
            return (
              <div key={type} className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60">
                <div className={`w-5 h-5 rounded-md flex items-center justify-center ${c.iconBg}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <span>{typeLabel[type]}</span>
                <span className="tabular-nums" style={{ fontWeight: 500 }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grouped timeline */}
      <div className="space-y-8">
        {monthGroups.map((group, gi) => (
          <div
            key={group.label}
            className={`animate-enter anim-delay-${Math.min(gi, 7)}`}
          >
            {/* Month label */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[12px] text-muted-foreground/50 shrink-0" style={{ fontWeight: 500 }}>
                {group.label}
              </span>
              <div className="flex-1 h-px bg-border/25" />
            </div>

            {/* Items */}
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/30" />

              <div className="space-y-2">
                {group.items.map((n, i) => {
                  const c = config[n.type];
                  const Icon = c.icon;
                  return (
                    <div
                      key={n.id}
                      className={`animate-enter anim-delay-${Math.min(gi + i, 7)} relative flex gap-3.5 group`}
                    >
                      {/* Dot on timeline */}
                      <div className="relative z-10 shrink-0 mt-4">
                        <div
                          className={`w-[9px] h-[9px] rounded-full ${c.dot} ring-[3px] ring-background ml-[11px]`}
                        />
                      </div>

                      {/* Card */}
                      <div className="flex-1 bg-white rounded-xl px-4 py-3.5 border border-border/10 shadow-sm hover:shadow-md transition-shadow duration-200 hover:border-border/20">
                        <div className="flex items-start gap-3">
                          {/* Type icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${c.iconBg}`}>
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Title row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>
                                {n.title}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${c.bg} ${c.text}`} style={{ fontWeight: 500 }}>
                                {typeLabel[n.type]}
                              </span>
                              {n.isNew && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e9a08a]" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                </span>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1">
                              {n.description}
                            </p>

                            {/* Date */}
                            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground/35">
                              <span>{n.date}</span>
                              <span className="opacity-50">·</span>
                              <span>{formatRelativeDate(n.date)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <div className="animate-fade text-center py-24">
          <Bell className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-[14px]">暂无通知</p>
        </div>
      )}
    </div>
  );
}
