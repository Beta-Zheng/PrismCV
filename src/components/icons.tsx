import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconLogo = (p: P) =>
  base(p, (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ));
export const IconUpload = (p: P) =>
  base(p, (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ));
export const IconFile = (p: P) =>
  base(p, (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ));
export const IconClipboard = (p: P) =>
  base(p, (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </>
  ));
export const IconSpark = (p: P) =>
  base(p, (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </>
  ));
export const IconTarget = (p: P) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ));
export const IconDownload = (p: P) =>
  base(p, (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ));
export const IconTrash = (p: P) =>
  base(p, (
    <>
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </>
  ));
export const IconGrip = (p: P) =>
  base(p, (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ));
export const IconEye = (p: P) =>
  base(p, (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ));
export const IconEyeOff = (p: P) =>
  base(p, (
    <>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="M2 2l20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ));
export const IconPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);
export const IconX = (p: P) => base(p, <path d="M18 6L6 18M6 6l12 12" />);
export const IconCheck = (p: P) => base(p, <path d="M20 6L9 17l-5-5" />);
export const IconChevronUp = (p: P) => base(p, <path d="M18 15l-6-6-6 6" />);
export const IconChevronDown = (p: P) => base(p, <path d="M6 9l6 6 6-6" />);
export const IconChevronLeft = (p: P) => base(p, <path d="M15 18l-6-6 6-6" />);
export const IconChevronRight = (p: P) => base(p, <path d="M9 18l6-6-6-6" />);
export const IconSettings = (p: P) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </>
  ));
export const IconCpu = (p: P) =>
  base(p, (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </>
  ));
export const IconShield = (p: P) =>
  base(p, (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ));
export const IconAlert = (p: P) =>
  base(p, (
    <>
      <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ));
export const IconRefresh = (p: P) =>
  base(p, (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ));
export const IconLayers = (p: P) =>
  base(p, (
    <>
      <path d="M12 2l10 5.5-10 5.5L2 7.5z" />
      <path d="M2 12.5L12 18l10-5.5" />
      <path d="M2 17.5L12 23l10-5.5" />
    </>
  ));
export const IconEdit = (p: P) =>
  base(p, (
    <>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </>
  ));
export const IconPrinter = (p: P) =>
  base(p, (
    <>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </>
  ));
export const IconDatabase = (p: P) =>
  base(p, (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </>
  ));
export const IconWand = (p: P) =>
  base(p, (
    <>
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M12.2 6.2L11 5" />
      <path d="M3 21l9-9" />
    </>
  ));
export const IconInfo = (p: P) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ));
export const IconArrowRight = (p: P) => base(p, <path d="M5 12h14M12 5l7 7-7 7" />);
export const IconZap = (p: P) => base(p, <path d="M13 2L3 14h9l-1 8 10-12h-9z" />);
export const IconLock = (p: P) =>
  base(p, (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ));

/** 教育经历：学士帽 */
export const IconGraduationCap = (p: P) =>
  base(p, (
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
      <path d="M22 10v5" />
    </>
  ));

/** 工作经历：公文包 */
export const IconBriefcase = (p: P) =>
  base(p, (
    <>
      <rect x="3" y="7" width="14" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h14" />
      <path d="M16 11v7a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-7" />
    </>
  ));

/** 项目经历：代码分支 */
export const IconFolderGit = (p: P) =>
  base(p, (
    <>
      <path d="M4 20h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4z" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="20" cy="15" r="2" />
      <path d="M16 9v5a2 2 0 0 0 2 2h2" />
      <path d="M16 9a2 2 0 0 1 2-2h2" />
    </>
  ));

/** 证书奖项：奖章 */
export const IconAward = (p: P) =>
  base(p, (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
    </>
  ));

/** 个人总结 / 自定义：书本 */
export const IconBookOpen = (p: P) =>
  base(p, (
    <>
      <path d="M3 4h9a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3z" />
      <path d="M21 4h-9a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h9z" />
    </>
  ));

/** 外观设置：调色板 */
export const IconPalette = (p: P) =>
  base(p, (
    <>
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-2 2c0 1 .5 1 .5 2s-.7 2-2.5 2z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ));

/** 外观设置：文字样式 */
export const IconType = (p: P) =>
  base(p, (
    <>
      <path d="M4 6V4h16v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ));

/** 布局设置：行列排布 */
export const IconLayout = (p: P) =>
  base(p, (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </>
  ));

/** 技能模块：扳手 */
export const IconWrench = (p: P) =>
  base(p, (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ));

/**
 * 个人总结模块：人像。
 * 原用书本图标，但书本更接近「教育 / 阅读」，与 education 的学士帽语义重叠；
 * 人像在 11px 小尺寸下轮廓也比书本更清晰（书本的翻页细节缩小后会糊）。
 */
export const IconUser = (p: P) =>
  base(p, (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ));

/* 命令面板 / 搜索入口的放大镜 */
export const IconSearch = (p: P) =>
  base(p, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ));

export const IconMenu = (p: P) =>
  base(p, (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>
  ));

export const IconPanelRight = (p: P) =>
  base(p, (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </>
  ));
