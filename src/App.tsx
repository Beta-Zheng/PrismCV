import { Component, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx } from "./lib/utils";
import { useApp, type View } from "./lib/store";
import { ToastHost } from "./components/ui";
import Home from "./pages/Home";
import Editor from "./pages/Editor";
import Models from "./pages/Models";
import Settings from "./pages/Settings";
import { IconAlert, IconClipboard, IconCpu, IconDatabase, IconLogo, IconShield } from "./components/icons";

/** 全局错误边界：任何渲染异常都显示可读的错误卡片，而不是白屏 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-paper-100 p-6" style={{ fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif' }}>
          <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl shadow-ink-950/10">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-100 text-danger-600">
                <IconAlert size={18} />
              </span>
              <div>
                <h1 className="text-[16px] font-bold" style={{ color: "#101817" }}>页面渲染出错了</h1>
                <p className="text-[11px]" style={{ color: "#6d7d76" }}>应用遇到了意外错误，你的本地数据不会丢失</p>
              </div>
            </div>
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed" style={{ background: "#f0f3ee", color: "#9c2f28" }}>
              {this.state.error.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-md px-3 py-2 text-[13px] font-medium text-white transition active:scale-[0.98]"
              style={{ background: "#0e7a6c" }}
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
        active ? "bg-gradient-to-r from-brand-600/30 to-ink-800 text-paper-50 shadow-[inset_0_0_0_1px_rgb(59_163_146/0.25)]" : "text-ink-300 hover:bg-ink-850 hover:text-paper-100"
      )}
    >
      {active && <span className="shadow-brand-glow absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand-400" />}
      <span className={cx("transition-colors", active ? "text-brand-300" : "text-ink-400 group-hover:text-brand-300")}>{icon}</span>
      {label}
    </button>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

function AppShell() {
  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);
  const privacy = useApp((s) => s.privacy);
  const resumeCount = useApp((s) => s.resumes.length);

  const nav: Array<{ key: View["name"]; label: string; icon: React.ReactNode; view: View }> = [
    { key: "home", label: "工作台", icon: <IconClipboard size={16} />, view: { name: "home" } },
    { key: "models", label: "模型与隐私", icon: <IconCpu size={16} />, view: { name: "models" } },
    { key: "settings", label: "数据管理", icon: <IconDatabase size={16} />, view: { name: "settings" } },
  ];
  const activeKey = view.name === "editor" ? "home" : view.name;

  return (
    <div id="app-root" className="flex h-screen overflow-hidden bg-paper-100">
      {/* 侧边导航：ink 纵向渐变拉开层次，顶部略深 */}
      <nav className="flex w-[196px] shrink-0 flex-col border-r border-ink-800 bg-gradient-to-b from-ink-950 via-ink-900 to-ink-900">
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <span className="bg-brand-gradient shadow-brand-glow flex h-9 w-9 items-center justify-center rounded-lg text-white">
            <IconLogo size={19} />
          </span>
          <div>
            <p className="font-display text-[16px] font-black leading-none text-paper-50">AI Resume</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400">local workbench</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-2.5">
          {nav.map((n) => (
            <NavItem key={n.key} active={activeKey === n.key} onClick={() => go(n.view)} icon={n.icon} label={n.label} />
          ))}
        </div>

        <div className="mt-auto px-2.5 pb-2.5">
          <div className="rounded-xl bg-ink-850 px-3 py-3 ring-1 ring-ink-800">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-paper-100">
              <IconShield size={13} className={privacy.allowExternal ? "text-seal-500" : "text-brand-300"} />
              {privacy.allowExternal ? "外部模型已开启" : "本地模式"}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
              {privacy.allowExternal ? "本地模型不可用时可能发起外部请求，调用前会提示。" : "数据不出本机，不发起任何外部请求。"}
            </p>
            <div className="mt-2 flex items-center gap-1.5 font-mono text-[9.5px] text-ink-500">
              <span className={cx("h-1.5 w-1.5 rounded-full", privacy.allowExternal ? "bg-seal-500" : "anim-pulse-dot bg-brand-400")} />
              {resumeCount} resume(s) on disk
            </div>
          </div>
        </div>
      </nav>

      {/* 主区域：页面切换时淡入上移（AnimatePresence 处理退场），布局类移到 motion.div 保持各页 h-full 语义 */}
      <main className="min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: "easeIn" } }}
            className={cx("h-full overflow-y-auto", view.name === "editor" && "overflow-hidden")}
          >
            {view.name === "home" && <Home />}
            {view.name === "editor" && <Editor resumeId={view.resumeId} />}
            {view.name === "models" && <Models />}
            {view.name === "settings" && <Settings />}
          </motion.div>
        </AnimatePresence>
      </main>

      <ToastHost />
    </div>
  );
}
