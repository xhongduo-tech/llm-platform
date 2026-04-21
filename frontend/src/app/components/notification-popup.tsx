import { X, ArrowUpCircle, ArrowDownCircle, Wrench, Info, Bell } from "lucide-react";
import { Link } from "react-router";
import { useModels } from "./model-context";

const typeConfig = {
  online: { icon: ArrowUpCircle, dot: "bg-green-400", bg: "bg-green-50", text: "text-green-600", label: "上线" },
  offline: { icon: ArrowDownCircle, dot: "bg-red-400", bg: "bg-red-50", text: "text-red-500", label: "下线" },
  maintenance: { icon: Wrench, dot: "bg-amber-400", bg: "bg-amber-50", text: "text-amber-600", label: "维护" },
  info: { icon: Info, dot: "bg-blue-400", bg: "bg-blue-50", text: "text-blue-500", label: "公告" },
};

export function NotificationPopup({
  show,
  onDismiss,
}: {
  show: boolean;
  onDismiss: () => void;
}) {
  const { notifications } = useModels();
  const newNotifications = notifications.filter((n) => n.isNew);

  if (newNotifications.length === 0 || !show) return null;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.20)", WebkitBackdropFilter: "blur(2px)", backdropFilter: "blur(2px)" }}
      onClick={onDismiss}
    >
      {/* Card */}
      <div
        className="animate-enter bg-white rounded-2xl w-full overflow-hidden"
        style={{
          maxWidth: "448px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#fce9e2] flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-[16px] text-foreground" style={{ fontWeight: 500 }}>
                最新动态
              </h3>
              <p className="text-[12px] text-muted-foreground">
                {newNotifications.length} 条新通知
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Notifications */}
        <div className="px-4 pb-2 overflow-y-auto" style={{ maxHeight: "320px", scrollbarWidth: "thin" }}>
          {newNotifications.map((n, i) => {
            const c = typeConfig[n.type];
            const Icon = c.icon;
            return (
              <div
                key={n.id}
                className={`animate-enter anim-delay-${Math.min(i + 1, 7)} flex gap-3 px-3 py-3.5 rounded-xl hover:bg-secondary/50 transition-colors`}
              >
                <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0 mt-2`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>
                      {n.title}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
                      {c.label}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                    {n.description}
                  </p>
                  <span className="text-[11px] text-muted-foreground mt-1 block" style={{ opacity: 0.5 }}>{n.date}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/30 flex items-center justify-between">
          <Link
            to="/notifications"
            onClick={onDismiss}
            className="text-[13px] text-primary hover:underline"
          >
            查看全部通知
          </Link>
          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-secondary rounded-lg text-[13px] text-foreground hover:bg-secondary/80 transition-colors"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
