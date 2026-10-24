import type { ReactNode } from 'react';
import Logo from './Logo';

export default function Header({ children }: { children?: ReactNode }) {
  return (
<header className="relative z-30 flex-none rounded-b-[30px] bg-brand px-4 pb-2 pt-0 shadow-[0_2px_0_rgba(0,0,0,0.08)]"><div className="flex items-center justify-center">
        <Logo />
      </div>
      {children}
    </header>
  );
}
