import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIAction, Block, BulletStyleKey, JD, ModelProvider, Resume, ResumeData, RouteStrategy, Section, Suggestion } from "../types";
import { nowISO, uid } from "./utils";
import { buildResumeSummary, generateWithLLM, ruleSuggestion, selectProvider, defaultModels } from "./ai";

export type View =
  | { name: "home" }
  | { name: "editor"; resumeId: string }
  | { name: "models" }
  | { name: "settings" };

export interface Toast {
  id: string;
  kind: "ok" | "warn" | "err" | "info";
  msg: string;
}

interface PendingExternal {
  resumeId: string;
  sectionId: string;
  blockId: string;
  action: AIAction;
  providerName: string;
}

interface AppState {
  resumes: Resume[];
  jds: Record<string, JD>;
  suggestions: Suggestion[];
  models: ModelProvider[];
  privacy: { allowExternal: boolean; route: RouteStrategy };
  externalCallCount: number;

  view: View;
  toasts: Toast[];
  pendingExternal: PendingExternal | null;
  lastSavedAt: string | null;

  go: (view: View) => void;
  toast: (kind: Toast["kind"], msg: string) => void;
  dismissToast: (id: string) => void;

  createResume: (data: ResumeData, title?: string) => string;
  deleteResume: (id: string) => void;
  duplicateResume: (id: string) => void;
  renameResume: (id: string, title: string) => void;
  setTemplate: (id: string, templateId: string) => void;
  setTheme: (id: string, patch: Partial<Resume["theme"]>) => void;
  setAvatar: (id: string, url: string | null) => void;
  setSchoolBadge: (id: string, url: string | null) => void;

  patchBasic: (resumeId: string, patch: Partial<ResumeData["basic_info"]>) => void;
  patchBlock: (resumeId: string, sectionId: string, blockId: string, patch: Partial<Block>) => void;
  addBlock: (resumeId: string, sectionId: string) => void;
  deleteBlock: (resumeId: string, sectionId: string, blockId: string) => void;
  moveBlock: (resumeId: string, sectionId: string, blockId: string, dir: "up" | "down") => void;
  reorderSections: (resumeId: string, orderedIds: string[]) => void;
  toggleSection: (resumeId: string, sectionId: string) => void;
  renameSection: (resumeId: string, sectionId: string, title: string) => void;
  /** 模块级要点样式；传 null 表示恢复为「跟随全局默认」 */
  setSectionBulletStyle: (resumeId: string, sectionId: string, style: BulletStyleKey | null) => void;
  addSection: (resumeId: string, title: string) => void;
  deleteSection: (resumeId: string, sectionId: string) => void;

  requestSuggestion: (resumeId: string, sectionId: string, blockId: string, action: AIAction) => void;
  confirmExternal: (proceed: boolean) => void;
  acceptSuggestion: (sugId: string, edited?: Block) => void;
  rejectSuggestion: (sugId: string) => void;
  clearSuggestions: (resumeId: string) => void;

  setJD: (resumeId: string, jd: JD | null) => void;

  saveModel: (m: ModelProvider) => void;
  deleteModel: (id: string) => void;
  toggleModel: (id: string) => void;
  setPrivacy: (patch: Partial<AppState["privacy"]>) => void;

  importData: (raw: string) => boolean;
  clearAll: () => void;
}

const BLOCK_TYPE_BY_SECTION: Record<Section["type"], Block["type"]> = {
  basic_info: "custom_text",
  summary: "summary",
  work_experience: "work_experience_item",
  project_experience: "project_experience_item",
  education: "education_item",
  skills: "skill_group",
  certifications: "certification",
  custom: "custom_text",
};

function blankBlock(type: Block["type"], order: number): Block {
  return {
    block_id: uid("blk"),
    type,
    title: "",
    subtitle: "",
    start_date: "",
    end_date: "",
    location: "",
    description: "",
    bullets: [],
    skills: [],
    links: [],
    visible: true,
    order,
  };
}

function withResume(state: AppState, resumeId: string, fn: (r: Resume) => Resume): Partial<AppState> {
  return {
    resumes: state.resumes.map((r) => (r.id === resumeId ? { ...fn(r), updated_at: nowISO() } : r)),
    lastSavedAt: nowISO(),
  };
}

