import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchStops, type PlaceHit } from '../api';
import { t } from '../strings';


type PickedStop = {
  placeName: string;
  placeNameAm: string | null;
};

function StopPicker({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: PickedStop | null;
  onPick: (stop: PickedStop) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await searchStops(q);
      setResults(res.places);
    } catch {
      // keep old results
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    if (query.length < 2) {
      setResults(null);
      return;
    }
    timerRef.current = window.setTimeout(() => doSearch(query), 300);
    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [query, doSearch]);

  function pick(place: PlaceHit) {
    onPick({
      placeName: place.placeName,
      placeNameAm: place.placeNameAm,
    });
    setQuery('');
    setResults(null);
  }

  // When selected, show a chip instead of the input
  if (value) {
    return (
      <div className="trip-picker-chip">
        <span className="trip-picker-label">{label}</span>
        <span className="trip-picker-value">{value.placeName}</span>
        <button className="trip-picker-clear" onClick={onClear} aria-label="Clear">✕</button>
      </div>
    );
  }

  const showResults = results !== null && query.length >= 2;

  return (
    <div className="trip-picker">
      <span className="trip-picker-label">{label}</span>
      <div className="search-box">
        <svg className="icon-search" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8.5" cy="8.5" r="6" />
          <line x1="13" y1="13" x2="18" y2="18" />
        </svg>
        <input
          type="search"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>{t.loading}</div>}
      {showResults && results.length === 0 && !loading && (
        <div style={{ color: 'var(--muted)', fontSize: 14, padding: '6px 0' }}>{t.noResults}</div>
      )}
      {showResults && results.map((place, i) => (
        <div className="place-group place-pick" key={i} onClick={() => pick(place)}>
          <div className="place-name">{place.placeName}</div>
          {place.placeNameAm && <div className="place-name-am">{place.placeNameAm}</div>}
        </div>
      ))}
    </div>
  );
}

// ---- Main trip screen ----

export default function Trip() {
  const navigate = useNavigate();
  const [from, setFrom] = useState<PickedStop | null>(null);
  const [to, setTo] = useState<PickedStop | null>(null);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  function find() {
    if (!from || !to) return;
    const params = new URLSearchParams({
      from: from.placeName,
      to: to.placeName,
    });
    navigate(`/trip/results?${params}`);
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/')}>{t.back}</button>

      <h1 className="trip-title">{t.tripTitle}</h1>

      <div className="trip-pickers">
        <StopPicker label={t.from} value={from} onPick={setFrom} onClear={() => setFrom(null)} />

        <button className="trip-swap" onClick={swap} aria-label="Swap">⇅</button>

        <StopPicker label={t.to} value={to} onPick={setTo} onClear={() => setTo(null)} />
      </div>

      <button
        className="trip-find-btn"
        disabled={!from || !to}
        onClick={find}
      >
        {t.findBuses}
      </button>
    </div>
  );
}
