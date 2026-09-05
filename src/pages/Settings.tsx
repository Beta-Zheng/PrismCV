import { useRef, useState } from "react";
import { downloadText, fmtDateCompact, nowISO } from "../lib/utils";
import { useApp } from "../lib/store";
import { Btn, Confirm, Toggle } from "../components/ui";
import { IconAlert, IconCheck, IconDatabase, IconDownload, IconLock, IconShield, IconTrash, IconUpload } from "../components/icons";

export default function Settings() {
  const app = useApp();
  const { resumes, jds, suggestions, models, privacy, setPrivacy } = app;
  const [clearArmed, setClearArmed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const storageKB = Math.round(JSON.stringify({ resumes, jds, suggestions, models }).length / 102.4) / 10;

  const backup = () => {
    const payload = { app: "ai-resume", version: 1, exported_at: nowISO(), resumes, jds, suggestions, models, privacy };
    downloadText(`ai-resume-backup-${fmtDateCompact(nowISO())}.json`, JSON.stringify(payload, null, 2));
    app.toast("ok", "备份文件已下载（含全部简历与配置）");
  };

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = app.importData(String(reader.result || ""));
      if (!ok) app.toast("err", "备份文件格式不正确，恢复失败");
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 pb-16 pt-8">
      <header className="anim-fade-up">
        <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-brand-600">
          <IconDatabase size={12} /> Local Data
        </p>
        <h1 className="font-display text-[30px] font-black text-ink-900">数据与隐私</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
          所有数据默认保存在本机，不上传、不遥测、不请求外部服务。你可以随时备份、恢复或彻底清空。
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {/* 数据概览 */}
        <section className="anim-fade-up rounded-2xl border border-ink-200 bg-paper-25 p-5" style={{ animationDelay: "0.05s" }}>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
            <IconDatabase size={16} className="text-brand-600" /> 本地数据概览
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {[
              ["简历", resumes.length, "份"],
              ["JD", Object.keys(jds).length, "份"],
              ["AI 建议记录", suggestions.length, "条"],
              ["模型配置", models.length, "个"],
            ].map(([label, n, unit]) => (
              <div key={String(label)} className="rounded-xl border border-ink-100 bg-white px-3.5 py-3">
                <p className="font-mono text-[22px] font-bold leading-none text-ink-900">
                  {n}
                  <span className="ml-1 text-[11px] font-medium text-ink-300">{unit}</span>
                </p>
                <p className="mt-1.5 text-[11px] text-ink-400">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center justify-between rounded-lg bg-paper-100 px-3 py-2 font-mono text-[11px] text-ink-500">
            <span>~/.ai-resume/ （浏览器环境映射为 localStorage）</span>
            <span className="font-bold text-ink-800">{storageKB} KB</span>
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-ink-900 p-3.5 font-mono text-[10.5px] leading-relaxed text-paper-200">
{`~/.ai-resume/
├── config.json        # 隐私与路由策略
├── db.sqlite          # 简历 / JD / 建议 / 模型
├── files/             # 上传的原始文件
├── exports/           # 导出的 PDF
└── logs/              # 本地日志（不含 API Key）`}
          </pre>
        </section>

        {/* 隐私（v1.4：深靛底替代纯黑，属靛蓝家族不违反墨色减法） */}
        <section className="anim-fade-up flex flex-col gap-3" style={{ animationDelay: "0.1s" }}>
          <div className="rounded-2xl border border-brand-800 bg-brand-800 p-5 text-white">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <IconLock size={16} className="text-brand-200" /> 隐私承诺
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                "默认不上传任何数据",
                "默认不发送遥测",
                "默认不请求外部服务",
                "外部模型必须显式开启并逐次提示",
                "日志不记录完整 API Key 与简历全文",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-[12px] leading-relaxed text-white/85">
                  <IconCheck size={13} className="mt-0.5 shrink-0 text-brand-200" /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-900 px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-[12px] font-medium">
                <IconShield size={14} className={privacy.allowExternal ? "text-seal-500" : "text-brand-200"} />
                允许外部模型
              </span>
              <Toggle checked={privacy.allowExternal} onChange={(v) => { setPrivacy({ allowExternal: v }); app.toast(v ? "warn" : "ok", v ? "外部模型已开启" : "外部模型已关闭"); }} label="允许外部模型" />
            </div>
          </div>

          {/* 备份恢复 */}
          <div className="flex-1 rounded-2xl border border-ink-200 bg-paper-25 p-5">
            <h2 className="text-[15px] font-bold text-ink-900">备份与恢复</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">备份为单个 JSON 文件，包含全部简历、JD、AI 建议记录与模型配置（API Key 除外请自行保管）。</p>
            <div className="mt-3.5 flex flex-col gap-2">
              <Btn variant="dark" className="h-9" onClick={backup}>
                <IconDownload size={14} /> 下载备份 JSON
              </Btn>
              <Btn variant="outline" className="h-9" onClick={() => importRef.current?.click()}>
                <IconUpload size={14} /> 从备份恢复
              </Btn>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
            </div>
          </div>
        </section>
      </div>

      {/* 危险区 */}
      <section className="anim-fade-up rounded-2xl border border-danger-600/25 bg-danger-100/40 p-5" style={{ animationDelay: "0.15s" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-100 text-danger-600">
              <IconAlert size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-danger-700">清空全部数据</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">删除本机全部简历、JD、AI 建议记录，并将模型配置恢复为默认。该操作不可撤销，建议先下载备份。</p>
            </div>
          </div>
          {!clearArmed ? (
            <Btn variant="danger" className="h-9" onClick={() => setClearArmed(true)}>
              <IconTrash size={14} /> 清空全部数据
            </Btn>
          ) : (
            <div className="flex items-center gap-2">
              <Btn variant="ghost" className="h-9" onClick={() => setClearArmed(false)}>取消</Btn>
              <Btn variant="danger" className="h-9 font-bold" onClick={() => setConfirmClear(true)}>
                <IconTrash size={14} /> 确认清空（二次确认）
              </Btn>
            </div>
          )}
        </div>
      </section>

      <p className="text-center font-mono text-[10.5px] text-ink-300">
        PrismCV · 本地优先 · 隐私默认保护 · 构建于 {new Date().getFullYear()}
      </p>

      <Confirm
        open={confirmClear}
        danger
        title="确定清空全部数据？"
        desc={`将删除 ${resumes.length} 份简历、${suggestions.length} 条 AI 建议记录、${Object.keys(jds).length} 份 JD，模型配置恢复默认。此操作不可撤销。`}
        confirmText="永久删除"
        onConfirm={() => {
          app.clearAll();
          setConfirmClear(false);
          setClearArmed(false);
          app.toast("ok", "全部数据已清空");
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
