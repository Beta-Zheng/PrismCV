import { useId } from "react";

/**
 * Logo「试金石」Touchstone（v1.4 · Logo v6 · 灵动版）
 *
 * 相比 v5（矩形石板 + 等宽划痕）的改动：
 * 1. 石板 → 不规则七边形岩块（自然棱面，不再是死板矩形）
 * 2. 主划痕 → 起笔重、收笔尖的楔形 fill（真实擦痕的粗细变化），末端亮金
 * 3. 加副划痕 + 短碎痕，形成疏密节奏而不是孤零零一条线
 * 4. 加三粒飞溅金屑，落在划痕延长线上（灵动感的主要来源），hover 时错相闪烁
 * 5. 划痕上叠一条流动高光细线（.ribbon），hover 时沿痕掠过
 * 6. 划痕处向底块散出一圈暖光（halo），破掉底块的平板感
 *
 * 渐变 id 必须每实例唯一：页面会同时存在多个 Logo（移动顶栏 + 桌面侧栏），
 * 重复 id 时 url(#) 全部解析到 DOM 首个实例——桌面端它是 display:none 的移动
 * 顶栏，Chrome 对隐藏子树不产生 paint server，划痕/底块渐变会整体消失。
 */
export default function Logo({ size = 36 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const tint = `logo-ind-tint-${uid}`;
  const tintHi = `logo-ind-tint-hi-${uid}`;
  const stone = `logo-stone-${uid}`;
  const gold = `logo-gold-grad-${uid}`;
  const goldSoft = `logo-gold-soft-${uid}`;
  const halo = `logo-halo-${uid}`;

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
        {/* 岩块：带一点蓝紫调的黑硅石，避免死黑 */}
        <linearGradient id={stone} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#3C3C49" />
          <stop offset="0.55" stopColor="#24242E" />
          <stop offset="1" stopColor="#17171F" />
        </linearGradient>
        {/* 主划痕：起点陈金 → 末端刚擦出的亮金 */}
        <linearGradient id={gold} x1="0.05" y1="0.95" x2="0.95" y2="0.1">
          <stop offset="0" stopColor="#C97C10" />
          <stop offset="0.42" stopColor="#F0A93A" />
          <stop offset="0.78" stopColor="#F8C74A" />
          <stop offset="1" stopColor="#FFF0BC" />
        </linearGradient>
        <linearGradient id={goldSoft} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#E9A22F" />
          <stop offset="1" stopColor="#FDDC8E" />
        </linearGradient>
        <radialGradient id={halo} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F5A623" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#F5A623" stopOpacity="0.12" />
          <stop offset="1" stopColor="#F5A623" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect className="block" x="1" y="1" width="38" height="38" rx="11.5" fill={`url(#${tint})`} stroke="#C3C8FB" strokeWidth="1" />
      <rect className="block-hi" x="1" y="1" width="38" height="38" rx="11.5" fill={`url(#${tintHi})`} stroke="#C3C8FB" strokeWidth="1" opacity="0" />

      {/* 划痕处散出的暖光：压在岩块之下，只在底块上可见 */}
      <circle cx="31.6" cy="11.8" r="10" fill={`url(#${halo})`} />

      <g className="paper">
        {/* 试金石：不规则七边形岩块 */}
        <path
          d="M11.6 8.8 L28.2 6.8 L32.2 21.6 L28.6 32.8 L12.8 33.6 L9.0 25.4 L8.4 15.2 Z"
          fill={`url(#${stone})`}
          stroke="#111118"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* 左上受光的棱边高光，给岩块体积 */}
        <path d="M12.6 11.4 Q 10.7 18.2 12.0 25.2" stroke="#63637A" strokeWidth="1.15" fill="none" strokeLinecap="round" opacity="0.8" />
        <path d="M14.8 10.3 Q 20.2 9.0 26.0 8.5" stroke="#505064" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.65" />

        {/* 左下短碎痕：反复试金留下的细擦痕 */}
        <path d="M12.4 30.2 L 16.6 28.0" stroke={`url(#${goldSoft})`} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" />
        {/* 副划痕：与主痕平行但更细更短，制造疏密 */}
        <path d="M13.8 21.6 Q 19.2 18.0 24.8 13.9" stroke={`url(#${goldSoft})`} strokeWidth="1.25" fill="none" strokeLinecap="round" opacity="0.78" />

        {/* 主划痕：起笔重 → 收笔尖的楔形 */}
        <path d="M10.9 28.4 Q 21.8 26.4 29.8 12.2 Q 19.8 20.8 12.4 26.4 Z" fill={`url(#${gold})`} />
        {/* 沿痕掠过的流动高光 */}
        <path className="ribbon" d="M11.9 27.1 Q 21.0 23.5 29.6 12.4" stroke="#FFF7DD" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.34" />

        {/* 飞溅的金屑：落在主痕延长线上，错相闪烁 */}
        <circle className="spark" cx="31.7" cy="10.5" r="0.95" fill="#F8C74A" />
        <circle className="spark" cx="33.5" cy="12.7" r="0.55" fill="#FFE9A8" style={{ animationDelay: "0.18s" }} />
        <circle className="spark" cx="29.5" cy="8.5" r="0.6" fill="#F5B942" style={{ animationDelay: "0.36s" }} />
      </g>
    </svg>
  );
}