function mapSection(r: Resume, sectionId: string, fn: (s: Section) => Section): Resume {
  return { ...r, data: { ...r.data, sections: r.data.sections.map((s) => (s.section_id === sectionId ? fn(s) : s)) } };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      resumes: [],
      jds: {},
      suggestions: [],
      models: defaultModels(),
      privacy: { allowExternal: false, route: "local_first" },
      externalCallCount: 0,

      view: { name: "home" },
      toasts: [],
      pendingExternal: null,
      lastSavedAt: null,

      go: (view) => set({ view }),

      toast: (kind, msg) => {
        const id = uid("toast");
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, msg }] }));
        setTimeout(() => get().dismissToast(id), 4200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      createResume: (data, title) => {
        const id = uid("resume");
        const now = nowISO();
        const resume: Resume = {
          id,
          title: title || data.basic_info.name || "未命名简历",
          data: { ...data, metadata: { ...data.metadata, created_at: now } },
          template_id: "modern_single_column",
          theme: { primary_color: "#0e7a6c", font_size: 14, font_family: "sans", density: "medium", header_layout: "row", bullet_style: "diamond" },
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ resumes: [resume, ...s.resumes], lastSavedAt: now }));
        return id;
      },

      deleteResume: (id) =>
        set((s) => {
          const jds = { ...s.jds };
          delete jds[id];
          return {
            resumes: s.resumes.filter((r) => r.id !== id),
            jds,
            suggestions: s.suggestions.filter((x) => x.resume_id !== id),
            view: s.view.name === "editor" && s.view.resumeId === id ? { name: "home" } : s.view,
          };
        }),

      duplicateResume: (id) => {
        const src = get().resumes.find((r) => r.id === id);
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src)) as Resume;
        copy.id = uid("resume");
        copy.title = `${src.title} 副本`;
        copy.created_at = nowISO();
        copy.updated_at = nowISO();
        set((s) => ({ resumes: [copy, ...s.resumes] }));
        get().toast("ok", "已复制简历");
      },

      renameResume: (id, title) => set((s) => withResume(s, id, (r) => ({ ...r, title }))),
      setTemplate: (id, templateId) => set((s) => withResume(s, id, (r) => ({ ...r, template_id: templateId }))),
      setTheme: (id, patch) => set((s) => withResume(s, id, (r) => ({ ...r, theme: { ...r.theme, ...patch } }))),
      setAvatar: (id, url) => set((s) => withResume(s, id, (r) => ({ ...r, data: { ...r.data, avatar_url: url ?? "" } }))),
      setSchoolBadge: (id, url) => set((s) => withResume(s, id, (r) => ({ ...r, data: { ...r.data, school_badge_url: url ?? "" } }))),

      patchBasic: (resumeId, patch) =>
        set((s) => withResume(s, resumeId, (r) => ({ ...r, data: { ...r.data, basic_info: { ...r.data.basic_info, ...patch } } }))),

      patchBlock: (resumeId, sectionId, blockId, patch) =>
        set((s) =>
          withResume(s, resumeId, (r) =>
            mapSection(r, sectionId, (sec) => ({
              ...sec,
              blocks: sec.blocks.map((b) => (b.block_id === blockId ? { ...b, ...patch } : b)),
            }))
          )
        ),

      addBlock: (resumeId, sectionId) =>
        set((s) =>
          withResume(s, resumeId, (r) =>
            mapSection(r, sectionId, (sec) => ({
              ...sec,
              blocks: [...sec.blocks, blankBlock(BLOCK_TYPE_BY_SECTION[sec.type], sec.blocks.length)],
            }))
          )
        ),

      deleteBlock: (resumeId, sectionId, blockId) =>
        set((s) =>
          withResume(s, resumeId, (r) =>
            mapSection(r, sectionId, (sec) => ({
              ...sec,
              blocks: sec.blocks.filter((b) => b.block_id !== blockId).map((b, i) => ({ ...b, order: i })),
            }))
          )
        ),

      moveBlock: (resumeId, sectionId, blockId, dir) =>
        set((s) =>
          withResume(s, resumeId, (r) =>
            mapSection(r, sectionId, (sec) => {
              const idx = sec.blocks.findIndex((b) => b.block_id === blockId);
              const to = dir === "up" ? idx - 1 : idx + 1;
              if (idx < 0 || to < 0 || to >= sec.blocks.length) return sec;
              const blocks = [...sec.blocks];
              const [item] = blocks.splice(idx, 1);
              blocks.splice(to, 0, item);
              return { ...sec, blocks: blocks.map((b, i) => ({ ...b, order: i })) };
            })
          )
        ),

      reorderSections: (resumeId, orderedIds) =>
        set((s) =>
          withResume(s, resumeId, (r) => {
            const byId = new Map(r.data.sections.map((sec) => [sec.section_id, sec]));
            const sections = orderedIds.map((id, i) => ({ ...byId.get(id)!, order: i }));
            return { ...r, data: { ...r.data, sections } };
          })
        ),

      toggleSection: (resumeId, sectionId) =>
        set((s) => withResume(s, resumeId, (r) => mapSection(r, sectionId, (sec) => ({ ...sec, visible: !sec.visible })))),

      renameSection: (resumeId, sectionId, title) =>
        set((s) => withResume(s, resumeId, (r) => mapSection(r, sectionId, (sec) => ({ ...sec, title })))),

      setSectionBulletStyle: (resumeId, sectionId, style) =>
        set((s) =>
          withResume(s, resumeId, (r) =>
            mapSection(r, sectionId, (sec) => {
              if (style === null) {
                const next = { ...sec };
                delete next.bullet_style;
                return next;
              }
              return { ...sec, bullet_style: style };
            })
          )
        ),

      addSection: (resumeId, title) =>
        set((s) =>
          withResume(s, resumeId, (r) => ({
            ...r,
            data: {
              ...r.data,
              sections: [
                ...r.data.sections,
                {
                  section_id: uid("sec"),
                  type: "custom" as const,
                  title: title || "自定义模块",
                  visible: true,
                  order: r.data.sections.length,
                  blocks: [blankBlock("custom_text", 0)],
                },
              ],
            },
          }))
        ),

      deleteSection: (resumeId, sectionId) =>
        set((s) =>
          withResume(s, resumeId, (r) => ({
            ...r,
            data: { ...r.data, sections: r.data.sections.filter((x) => x.section_id !== sectionId).map((x, i) => ({ ...x, order: i })) },
          }))
        ),

      /* ---------------- AI 建议 ---------------- */

      requestSuggestion: (resumeId, sectionId, blockId, action) => {
        const st = get();
        const resume = st.resumes.find((r) => r.id === resumeId);
        const block = resume?.data.sections.find((s) => s.section_id === sectionId)?.blocks.find((b) => b.block_id === blockId);
        if (!resume || !block) return;

        const sel = selectProvider(st.models, st.privacy);

        if (sel.kind === "confirm_external") {
          set({ pendingExternal: { resumeId, sectionId, blockId, action, providerName: sel.provider.name } });
          return;
        }

        const jd = st.jds[resumeId];
        const base: Suggestion = {
          id: uid("sug"),
          resume_id: resumeId,
          section_id: sectionId,
          block_id: blockId,
          action,
          engine: sel.kind === "rules" ? "rules" : "llm",
          provider_name: sel.kind === "rules" ? "本地规则引擎（兜底）" : sel.provider.name,
          status: "generating",
          original: JSON.parse(JSON.stringify(block)),
          matched_keywords: [],
          warnings: [],
          created_at: nowISO(),
        };
        set((s) => ({ suggestions: [base, ...s.suggestions] }));

        if (sel.kind === "rules") {
          setTimeout(() => {
            const out = ruleSuggestion(action, block, jd?.structured.keywords ?? []);
            set((s) => ({
              suggestions: s.suggestions.map((x) =>
                x.id === base.id ? { ...x, status: "success", suggested: out.suggested_block, explanation: out.explanation, warnings: out.warnings, matched_keywords: out.matched_keywords } : x
              ),
            }));
          }, 500);
          get().toast("info", "未检测到可用模型，已使用本地规则引擎生成建议");
          return;
        }

        const provider = sel.provider;
        if (provider.type === "external") {
          set((s) => ({ externalCallCount: s.externalCallCount + 1 }));
          let host = "api.openai.com";
          try {
            host = new URL(provider.base_url || "https://api.openai.com").host;
          } catch {
            // base_url 非法时回退到默认值，不抛出未捕获异常
          }
          get().toast("warn", `正在使用外部模型「${provider.name}」，内容将发送至 ${host}`);
        }
        const resumeSummary = buildResumeSummary(resume.data);
        const jdJson =
          action === "jd_match" && jd
            ? JSON.stringify({ job_title: jd.structured.job_title, skills: jd.structured.skills, keywords: jd.structured.keywords, requirements: jd.structured.requirements })
            : jd
              ? JSON.stringify({ job_title: jd.structured.job_title, skills: jd.structured.skills })
              : null;

        generateWithLLM(provider, action, block, resumeSummary, jdJson)
          .then((out) => {
            set((s) => ({
              suggestions: s.suggestions.map((x) =>
                x.id === base.id ? { ...x, status: "success", suggested: out.suggested_block, explanation: out.explanation, warnings: out.warnings, matched_keywords: out.matched_keywords } : x
              ),
            }));
          })
          .catch((e) => {
            const msg = e instanceof Error ? e.message : "生成失败";
            const isConn = e instanceof TypeError || /failed to fetch|aborted|networkerror|load failed/i.test(msg);
            if (isConn) {
              // 模型服务不可达 → 自动降级为本地规则引擎（失败可降级）
              const out = ruleSuggestion(action, block, jd?.structured.keywords ?? []);
              set((s) => ({
                suggestions: s.suggestions.map((x) =>
                  x.id === base.id
                    ? {
                        ...x,
                        status: "success",
                        engine: "rules",
                        provider_name: "本地规则引擎（自动降级）",
                        suggested: out.suggested_block,
                        explanation: out.explanation,
                        matched_keywords: out.matched_keywords,
                        warnings: [`无法连接模型服务（${provider.base_url}），已自动降级为本地规则引擎；可在「模型与隐私」中测试连接或开启外部模型`, ...out.warnings],
                      }
                    : x
                ),
              }));
              get().toast("warn", "模型连接失败，已自动降级为本地规则引擎");
            } else {
              set((s) => ({
                suggestions: s.suggestions.map((x) => (x.id === base.id ? { ...x, status: "failed", error: msg } : x)),
              }));
              get().toast("err", "AI 生成失败，原内容已保留");
            }
          });
      },

      confirmExternal: (proceed) => {
        const pending = get().pendingExternal;
        set({ pendingExternal: null });
        if (!pending) return;
        if (proceed) {
          set((s) => ({ privacy: { ...s.privacy, allowExternal: true } }));
          get().requestSuggestion(pending.resumeId, pending.sectionId, pending.blockId, pending.action);
        } else {
          get().toast("info", "已取消外部调用，原内容保持不变");
        }
      },

      acceptSuggestion: (sugId, edited) => {
        const sug = get().suggestions.find((x) => x.id === sugId);
        if (!sug || !sug.suggested) return;
        const content = edited ?? sug.suggested;
        set((s) => ({
          ...withResume(s, sug.resume_id, (r) =>
            mapSection(r, sug.section_id, (sec) => ({
              ...sec,
              blocks: sec.blocks.map((b) =>
                b.block_id === sug.block_id
                  ? { ...b, title: content.title, subtitle: content.subtitle, start_date: content.start_date, end_date: content.end_date, location: content.location, description: content.description, bullets: content.bullets, skills: content.skills, links: content.links, bullet_marks: undefined }
                  : b
              ),
            }))
          ),
          suggestions: s.suggestions.map((x) => (x.id === sugId ? { ...x, resolution: edited ? "edited_accepted" : "accepted" } : x)),
        }));
        get().toast("ok", edited ? "已应用编辑后的建议" : "已应用 AI 建议");
      },

      rejectSuggestion: (sugId) => {
        set((s) => ({ suggestions: s.suggestions.map((x) => (x.id === sugId ? { ...x, resolution: "rejected" } : x)) }));
        get().toast("info", "已拒绝建议，原内容保持不变");
      },

      clearSuggestions: (resumeId) => set((s) => ({ suggestions: s.suggestions.filter((x) => x.resume_id !== resumeId) })),

      setJD: (resumeId, jd) =>
        set((s) => {
          const jds = { ...s.jds };
          if (jd) jds[resumeId] = jd;
          else delete jds[resumeId];
          return { jds };
        }),

      saveModel: (m) =>
        set((s) => {
          const exists = s.models.some((x) => x.id === m.id);
          return { models: exists ? s.models.map((x) => (x.id === m.id ? m : x)) : [...s.models, m] };
        }),
      deleteModel: (id) => set((s) => ({ models: s.models.filter((m) => m.id !== id) })),
      toggleModel: (id) => set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)) })),
      setPrivacy: (patch) => set((s) => ({ privacy: { ...s.privacy, ...patch } })),

      importData: (raw) => {
        try {
          const data = JSON.parse(raw);
          if (!Array.isArray(data.resumes)) return false;
          set({
            resumes: data.resumes,
            jds: data.jds || {},
            suggestions: data.suggestions || [],
            models: Array.isArray(data.models) && data.models.length ? data.models : get().models,
            privacy: data.privacy || get().privacy,
          });
          get().toast("ok", `已恢复 ${data.resumes.length} 份简历`);
          return true;
        } catch {
          return false;
        }
      },

      clearAll: () =>
        set({
          resumes: [],
          jds: {},
          suggestions: [],
          models: defaultModels(),
          privacy: { allowExternal: false, route: "local_first" },
          externalCallCount: 0,
          view: { name: "home" },
          lastSavedAt: null,
        }),
    }),
    {
      name: "ai-resume-workbench-v1",
      partialize: (s) => ({
        resumes: s.resumes,
        jds: s.jds,
        suggestions: s.suggestions.filter((x) => x.status !== "generating"),
        models: s.models,
        privacy: s.privacy,
        externalCallCount: s.externalCallCount,
      }),
    }
  )
);

/** 便捷选择器 */
export function useResume(id: string | undefined) {
  return useApp((s) => s.resumes.find((r) => r.id === id));
}
