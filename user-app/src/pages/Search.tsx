import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchStops, type PlaceHit } from '../api';
import { t } from '../strings';

type RecentStop = {
  id: number;
  placeName: string;
  placeNameAm: string | null;
  side: string;
};

const RECENT_KEY = 'recentStops';
const MAX_RECENT = 5;

function loadRecent(): RecentStop[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveRecent(stop: RecentStop): void {
  try {
    const list = loadRecent().filter((s) => s.id !== stop.id);
    list.unshift(stop);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
  }
}

const chevron = <span className="text-xl text-muted">›</span>;

export default function Search() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent] = useState(loadRecent);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let stale = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchStops(q);
        if (!stale) setResults(res.places);
      } catch {
      } finally {
        if (!stale) setLoading(false);
      }
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function goToStop(stop: RecentStop) {
    saveRecent(stop);
    navigate(`/stops/${stop.id}`);
  }

  const showResults = results !== null && query.trim().length >= 2;

  return (
    <div className="px-4">
      <label className="relative block">
        <svg className="absolute left-[18px] top-1/2 -translate-y-1/2 text-muted" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" />
          <line x1="13" y1="13" x2="18" y2="18" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className="h-[54px] w-full rounded-full border-2 border-ink bg-white pl-[52px] pr-5 text-base"
        />
      </label>

      {loading && <p className="mt-4 text-center text-sm text-muted">{t.loading}</p>}

      {showResults && results.length === 0 && !loading && <p className="mt-6 text-center text-muted">{t.noResults}</p>}

      {showResults &&
        results.map((place) => (
          <div key={place.placeName} className="mt-3 overflow-hidden rounded-[20px] border-2 border-ink bg-white">
            <div className="px-4 pb-1 pt-3">
              <div className="font-semibold">{place.placeName}</div>
              {place.placeNameAm && <div className="text-sm text-muted">{place.placeNameAm}</div>}
            </div>
            {place.stops.map((stop) => (
              <button
                type="button"
                key={stop.id}
                onClick={() => goToStop({ id: stop.id, placeName: place.placeName, placeNameAm: place.placeNameAm, side: stop.side })}
                className="flex w-full cursor-pointer items-center justify-between border-0 border-t border-ink/15 bg-transparent px-4 py-3 text-left text-[15px]"
              >
                <span>{stop.side}</span>
                {chevron}
              </button>
            ))}
          </div>
        ))}

      {!showResults && recent.length > 0 && (
        <>
          <h2 className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-wide text-muted">{t.recentStops}</h2>
          <div className="space-y-2">
            {recent.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => goToStop(r)}
                className="flex w-full cursor-pointer items-center justify-between rounded-[20px] border-2 border-ink bg-white px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-semibold">{r.placeName}</span>
                  <span className="block text-sm text-muted">{r.side}</span>
                </span>
                {chevron}
              </button>
            ))}
          </div>
        </>
      )}

      {!showResults && recent.length === 0 && <p className="mt-8 text-center text-muted">{t.searchHint}</p>}
    </div>
  );
}
