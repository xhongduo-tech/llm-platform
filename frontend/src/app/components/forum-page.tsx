import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Pin, MessageSquare, Plus, ChevronLeft, ChevronRight, X, PenLine } from "lucide-react";
import { useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";

interface ForumPost {
  id: number;
  auth_id: string;
  author_name: string;
  department: string;
  title: string;
  content: string;
  is_pinned: boolean;
  reply_count: number;
  created_at: string;
}

interface PostsResponse {
  total: number;
  posts: ForumPost[];
}

const PAGE_SIZE = 20;

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function avatarBg(name: string): string {
  const colors = ["#da7757", "#5b7fa6", "#6b9e6f", "#9b6ea8", "#c07840", "#5a8fa8"];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return colors[sum % colors.length];
}

// New Post Modal
interface NewPostModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NewPostModal({ open, onClose, onSuccess }: NewPostModalProps) {
  const { user } = useUser();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setTitle(""); setContent(""); setLoading(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) { toast.error("请输入帖子标题"); return; }
    if (!content.trim()) { toast.error("请输入帖子内容"); return; }
    if (title.trim().length > 100) { toast.error("标题不能超过100字"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/forum/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || "发布失败");
        return;
      }
      toast.success("帖子发布成功！");
      onSuccess();
      onClose();
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-[#faf8f6] text-[14px] text-foreground placeholder:text-[#b0a89e] focus:outline-none focus:ring-2 focus:ring-[#da7757]/20 border border-[rgba(0,0,0,0.10)] transition-all";

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="animate-enter bg-white rounded-2xl w-full mx-4 overflow-hidden"
        style={{
          maxWidth: "540px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#fef3ed] flex items-center justify-center">
              <PenLine className="w-4 h-4" style={{ color: "#da7757" }} />
            </div>
            <div>
              <h2 className="text-[16px] text-foreground leading-tight" style={{ fontWeight: 600 }}>
                发布帖子
              </h2>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                分享经验或提出问题
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[#f5f0eb] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] text-[#666]" style={{ fontWeight: 500 }}>
                标题 <span style={{ color: "#da7757" }}>*</span>
              </label>
              <span className="text-[11px] text-muted-foreground">
                {title.length}<span className="opacity-50">/100</span>
              </span>
            </div>
            <input
              className={inputClass}
              placeholder="一句话描述您的问题或主题..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              disabled={loading}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-[12px] text-[#666] mb-1.5" style={{ fontWeight: 500 }}>
              内容 <span style={{ color: "#da7757" }}>*</span>
            </label>
            <textarea
              className={inputClass}
              placeholder="详细描述您的问题、解决思路或经验分享..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              disabled={loading}
              style={{ resize: "none", minHeight: "140px", lineHeight: "1.6" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] hover:text-foreground transition-colors disabled:opacity-40"
              style={{ fontWeight: 500 }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !content.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-[13px] text-white transition-all disabled:opacity-50"
              style={{
                background: loading || !title.trim() || !content.trim()
                  ? "#e0b8a8"
                  : "#da7757",
                fontWeight: 500,
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  发布中...
                </span>
              ) : "发布帖子"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function ForumPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [showNewPost, setShowNewPost] = useState(false);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const fetchPosts = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const offset = pageNum * PAGE_SIZE;
      const res = await fetch(
        `${window.location.origin}/api/forum/posts?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || err?.error || "加载失败");
        return;
      }
      const data: PostsResponse = await res.json();
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(0);
  }, []);

  function handlePageChange(p: number) {
    setPage(p);
    fetchPosts(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNewPost() {
    if (!user) { setShowAuth(true); return; }
    setShowNewPost(true);
  }

  return (
    <>
      <div className="animate-enter">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] text-foreground" style={{ fontWeight: 600 }}>
              答疑社区
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              提问、分享经验，和同事一起探索 AI 的可能性
            </p>
          </div>
          <button
            onClick={handleNewPost}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            <Plus className="w-4 h-4" />
            发布帖子
          </button>
        </div>

        {/* Post list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground">
            加载中...
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-16 border border-[rgba(0,0,0,0.06)] flex flex-col items-center gap-3 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground opacity-40" />
            <p className="text-[15px] text-foreground" style={{ fontWeight: 500 }}>
              暂无帖子
            </p>
            <p className="text-[13px] text-muted-foreground max-w-xs">
              成为第一个发布帖子的人吧！
            </p>
            <button
              onClick={handleNewPost}
              className="mt-2 px-5 py-2 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
              style={{ fontWeight: 500 }}
            >
              发布第一帖
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => navigate(`/forum/${post.id}`)}
                className="bg-white rounded-2xl shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-[rgba(218,119,87,0.2)]"
                style={{
                  borderColor: post.is_pinned ? "rgba(218,119,87,0.25)" : "rgba(0,0,0,0.06)",
                  background: post.is_pinned ? "#fffaf8" : "#fff",
                  padding: "16px 20px",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] shrink-0 mt-0.5"
                    style={{ background: avatarBg(post.author_name), fontWeight: 600 }}
                  >
                    {post.author_name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {post.is_pinned && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                          style={{ background: "#fef3ed", color: "#da7757", fontWeight: 600 }}
                        >
                          <Pin className="w-2.5 h-2.5" />
                          置顶
                        </span>
                      )}
                      <h3
                        className="text-[14px] text-foreground leading-snug"
                        style={{ fontWeight: 600 }}
                      >
                        {post.title}
                      </h3>
                    </div>

                    {/* Content preview */}
                    <p
                      className="text-[13px] text-muted-foreground mb-2 leading-relaxed"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {post.content}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
                      <span style={{ fontWeight: 500, color: "var(--foreground)" }}>
                        {post.author_name}
                      </span>
                      <span>{post.department}</span>
                      <span>{timeAgo(post.created_at)}</span>
                      <span className="flex items-center gap-1 ml-auto">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {post.reply_count} 回复
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-5">
            <p className="text-[12px] text-muted-foreground">
              第 {page + 1} / {totalPages} 页，共 {total} 篇
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 0}
                onClick={() => handlePageChange(page - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一页
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => handlePageChange(page + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] border border-[rgba(0,0,0,0.10)] hover:bg-[#f5f0eb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <UserAuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      <NewPostModal
        open={showNewPost}
        onClose={() => setShowNewPost(false)}
        onSuccess={() => { setPage(0); fetchPosts(0); }}
      />
    </>
  );
}
