/**
 * SUPER NOVA COMMUNITY — homepage hero banner.
 * Vector recreation of the reference artwork (crown logo + black/white
 * snakes on a tech HUD frame): crisp at any size, and every snake /
 * glow / scan element animates continuously with smooth CSS motion.
 * No other site content is touched by this component.
 */
export default function SuperNovaBanner() {
  const snakes: {
    d: string;
    head: { x: number; y: number; r: number };
    dark: boolean;
    w: number;
    dur: string;
    delay: string;
    origin: string;
  }[] = [
    // top-left white snake
    { d: 'M 600 40 C 520 30, 430 55, 415 100 C 405 135, 430 150, 455 140', head: { x: 475, y: 145, r: -25 }, dark: false, w: 26, dur: '8s', delay: '0s', origin: '50% 50%' },
    // top-centre black snake
    { d: 'M 750 45 C 830 90, 900 45, 960 95 C 1000 130, 990 175, 1020 205', head: { x: 1035, y: 220, r: 55 }, dark: true, w: 30, dur: '9.5s', delay: '-2s', origin: '50% 50%' },
    // top-right black coil
    { d: 'M 1240 60 C 1330 35, 1420 55, 1410 105 C 1400 150, 1330 150, 1335 190 C 1338 215, 1315 230, 1300 245', head: { x: 1288, y: 262, r: 115 }, dark: true, w: 30, dur: '10s', delay: '-4s', origin: '50% 50%' },
    // left black coil (big)
    { d: 'M 330 205 C 260 190, 150 215, 130 280 C 110 345, 190 385, 255 360 C 320 335, 315 265, 245 255 C 190 248, 150 275, 165 305', head: { x: 105, y: 195, r: -60 }, dark: true, w: 34, dur: '11s', delay: '-1s', origin: '50% 50%' },
    // right white snake
    { d: 'M 1435 240 C 1500 260, 1495 330, 1445 355 C 1395 380, 1410 435, 1470 450 C 1505 460, 1525 480, 1535 505', head: { x: 1545, y: 525, r: 70 }, dark: false, w: 26, dur: '8.5s', delay: '-3s', origin: '50% 50%' },
    // bottom-left white infinity
    { d: 'M 230 560 C 300 470, 420 480, 430 545 C 438 600, 360 615, 330 575 C 300 535, 360 500, 420 515 C 470 528, 480 480, 455 445', head: { x: 448, y: 425, r: -35 }, dark: false, w: 30, dur: '9s', delay: '-5s', origin: '50% 50%' },
    // bottom-right black infinity
    { d: 'M 880 590 C 960 510, 1080 520, 1090 580 C 1098 630, 1020 640, 990 600 C 960 560, 1030 530, 1085 550 C 1130 566, 1135 510, 1115 465', head: { x: 1108, y: 445, r: -20 }, dark: true, w: 32, dur: '10.5s', delay: '-6s', origin: '50% 50%' },
  ];

  return (
    <section
      className="supernova-banner panel relative overflow-hidden"
      role="img"
      aria-label="SUPER NOVA COMMUNITY — crown logo surrounded by animated black and white snakes on a technology frame"
    >
      <svg viewBox="0 0 1600 620" className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="snBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7f9fb" />
            <stop offset="55%" stopColor="#eceff3" />
            <stop offset="100%" stopColor="#d8dde4" />
          </linearGradient>
          <radialGradient id="snGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff2a2a" stopOpacity="0.16" />
            <stop offset="55%" stopColor="#ff2a2a" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ff2a2a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="snBlack" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a3f46" />
            <stop offset="50%" stopColor="#0b0c0e" />
            <stop offset="100%" stopColor="#2c3036" />
          </linearGradient>
          <linearGradient id="snWhite" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e8ecf1" />
            <stop offset="100%" stopColor="#c9cfd8" />
          </linearGradient>
          <linearGradient id="snScan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <pattern id="snGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 H 0 V 48" fill="none" stroke="#b9c1cc" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>

        <rect width="1600" height="620" fill="url(#snBg)" />
        <rect width="1600" height="620" fill="url(#snGrid)" />

        {/* pulsing glow behind the logo */}
        <ellipse cx="800" cy="320" rx="420" ry="230" fill="url(#snGlow)" className="sn-glow" />

        {/* animated scan line */}
        <rect x="0" y="-80" width="1600" height="70" fill="url(#snScan)" className="sn-scan" />

        {/* tech frame: corners + HUD ticks */}
        <g stroke="#8b95a3" strokeWidth="3" fill="none">
          <path d="M 24 70 V 24 H 70" />
          <path d="M 1530 24 H 1576 V 70" />
          <path d="M 24 550 V 596 H 70" />
          <path d="M 1530 596 H 1576 V 550" />
        </g>
        <g fill="#6b7480">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={300 + i * 86} y={10} width={34} height={5} opacity={i % 3 === 0 ? 0.9 : 0.4} />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={300 + i * 86} y={605} width={34} height={5} opacity={i % 3 === 0 ? 0.9 : 0.4} />
          ))}
        </g>
        <g fill="#ff2a2a">
          <circle cx="52" cy="52" r="5" className="sn-blink" />
          <circle cx="1548" cy="52" r="5" className="sn-blink" style={{ animationDelay: '-1.2s' }} />
          <circle cx="52" cy="568" r="5" className="sn-blink" style={{ animationDelay: '-2.1s' }} />
          <circle cx="1548" cy="568" r="5" className="sn-blink" style={{ animationDelay: '-0.6s' }} />
        </g>

        {/* snakes */}
        {snakes.map((s, i) => (
          <g
            key={i}
            className="sn-snake"
            style={{ animationDuration: s.dur, animationDelay: s.delay, transformOrigin: s.origin }}
          >
            <path
              d={s.d}
              fill="none"
              stroke={s.dark ? 'url(#snBlack)' : 'url(#snWhite)'}
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: s.dark ? 'drop-shadow(0 6px 6px rgba(0,0,0,0.35))' : 'drop-shadow(0 6px 6px rgba(30,35,45,0.28))' }}
            />
            {/* moving scale shimmer */}
            <path
              d={s.d}
              fill="none"
              stroke={s.dark ? '#9aa5b1' : '#aeb8c4'}
              strokeWidth={s.w * 0.45}
              strokeLinecap="round"
              strokeDasharray="10 26"
              opacity="0.35"
              className="sn-scales"
            />
            {/* head */}
            <g transform={`translate(${s.head.x} ${s.head.y}) rotate(${s.head.r})`}>
              <ellipse cx="0" cy="0" rx="26" ry="17" fill={s.dark ? 'url(#snBlack)' : 'url(#snWhite)'} stroke={s.dark ? '#000' : '#9aa5b1'} strokeWidth="1.5" />
              <circle cx="9" cy="-5" r="3.2" fill={s.dark ? '#fff' : '#111'} />
              <circle cx="9" cy="-5" r="1.5" fill={s.dark ? '#111' : '#fff'} />
              <g className="sn-tongue" style={{ transformOrigin: '24px 0' }}>
                <path d="M 24 0 H 42 M 42 0 L 50 -6 M 42 0 L 50 6" stroke="#c81e1e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </g>
            </g>
          </g>
        ))}

        {/* centre logo */}
        <g className="sn-logo">
          {/* crown */}
          <g transform="translate(800 168)">
            <path
              d="M -95 55 L -95 -18 L -58 18 L -30 -42 L 0 -2 L 30 -42 L 58 18 L 95 -18 L 95 55 Z"
              fill="#101115"
              stroke="#101115"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <rect x="-95" y="62" width="190" height="12" rx="4" fill="#101115" />
            <polygon points="0,-78 10,-62 0,-46 -10,-62" fill="#101115" />
            <polygon points="-30,-68 -21,-54 -30,-40 -39,-54" fill="#101115" />
            <polygon points="30,-68 39,-54 30,-40 21,-54" fill="#101115" />
            <polygon points="-58,-2 -48,14 -58,30 -68,14" fill="#101115" />
            <polygon points="58,-2 68,14 58,30 48,14" fill="#101115" />
            <polygon points="0,10 9,24 0,38 -9,24" fill="#f4f6f8" />
          </g>
          <text x="800" y="330" textAnchor="middle" fontFamily="'Arial Black','Segoe UI',Arial,sans-serif" fontWeight="900" fontSize="118" letterSpacing="6" fill="#101115">
            SUPER
          </text>
          <text x="800" y="432" textAnchor="middle" fontFamily="'Arial Black','Segoe UI',Arial,sans-serif" fontWeight="900" fontSize="118" letterSpacing="10" fill="#101115">
            NOVA
          </text>
          <text x="800" y="488" textAnchor="middle" fontFamily="'Segoe UI',Arial,sans-serif" fontWeight="600" fontSize="34" letterSpacing="22" fill="#2b2f36">
            COMMUNITY
          </text>
          <g stroke="#101115" strokeWidth="3">
            <line x1="640" y1="522" x2="772" y2="522" />
            <line x1="828" y1="522" x2="960" y2="522" />
          </g>
          <polygon points="800,510 812,522 800,534 788,522" fill="#101115" />
        </g>
      </svg>
    </section>
  );
}
