import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { ChevronLeft, Send, LogIn, MessageSquare } from "lucide-react";
import { useUser } from "./user-context";
import { UserAuthModal } from "./user-auth-modal";

interface Reply {
  id: number;
  auth_id: string;
  author_name: string;
  department: string;
  content: string;
  created_at: string;
}

interface PostDetail {
  id: number;
  auth_id: string;
  author_name: string;
  department: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  replies: Reply[];
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function avatarBg(name: string): string {
  const colors = ["#da7757", "#5b7fa6", "#6b9e6f", "#9b6ea8", "#c07840", "#5a8fa8"];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return colors[sum % colors.length];
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatDateTime(iso);
}

export function ForumPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  async function fetchPost() {
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/forum/posts/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || err?.error || "加载失败");
        navigate("/forum");
        return;
      }
      const data: PostDetail = await res.json();
      setPost(data);
    } catch {
      toast.error("网络错误，请稍后重试");
      navigate("/forum");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) fetchPost();
  }, [id]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setShowAuth(true); return; }
    if (!replyText.trim()) { toast.error("请输入回复内容"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${window.location.origin}/api/forum/posts/${id}/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || "回复失败");
        return;
      }
      toast.success("回复成功！");
      setReplyText("");
      await fetchPost();
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-enter flex items-center justify-center py-24 text-[13px] text-muted-foreground">
        加载中...
      </div>
    );
  }

  if (!post) return null;

  return (
    <>
      <div className="animate-enter" style={{ maxWidth: "760px", margin: "0 auto" }}>
        {/* Back button */}
        <button
          onClick={() => navigate("/forum")}
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-5 group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          返回社区
        </button>

        {/* Main post card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.06)] p-6 mb-4">
          {/* Post header */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] shrink-0"
              style={{ background: avatarBg(post.author_name), fontWeight: 700 }}
            >
              {post.author_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                  {post.author_name}
                </span>
                <span className="text-[12px] text-muted-foreground">{post.department}</span>
                <span
                  className="px-2 py-0.5 rounded-md text-[11px]"
                  style={{ background: "#fef3ed", color: "#da7757", fontWeight: 600 }}
                >
                  楼主
                </span>
                {post.is_pinned && (
                  <span
                    className="px-2 py-0.5 rounded-md text-[11px]"
                    style={{ background: "#f5f0eb", color: "#888", fontWeight: 500 }}
                  >
                    置顶
                  </span>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {formatDateTime(post.created_at)}
              </p>
            </div>
          </div>

          <h1 className="text-[20px] text-foreground mb-3 leading-snug" style={{ fontWeight: 700 }}>
            {post.title}
          </h1>

          <div
            className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap"
            style={{ color: "#333" }}
          >
            {post.content}
          </div>

          {/* Reply count */}
          <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-[rgba(0,0,0,0.06)] text-[12px] text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            {post.replies.length} 条回复
          </div>
        </div>

        {/* Replies */}
        {post.replies.length > 0 && (
          <div className="space-y-3 mb-4">
            {post.replies.map((reply, i) => (
              <div
                key={reply.id}
                className="bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.06)] p-5"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] shrink-0"
                    style={{ background: avatarBg(reply.author_name), fontWeight: 600 }}
                  >
                    {reply.author_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {reply.author_name}
                      </span>
                      <span className="text-[12px] text-muted-foreground">{reply.department}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[11px]"
                        style={{ background: "#f5f0eb", color: "#888", fontWeight: 500 }}
                      >
                        {i + 2}楼
                      </span>
                      <span className="text-[12px] text-muted-foreground ml-auto">
                        {timeAgo(reply.created_at)}
                      </span>
                    </div>
                    <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                      {reply.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply form */}
        <div className="bg-white rounded-2xl shadow-sm border border-[rgba(0,0,0,0.06)] p-5">
          {user ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] shrink-0"
                  style={{ background: avatarBg(user.name), fontWeight: 600 }}
                >
                  {user.name.charAt(0)}
                </div>
                <span className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>
                  {user.name}
                </span>
                <span className="text-[12px] text-muted-foreground">{user.department}</span>
              </div>
              <form onSubmit={handleReply}>
                <textarea
                  ref={replyRef}
                  className="w-full px-4 py-3 rounded-xl bg-[#f5f0eb] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#da7757]/15 border border-[rgba(0,0,0,0.12)] transition-all"
                  placeholder="写下您的回复..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  disabled={submitting}
                  style={{ resize: "vertical", minHeight: "100px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleReply(e as unknown as React.FormEvent);
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-muted-foreground">Ctrl+Enter 快速发送</p>
                  <button
                    type="submit"
                    disabled={submitting || !replyText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity disabled:opacity-60"
                    style={{ fontWeight: 500 }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? "发送中..." : "发送回复"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>
                登录后参与讨论
              </p>
              <p className="text-[13px] text-muted-foreground">
                加入社区，与同事一起答疑解惑
              </p>
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#da7757] text-white rounded-xl text-[13px] hover:opacity-90 transition-opacity"
                style={{ fontWeight: 500 }}
              >
                <LogIn className="w-4 h-4" />
                立即登录
              </button>
            </div>
          )}
        </div>
      </div>

      <UserAuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
