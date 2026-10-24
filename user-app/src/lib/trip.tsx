import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { getTrips, type TripItem, type TripOption, type TripsResponse } from '../api';
import type { Snap } from './layout';

export type Field = { text: string; picked: boolean };
export type Card = { key: string; option: TripOption; waitAt: TripItem['waitAt'] };

type Search = { from: string; to: string };

type TripState = {
  from: Field;
  to: Field;
  setFrom: (f: Field) => void;
  setTo: (f: Field) => void;
  swap: () => void;
  find: () => void;
  ready: boolean;
  searched: boolean;
  loading: boolean;
  error: string | null;
  cards: Card[];
  selectedDir: number | null;
  selectDir: (dir: number | null) => void;
  snap: Snap;
  setSnap: (s: Snap) => void;
  sheetH: number;
  setSheetH: (h: number) => void;
  tripHref: string;
};

const EMPTY: Field = { text: '', picked: false };
const TripContext = createContext<TripState | null>(null);

export function useTrip(): TripState {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip needs TripProvider');
  return ctx;
}

export function TripProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const startFrom = params.get('from');
  const startTo = params.get('to');
  const startRoute = Number(params.get('route'));

  const [from, setFrom] = useState<Field>(startFrom ? { text: startFrom, picked: true } : EMPTY);
  const [to, setTo] = useState<Field>(startTo ? { text: startTo, picked: true } : EMPTY);
  const [submitted, setSubmitted] = useState<Search | null>(
    startFrom && startTo ? { from: startFrom, to: startTo } : null,
  );
  const [selectedDir, setSelectedDir] = useState<number | null>(startRoute > 0 ? startRoute : null);
  const [snap, setSnap] = useState<Snap>('half');
  const [sheetH, setSheetH] = useState(0);

  const [data, setData] = useState<TripsResponse | null>(null);
  const [loading, setLoading] = useState(submitted !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitted) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrips(submitted.from, submitted.to)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submitted]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (submitted) {
      q.set('from', submitted.from);
      q.set('to', submitted.to);
      if (selectedDir) q.set('route', String(selectedDir));
    }
    return q.toString();
  }, [submitted, selectedDir]);

  useEffect(() => {
    if (pathname === '/' && query !== params.toString()) setParams(new URLSearchParams(query), { replace: true });
  }, [pathname, query]);

  const cards = useMemo<Card[]>(
    () =>
      (data?.trips ?? []).flatMap((trip, ti) =>
        trip.options.map((option, oi) => ({ key: `${ti}-${oi}`, option, waitAt: trip.waitAt })),
      ),
    [data],
  );

  const value: TripState = {
    from,
    to,
    setFrom,
    setTo,
    swap: () => {
      setFrom(to);
      setTo(from);
    },
    find: () => {
      if (!from.picked || !to.picked) return;
      setSubmitted({ from: from.text, to: to.text });
      setSelectedDir(null);
      setSnap('half');
    },
    ready: from.picked && to.picked,
    searched: submitted !== null,
    loading,
    error,
    cards,
    selectedDir,
    selectDir: setSelectedDir,
    snap,
    setSnap,
    sheetH,
    setSheetH,
    tripHref: query ? `/?${query}` : '/',
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
