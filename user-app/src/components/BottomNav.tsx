import { NavLink } from 'react-router-dom';
import { t } from '../strings';
import { useTrip } from '../lib/trip';

function TripIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M8 13v7M4 20h12M16 9h5v5h-5z" />
    </svg>
  );
}

function Tab({ to, active, label, icon }: { to: string; active: boolean; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={`flex h-[66px] w-[150px] flex-col items-center justify-center gap-[6px] rounded-[20px] border-2 text-[11.5px] font-bold uppercase tracking-[0.3px] no-underline ${
        active ? 'border-ink bg-white text-ink' : 'border-transparent text-[#5c5c5c]'
      }`}
    >
      {icon}
      {label}
    </NavLink>
  );
}

export default function BottomNav({ onStops }: { onStops: boolean }) {
  const { tripHref } = useTrip();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[92px] items-center justify-center gap-6 rounded-t-[30px] border-x-2 border-t-2 border-ink bg-white px-6 pb-[6px]">
      <Tab to={tripHref} active={!onStops} label={t.tripsTab} icon={<TripIcon />} />
      <Tab to="/stops" active={onStops} label={t.stopsTab} icon={<StopIcon />} />
    </nav>
  );
}
