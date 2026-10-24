import { useTrip } from '../lib/trip';
import { t } from '../strings';
import PlaceInput from './PlaceInput';

export default function Planner() {
  const { from, to, setFrom, setTo, swap, find, ready } = useTrip();

  return (
<div className="relative mt-0 h-[164px] rounded-[26px] border-2 border-ink bg-paper">      <PlaceInput
        className="top-1 h-[50px]"
        value={from.text}
        picked={from.picked}
        placeholder={t.startPlaceholder}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
        }
        onType={(text) => setFrom({ text, picked: false })}
        onPick={(text) => setFrom({ text, picked: true })}
      />
      <PlaceInput
        className="top-[54px] h-[54px]"
        value={to.text}
        picked={to.picked}
        placeholder={t.finishPlaceholder}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z" />
          </svg>
        }
        onType={(text) => setTo({ text, picked: false })}
        onPick={(text) => setTo({ text, picked: true })}
      />

      <button
        type="button"
        aria-label={t.swapPlaces}
        onClick={swap}
        className="absolute right-[-6px] top-[50px] z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-[15px] border-2 border-ink bg-white p-0"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#1a1a1a" aria-hidden="true">
          <path d="M12 3l5 6H7zM12 21l-5-6h10z" />
        </svg>
      </button>

      <button
        type="button"
        disabled={!ready}
        onClick={find}
        className="absolute bottom-[10px] right-3 h-10 cursor-pointer rounded-[20px] border-2 border-ink bg-brand px-[14px] text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50"
      >
        {t.findBus}
      </button>
    </div>
  );
}
