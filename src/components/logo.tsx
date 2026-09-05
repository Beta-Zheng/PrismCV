import { useId } from "react";

/**
 * Logo「靛纸航标」Indigo Compass（设计 v1.4 Logo v4）
 * 靛蓝渐变底块（ind-50→ind-100 + 1px ind-200 描边）+ 白纸 -6° 微倾 + 一笔光谱丝带。
 * 隐喻「一张简历纸被 AI 光谱划过」。
 * Hover 四层联动由 index.css 的 .logo 系列规则驱动（底块加深 / 靛蓝光晕 / 纸片回正上浮 / 丝带流动）。
 *
 * 渐变 id 必须每实例唯一：页面会同时存在多个 Logo（移动顶栏 + 桌面侧栏），
 * 重复 id 时 url(#) 全部解析到 DOM 首个实例——桌面端它是 display:none 的移动
 * 顶栏，Chrome 对隐藏子树不产生 paint server，丝带/底块渐变会整体消失。
 */
export default function Logo({ size = 36 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const tint = `logo-ind-tint-${uid}`;
  const tintHi = `logo-ind-tint-hi-${uid}`;
  const sp = `logo-sp-grad-${uid}`;
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" role="img">
      <defs>
        <linearGradient id={tint} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EEF0FE" />
          <stop offset="1" stopColor="#D7DBFB" />
        </linearGradient>
        <linearGradient id={tintHi} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E0E3FD" />
          <stop offset="1" stopColor="#C3C8FB" />
        </linearGradient>
        <linearGradient id={sp} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="0.52" stopColor="#6366F1" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      <rect className="block" x="1" y="1" width="38" height="38" rx="11" fill={`url(#${tint})`} stroke="#C3C8FB" strokeWidth="1" />
      <rect className="block-hi" x="1" y="1" width="38" height="38" rx="11" fill={`url(#${tintHi})`} stroke="#C3C8FB" strokeWidth="1" opacity="0" />
      <g className="paper">
        <rect x="11" y="8" width="18" height="24" rx="3.5" fill="#FFFFFF" stroke="#D8D8D2" strokeWidth="1" />
        <line x1="15" y1="14" x2="25" y2="14" stroke="#DEDEDA" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="15" y1="18.5" x2="22" y2="18.5" stroke="#EAEAE6" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path className="ribbon" d="M7 30 Q 20 35 33 25" stroke={`url(#${sp})`} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
