import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="ForgeAI home">
      <span className="relative grid size-8 place-items-center rounded-[10px] border border-white/10 bg-white/5 shadow-[var(--glow-ember)] transition-transform duration-500 group-hover:rotate-[8deg]">
        <svg viewBox="0 0 64 64" className="size-5" aria-hidden>
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff9a82" />
              <stop offset="1" stopColor="#f2547f" />
            </linearGradient>
          </defs>
          <path d="M14 50 L32 12 L50 50" fill="none" stroke="url(#lg)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="38" r="5" fill="#8fd0ff" />
        </svg>
      </span>
      <span className="font-display text-[22px] tracking-tight text-star">ForgeAI</span>
    </Link>
  );
}
