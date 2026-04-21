import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useUser } from "./user-context";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "login" | "register";

export function UserAuthModal({ open, onClose }: Props) {
  const { login } = useUser();
  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);

  // Login form state
  const [loginAuthId, setLoginAuthId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regAuthId, setRegAuthId] = useState("");
  const [regName, setRegName] = useState("");
  const [regDepartment, setRegDepartment] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // Reset state on open
  useEffect(() => {
    if (open) {
      setTab("login");
      setLoginAuthId("");
      setLoginPassword("");
      setRegAuthId("");
      setRegName("");
      setRegDepartment("");
      setRegPassword("");
      setRegConfirm("");
      setLoading(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginAuthId.trim() || !loginPassword.trim()) {
      toast.error("请填写认证号和密码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authId: loginAuthId.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || "登录失败，请检查认证号和密码");
        return;
      }
      login(data);
      toast.success(`欢迎回来，${data.name}！`);
      onClose();
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regAuthId.trim() || !regName.trim() || !regDepartment.trim() || !regPassword.trim()) {
      toast.error("请填写所有必填项");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (regPassword.length < 6) {
      toast.error("密码长度不能少于6位");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authId: regAuthId.trim(),
          name: regName.trim(),
          department: regDepartment.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || data?.error || "注册失败");
        return;
      }
      login(data);
      toast.success(`注册成功，欢迎 ${data.name}！`);
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
    "w-full px-4 py-3 rounded-xl bg-[#f5f0eb] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#da7757]/15 border border-[rgba(0,0,0,0.12)] transition-all";
  const labelClass = "block text-[12px] text-[#666] mb-1.5" as const;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="animate-enter bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-hidden"
        style={{ maxWidth: "400px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-[18px] text-foreground" style={{ fontWeight: 600 }}>
            {tab === "login" ? "登录账号" : "注册账号"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[#f5f0eb] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex mx-6 mt-4 mb-4 bg-[#f5f0eb] rounded-xl p-1 gap-1">
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-[13px] transition-colors"
              style={{
                fontWeight: tab === t ? 600 : 400,
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* Forms */}
        <div className="px-6 pb-6">
          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className={labelClass}>认证号</label>
                <input
                  className={inputClass}
                  placeholder="请输入认证号"
                  value={loginAuthId}
                  onChange={(e) => setLoginAuthId(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
              <div>
                <label className={labelClass}>密码</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="请输入密码"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 px-4 py-3 bg-[#da7757] text-white rounded-xl text-[14px] hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ fontWeight: 500 }}
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className={labelClass}>认证号</label>
                <input
                  className={inputClass}
                  placeholder="请输入认证号（工号或学号）"
                  value={regAuthId}
                  onChange={(e) => setRegAuthId(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className={labelClass}>姓名</label>
                <input
                  className={inputClass}
                  placeholder="请输入真实姓名"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className={labelClass}>部门</label>
                <input
                  className={inputClass}
                  placeholder="请输入所在部门"
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className={labelClass}>密码</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="至少6位密码"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
              <div>
                <label className={labelClass}>确认密码</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="再次输入密码"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 px-4 py-3 bg-[#da7757] text-white rounded-xl text-[14px] hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ fontWeight: 500 }}
              >
                {loading ? "注册中..." : "注册"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
