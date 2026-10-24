import { useEffect, useState, type ReactNode } from 'react';
import { searchStops, type PlaceHit } from '../api';
import { t } from '../strings';

type Props = {
  value: string;
  picked: boolean;
  placeholder: string;
  icon: ReactNode;
  className: string;
  onType: (text: string) => void;
  onPick: (name: string) => void;
};

export default function PlaceInput({ value, picked, placeholder, icon, className, onType, onPick }: Props) {
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (picked || value.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let stale = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchStops(value.trim());
        if (!stale) {
          setResults(res.places);
          setSearched(true);
        }
      } catch {
        if (!stale) setSearched(false);
      }
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [value, picked]);

  const open = focused && !picked && searched;

  return (
    <label className={`absolute inset-x-1 block ${className}`}>
      <span className="absolute left-[18px] top-1/2 -translate-y-1/2 text-[#8a8a8a]">{icon}</span>
      <input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        className="box-border h-full w-full rounded-full border-2 border-ink bg-white pl-[52px] pr-14 text-base text-ink"
      />
      {open && (
        <ul className="absolute inset-x-0 top-[calc(100%+6px)] z-50 m-0 max-h-[260px] list-none overflow-auto rounded-[22px] border-2 border-ink bg-white p-1">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-[#6b6b6b]">{t.noResults}</li>}
          {results.map((place) => (
            <li key={place.placeName}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(place.placeName)}
                className="block w-full cursor-pointer rounded-[16px] border-0 bg-transparent px-4 py-[10px] text-left text-base text-ink hover:bg-paper"
              >
                {place.placeName}
                {place.placeNameAm && <span className="block text-sm text-[#6b6b6b]">{place.placeNameAm}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
