import { Outlet, NavLink, useLocation } from "react-router";
import { Menu, X, LogIn, LogOut } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { NotificationPopup } from "./notification-popup";
import { ModelProvider } from "./model-context";
import { useModels } from "./model-context";
import { UserProvider, useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";
import brdcLogo from "../../assets/b4f5eede468480ea703457a9aa6437d3a2beade8.png";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/models", label: "模型" },
  { to: "/apply", label: "申请" },
  { to: "/examples", label: "示例" },
  { to: "/forum", label: "社区" },
  { to: "/logs", label: "日志" },
  { to: "/stats", label: "统计" },
  { to: "/notifications", label: "通知", showDot: true },
];

// Inner layout that can access ModelContext + UserContext
function LayoutInner() {
  const location = useLocation();
  const { notifications } = useModels();
  const { user, logout } = useUser();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("brdc_seen_notifs") || "[]"); } catch { return []; }
  });

  // Mark notifications as seen when on /notifications page
  useEffect(() => {
    if (location.pathname === "/notifications") {
      const newIds = notifications.filter((n) => n.isNew).map((n) => n.id);
      if (newIds.length > 0) {
        const merged = [...new Set([...seenIds, ...newIds])];
        setSeenIds(merged);
        localStorage.setItem("brdc_seen_notifs", JSON.stringify(merged));
      }
    }
  }, [location.pathname, notifications]);

  // Show popup on first visit
  useEffect(() => {
    const dismissed = sessionStorage.getItem("notif-dismissed");
    if (!dismissed) {
      const timer = setTimeout(() => setShowNotifications(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissNotifications = () => {
    setShowNotifications(false);
    sessionStorage.setItem("notif-dismissed", "true");
  };

  // Red dot: any isNew notification not yet seen
  const hasUnread = notifications.some((n) => n.isNew && !seenIds.includes(n.id));

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/40"
        style={{
          backgroundColor: 'rgba(245,240,235,0.88)',
          WebkitBackdropFilter: 'blur(20px)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ maxWidth: "1152px", margin: "0 auto", padding: "0 24px" }}>
          <div className="flex items-center justify-between h-14">
            <NavLink to="/" className="flex items-center gap-2.5 shrink-0 group">
              <img src={brdcLogo} alt="BRDC.ai" className="w-7 h-7 object-contain" />
              <span className="text-[15px] text-foreground tracking-tight" style={{ fontWeight: 600 }}>
                BRDC.ai API
              </span>
            </NavLink>

            {/* Pure CSS nav — no JS layout animation */}
            <nav style={{ display: "none" }} className="md-flex-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  style={({ isActive }) => ({
                    position: "relative", padding: "6px 14px", borderRadius: "8px",
                    fontSize: "13px", textDecoration: "none",
                    color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                    background: isActive ? "var(--secondary)" : "transparent",
                    fontWeight: isActive ? 500 : 400,
                    transition: "background 0.15s, color 0.15s",
                    display: "inline-flex", alignItems: "center",
                  })}
                >
                  {({ isActive: _ia }) => (
                    <span style={{ position: "relative" }}>
                      {item.label}
                      {item.showDot && hasUnread && (
                        <span className="dot-red" style={{ position: "absolute", top: "-4px", right: "-8px" }} />
                      )}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* User login badge */}
            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[10px]" style={{ fontWeight: 700 }}>
                      {user.name.charAt(0)}
                    </div>
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{user.name}</span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="退出登录"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" /> 登录
                </button>
              )}
              <button
                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>

        <div
          className={`md:hidden border-t border-border/40 overflow-hidden collapse-content${mobileOpen ? " collapse-open" : ""}`}
          style={{ backgroundColor: 'rgba(245,240,235,0.97)', WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}
        >
          <div className="px-5 py-3 space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] transition-colors ${
                    isActive ? "text-foreground bg-secondary" : "text-muted-foreground"
                  }`
                }
              >
                {item.label}
                {item.showDot && hasUnread && (
                  <span className="w-2 h-2 rounded-full bg-red-500 ml-1" />
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      {/* Page container — max-w-6xl gives cards room to breathe on 1366px screens */}
      <main
        key={location.pathname}
        className="animate-enter"
        style={{ maxWidth: "1152px", margin: "0 auto", padding: "32px 24px 40px", width: "100%", boxSizing: "border-box" }}
      >
        {/* Suspense catches lazy-loaded route chunks while they download */}
        <Suspense fallback={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "240px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <div className="animate-spin" style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid #e0d8cf", borderTopColor: "#da7757" }} />
              <span style={{ fontSize: "13px", color: "#8b7e74" }}>加载中…</span>
            </div>
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>

      <NotificationPopup show={showNotifications} onDismiss={dismissNotifications} />
      <UserAuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

export function Layout() {
  return (
    <UserProvider>
      <ModelProvider>
        <LayoutInner />
      </ModelProvider>
    </UserProvider>
  );
}
