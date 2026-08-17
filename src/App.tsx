import { cx } from "./lib/utils";
import { useApp, type View } from "./lib/store";
import { ToastHost } from "./components/ui";
import Home from "./pages/Home";
import Editor from "./pages/Editor";
import Models from "./pages/Models";
import Settings from "./pages/Settings";
import { IconClipboard, IconCpu, IconDatabase, IconLogo, IconShield } from "./components/icons";

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
        active ? "bg-ink-800 text-paper-50" : "text-ink-300 hover:bg-ink-850 hover:text-paper-100"
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand-400" />}
      <span className={cx("transition-colors", active ? "text-brand-300" : "text-ink-400 group-hover:text-brand-300")}>{icon}</span>
      {label}
    </button>
  );
}

export default function App() {
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
      {/* 侧边导航 */}
      <nav className="flex w-[196px] shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-lg shadow-brand-900/40">
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

      {/* 主区域 */}
      <main className="min-w-0 flex-1 overflow-hidden">
        <div className={cx("h-full overflow-y-auto", view.name === "editor" && "overflow-hidden")}>
          {view.name === "home" && <Home />}
          {view.name === "editor" && <Editor resumeId={view.resumeId} />}
          {view.name === "models" && <Models />}
          {view.name === "settings" && <Settings />}
        </div>
      </main>

      <ToastHost />
    </div>
  );
}
