import { useState, useRef, useCallback } from "react";
import { Search, ArrowRight, X, Info, PowerOff, ChevronDown, AlertTriangle } from "lucide-react";
import { categoryLabels, tagColors, badgeStyle, type Model } from "./model-data";
import { useModels } from "./model-context";
import { useNavigate } from "react-router";
import { ProviderIcon } from "./provider-logos";


const categoryOrder: Model["category"][] = ["flagship", "chat", "vision", "embedding", "reranker"];

const categoryEmoji: Record<Model["category"], string> = {
  flagship: "✦",
  chat: "Aa",
  vision: "◎",
  embedding: "⊕",
  reranker: "⇅",
};

export function ModelCatalog() {
  const { models } = useModels();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Model["category"] | "all">("all");
  const [tooltipModel, setTooltipModel] = useState<Model | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const navigate = useNavigate();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchFiltered = models.filter((m) =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.provider.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase()) ||
    (m.tags || []).some((t) => t.includes(search))
  );

  const onlineFiltered = searchFiltered.filter(
    (m) => m.status === "online" || m.status === "maintenance" || m.status === "exclusive" || m.status === "unstable"
  );
  const offlineModels = searchFiltered.filter((m) => m.status === "offline");

  const filtered = onlineFiltered.filter(
    (m) => activeCategory === "all" || m.category === activeCategory
  );

  const grouped = categoryOrder
    .map((cat) => ({ category: cat, models: filtered.filter((m) => m.category === cat) }))
    .filter((g) => g.models.length > 0);

  const onlineCount = models.filter((m) => m.status === "online").length;
  const unstableCount = models.filter((m) => m.status === "unstable").length;
  const [offlineExpanded, setOfflineExpanded] = useState(true);

  const handleApply = (modelId: string) => navigate(`/apply?model=${encodeURIComponent(modelId)}`);

  const showTooltip = useCallback((m: Model, e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const target = e.currentTarget as HTMLElement;
    hoverTimerRef.current = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const vW = window.innerWidth;
      const vH = window.innerHeight;
      const TW = 300;  // tooltip width
      const TH = 220;  // approx tooltip height
      const GAP = 12;  // gap between card edge and tooltip

      // Prefer the side with more available space
      const spaceRight = vW - rect.right - GAP;
      const spaceLeft  = rect.left - GAP;

      let x: number;
      if (spaceRight >= TW + 4) {
        // Enough room to the right
        x = rect.right + GAP;
      } else if (spaceLeft >= TW + 4) {
        // Enough room to the left
        x = rect.left - GAP - TW;
      } else {
        // Neither side works — center horizontally, show below card
        x = Math.max(16, Math.min(vW - TW - 16, rect.left + (rect.width - TW) / 2));
      }

      // Vertical: center on card middle, clamped to viewport
      const idealY = rect.top + (rect.height - TH) / 2;
      const y = Math.max(16, Math.min(idealY, vH - TH - 16));

      setTooltipPos({ x, y });
      setTooltipModel(m);
    }, 350);
  }, []);

  const hideTooltip = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setTooltipModel(null);
  }, []);

  const catCounts: Record<string, number> = {};
  for (const cat of categoryOrder) {
    catCounts[cat] = onlineFiltered.filter((m) => m.category === cat).length;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="animate-enter flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.25, color: "var(--foreground)" }}>
            模型清单
          </h1>
          <p style={{ fontSize: "13.5px", color: "var(--muted-foreground)", marginTop: "4px" }}>
            共 <strong style={{ fontWeight: 500, color: "var(--foreground)" }}>{models.length}</strong> 个模型，
            <strong style={{ fontWeight: 500, color: "#16a34a" }}>{onlineCount}</strong> 个在线可用
            {unstableCount > 0 && (
              <span>，<strong style={{ fontWeight: 500, color: "#d97706" }}>{unstableCount}</strong> 个非稳定版本</span>
            )}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", width: "100%", maxWidth: "320px" }}>
          <Search style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "var(--muted-foreground)", opacity: 0.4 }} />
          <input
            type="text"
            placeholder="搜索模型名称、提供商..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", paddingLeft: "38px", paddingRight: "36px",
              paddingTop: "10px", paddingBottom: "10px",
              borderRadius: "12px", background: "#ffffff",
              fontSize: "13.5px", border: "1px solid var(--border)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)", outline: "none",
              color: "var(--foreground)",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", padding: "2px", borderRadius: "6px", background: "none", border: "none", cursor: "pointer" }}>
              <X style={{ width: "13px", height: "13px", color: "var(--muted-foreground)" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Notice Banner ── */}
      <div
        className="animate-fade anim-delay-1"
        style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          padding: "12px 16px", borderRadius: "12px",
          background: "#fffbeb",
          border: "1px solid #fde68a",
        }}
      >
        <AlertTriangle style={{ width: "15px", height: "15px", color: "#d97706", flexShrink: 0, marginTop: "1px" }} />
        <p style={{ fontSize: "12.5px", color: "#92400e", lineHeight: 1.65, margin: 0 }}>
          <strong style={{ fontWeight: 600 }}>注意：</strong>
          生产服务请联系 <span style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: "4px" }}>001536077</span> 获取生产服务模型，当前仅包含测试网段模型，存在不稳定性，非 LTS 版本，请悉知。
        </p>
      </div>

      {/* ── Category filter tabs ── */}
      <div className="animate-fade anim-delay-2" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <button
          onClick={() => setActiveCategory("all")}
          style={{
            padding: "6px 14px", borderRadius: "8px", fontSize: "12.5px", border: "none", cursor: "pointer",
            fontWeight: activeCategory === "all" ? 500 : 400,
            background: activeCategory === "all" ? "var(--foreground)" : "#ffffff",
            color: activeCategory === "all" ? "var(--background)" : "var(--muted-foreground)",
            boxShadow: activeCategory === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            outline: activeCategory === "all" ? "none" : "1px solid var(--border)",
          }}
        >
          全部 <span style={{ opacity: 0.6, marginLeft: "2px" }}>{searchFiltered.length}</span>
        </button>
        {categoryOrder.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "6px 14px", borderRadius: "8px", fontSize: "12.5px", border: "none", cursor: "pointer",
              fontWeight: activeCategory === cat ? 500 : 400,
              background: activeCategory === cat ? "var(--foreground)" : "#ffffff",
              color: activeCategory === cat ? "var(--background)" : "var(--muted-foreground)",
              boxShadow: activeCategory === cat ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              outline: activeCategory === cat ? "none" : "1px solid var(--border)",
            }}
          >
            <span style={{ marginRight: "4px", opacity: 0.6, fontSize: "11px" }}>{categoryEmoji[cat]}</span>
            {categoryLabels[cat]}
            {catCounts[cat] > 0 && <span style={{ opacity: 0.5, marginLeft: "4px" }}>{catCounts[cat]}</span>}
          </button>
        ))}
      </div>

      {/* ── Model groups ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
        {grouped.map((group, gi) => (
          <section key={group.category}>
            {activeCategory === "all" && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--muted-foreground)", opacity: 0.7 }}>
                  {categoryLabels[group.category]}
                </span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.3 }} />
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", opacity: 0.4 }}>{group.models.length} 个模型</span>
              </div>
            )}

            {/* 2-col default → 3-col only on very wide screens */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
              {group.models.map((m, i) => {
                const isExclusive = m.status === "exclusive";
                const isUnstable = m.status === "unstable";
                const isUnavailable = m.status !== "online" && m.status !== "unstable" && !isExclusive;
                const delayClass = `anim-delay-${Math.min(i, 7)}` as string;

                return (
                  <div
                    key={m.id}
                    className={`animate-enter ${delayClass}`}
                    onMouseEnter={(e) => m.description && showTooltip(m, e)}
                    onMouseLeave={hideTooltip}
                    style={{
                      position: "relative",
                      borderRadius: "16px",
                      border: isExclusive
                        ? "1px solid #fcd34d"
                        : isUnstable
                        ? "1px solid rgba(245,158,11,0.35)"
                        : isUnavailable
                        ? "1px solid rgba(0,0,0,0.06)"
                        : "1px solid rgba(0,0,0,0.07)",
                      background: isUnavailable ? "rgba(255,255,255,0.6)" : "#ffffff",
                      boxShadow: isUnavailable ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                      opacity: isUnavailable ? 0.5 : 1,
                      cursor: isUnavailable ? "not-allowed" : "default",
                      display: "flex",
                      flexDirection: "column",
                      transition: "box-shadow 0.18s, border-color 0.18s",
                    }}
                    onMouseOver={(e) => {
                      if (!isUnavailable) {
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.13)";
                      }
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
                      (e.currentTarget as HTMLElement).style.borderColor = isExclusive ? "#fcd34d" : isUnstable ? "rgba(245,158,11,0.35)" : "rgba(0,0,0,0.07)";
                    }}
                  >
                    {/* Exclusive ribbon */}
                    {isExclusive && (
                      <div style={{
                        position: "absolute", top: 0, right: "16px",
                        background: "#f59e0b", color: "#fff",
                        fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em",
                        padding: "3px 8px", borderRadius: "0 0 6px 6px",
                      }}>
                        独占
                      </div>
                    )}

                    <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", flex: 1 }}>
                      {/* Top row */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ flexShrink: 0, marginTop: "2px" }}>
                          <ProviderIcon provider={m.provider} size="md" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Name + dot + badge in one row, wrap gracefully */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)", wordBreak: "break-all" }}>
                              {m.name}
                            </span>
                            <span className={
                              m.status === "online" ? "dot-green" :
                              m.status === "exclusive" ? "dot-amber" :
                              m.status === "maintenance" ? "dot-amber" :
                              m.status === "unstable" ? "dot-amber" : "dot-gray"
                            } />
                            {m.badge && (
                              <span style={{
                                fontSize: "10px", fontWeight: 500,
                                padding: "2px 7px", borderRadius: "9999px",
                                flexShrink: 0, whiteSpace: "nowrap",
                                ...(badgeStyle[m.badge]
                                  ? {} // handled via className
                                  : {}),
                              }} className={badgeStyle[m.badge] || "bg-gray-100 text-gray-500"}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontSize: "11.5px", color: "var(--muted-foreground)", opacity: 0.55 }}>
                            <span>{m.provider}</span>
                            {m.contextWindow && m.contextWindow !== "-" && (
                              <><span style={{ opacity: 0.5 }}>·</span><span>{m.contextWindow}</span></>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p style={{
                        fontSize: "13px", color: "var(--muted-foreground)", lineHeight: 1.65,
                        marginTop: "12px",
                        display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
                        overflow: "hidden", minHeight: "43px",
                      }}>
                        {m.shortDescription || m.description}
                      </p>

                      {/* Unavailable reason */}
                      {(isUnavailable || isExclusive) && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "11.5px", color: isExclusive ? "#92400e" : "var(--muted-foreground)", opacity: 0.65 }}>
                          <Info style={{ width: "12px", height: "12px", flexShrink: 0 }} />
                          <span>{isExclusive ? (m.offlineReason || "独占部署中，暂不开放申请") : (m.offlineReason || "该模型暂不可用")}</span>
                        </div>
                      )}
                      {/* Unstable warning */}
                      {isUnstable && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "11.5px", color: "#d97706" }}>
                          <AlertTriangle style={{ width: "12px", height: "12px", flexShrink: 0 }} />
                          <span>{m.offlineReason || "非稳定支持版本，可能随模测调整"}</span>
                        </div>
                      )}

                      {/* Tags + apply button */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", flex: 1, minWidth: 0 }}>
                          {m.tags && m.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className={tagColors[tag] || "bg-gray-50 text-gray-500"}
                              style={{ fontSize: "10px", padding: "3px 7px", borderRadius: "6px" }}>
                              {tag}
                            </span>
                          ))}
                          {m.tags && m.tags.length > 3 && (
                            <span style={{ fontSize: "10px", padding: "3px 4px", color: "var(--muted-foreground)", opacity: 0.4 }}>
                              +{m.tags.length - 3}
                            </span>
                          )}
                        </div>
                        {(m.status === "online" || m.status === "unstable") && (
                          <button
                            onClick={() => handleApply(m.id)}
                            className="apply-btn"
                            style={{
                              display: "flex", alignItems: "center", gap: "4px",
                              fontSize: "11.5px", fontWeight: 500, padding: "5px 10px",
                              borderRadius: "8px", border: "none", cursor: "pointer",
                              color: "#c96442", background: "transparent",
                              transition: "background 0.15s",
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fce9e2")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            申请 <ArrowRight style={{ width: "11px", height: "11px" }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="animate-fade" style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: "40px", color: "var(--muted-foreground)", opacity: 0.3, marginBottom: "12px" }}>∅</div>
          <p style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>没有找到匹配的模型</p>
          {search && (
            <button onClick={() => { setSearch(""); setActiveCategory("all"); }}
              style={{ marginTop: "12px", fontSize: "13px", color: "#c96442", background: "none", border: "none", cursor: "pointer" }}>
              清除搜索条件
            </button>
          )}
        </div>
      )}

      {/* ── Offline models (accordion) ── */}
      {offlineModels.length > 0 && activeCategory === "all" && (
        <section className="animate-fade anim-delay-4">
          <button
            onClick={() => setOfflineExpanded((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: "14px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <PowerOff style={{ width: "13px", height: "13px", color: "var(--muted-foreground)", opacity: 0.4 }} />
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--muted-foreground)", opacity: 0.6 }}>已下线</span>
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)", opacity: 0.35 }}>{offlineModels.length}</span>
            </div>
            <div style={{ flex: 1, height: "1px", background: "var(--border)", opacity: 0.2 }} />
            <ChevronDown style={{
              width: "13px", height: "13px", color: "var(--muted-foreground)", opacity: 0.3,
              transition: "transform 0.2s",
              transform: offlineExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            }} />
          </button>

          <div className={`collapse-content${offlineExpanded ? " collapse-open" : ""}`}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
                  {offlineModels.map((m) => (
                    <div key={m.id}
                      onMouseEnter={(e) => m.description && showTooltip(m, e)}
                      onMouseLeave={hideTooltip}
                      style={{
                        borderRadius: "16px", border: "1px solid rgba(0,0,0,0.06)",
                        background: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column",
                      }}
                    >
                      <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", flex: 1, opacity: 0.55 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                          <div style={{ flexShrink: 0, marginTop: "2px", filter: "grayscale(1)" }}>
                            <ProviderIcon provider={m.provider} size="md" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--foreground)" }}>{m.name}</span>
                              <span className="dot-gray" />
                              <span style={{ fontSize: "10px", fontWeight: 500, padding: "2px 7px", borderRadius: "9999px", background: "#f3f4f6", color: "#9ca3af" }}>已下线</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontSize: "11.5px", color: "var(--muted-foreground)", opacity: 0.45 }}>
                              <span>{m.provider}</span>
                              {m.contextWindow && <><span style={{ opacity: 0.5 }}>·</span><span>{m.contextWindow}</span></>}
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", lineHeight: 1.65, marginTop: "12px", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", minHeight: "43px" }}>
                          {m.shortDescription || m.description}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "11px", color: "var(--muted-foreground)", opacity: 0.4 }}>
                          <Info style={{ width: "12px", height: "12px", flexShrink: 0 }} />
                          <span>{m.offlineReason || "该模型已下线，暂不接受新申请"}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "auto", paddingTop: "14px" }}>
                          {m.tags && m.tags.slice(0, 3).map((tag) => (
                            <span key={tag} style={{ fontSize: "10px", padding: "3px 7px", borderRadius: "6px", background: "#f9fafb", color: "#9ca3af" }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
          </div>
        </section>
      )}

      {/* ── Hover tooltip (fixed, pointer-events:none) ── */}
      {/* Outer div always exists so CSS opacity transition works; inner content guarded for null safety */}
      <div
        className={`tooltip-fade${tooltipModel ? " tooltip-visible" : ""}`}
        style={{ position: "fixed", left: tooltipPos.x, top: tooltipPos.y, width: 300, zIndex: 100, pointerEvents: "none" }}
      >
        {tooltipModel && (
          <div style={{ borderRadius: "12px", padding: "14px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", backgroundColor: "rgba(26,22,19,0.93)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <ProviderIcon provider={tooltipModel.provider} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#ffffff" }}>{tooltipModel.name}</span>
                  <span className={
                    tooltipModel.status === "online" ? "dot-green" :
                    tooltipModel.status === "unstable" || tooltipModel.status === "maintenance" || tooltipModel.status === "exclusive" ? "dot-amber" :
                    "dot-gray"
                  } />
                </div>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
                  {tooltipModel.provider}{tooltipModel.contextWindow && tooltipModel.contextWindow !== "-" ? ` · ${tooltipModel.contextWindow}` : ""}
                </span>
              </div>
            </div>
            <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", margin: "10px 0" }} />
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", lineHeight: 1.75 }}>
              {tooltipModel.description}
            </p>
            {tooltipModel.tags && tooltipModel.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                {tooltipModel.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: "10px", padding: "3px 7px", borderRadius: "6px", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
