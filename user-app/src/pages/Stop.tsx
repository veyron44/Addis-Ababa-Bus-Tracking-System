import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getArrivals, type ArrivalBus, type ArrivalsResponse, type UpcomingBus } from '../api';
import { usePolling } from '../lib/usePolling';
import { crowdingDisplay, etaText, noEstimateReason, standingText } from '../lib/display';
import { departureText } from '../lib/tripText';
import { saveRecent } from './Search';
import RouteBadge from '../components/RouteBadge';
import Tag from '../components/Tag';
import { t } from '../strings';

const card = 'rounded-[20px] border-2 border-ink bg-white';

function Section({ title }: { title: string }) {
  return <h2 className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>;
}

function ArrivalCard({ bus }: { bus: ArrivalBus }) {
  const eta = etaText({ code: bus.code, lowMin: bus.lowMin, highMin: bus.highMin, reason: bus.reason });
  const reason = noEstimateReason({ code: bus.code, reason: bus.reason }, t.reasons);
  const crowd = crowdingDisplay(bus.crowding);
  const standing = standingText(bus.standingMin);
  const noEstimate = bus.code !== 'arriving' && bus.lowMin === null;

  return (
    <div className={`${card} mb-2 flex gap-3 p-3`}>
      <RouteBadge route={bus.routeNumber} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{bus.directionName}</div>
        <div className={`text-lg font-bold ${noEstimate ? 'text-muted' : ''}`}>{eta}</div>
        {reason && <div className="text-sm text-muted">{reason}</div>}
        {(crowd || standing) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {crowd && <Tag text={crowd.label} color={crowd.color} />}
            {standing && <Tag text={standing} color="amber" />}
          </div>
        )}
      </div>
    </div>
  );
}

function UpcomingCard({ bus }: { bus: UpcomingBus }) {
  const eta = etaText({ code: 'estimate', lowMin: bus.lowMin, highMin: bus.highMin, lessCertain: bus.lessCertain });
  const crowd = crowdingDisplay(bus.crowding);

  return (
    <div className={`${card} mb-2 flex gap-3 border-dashed p-3`}>
      <RouteBadge route={bus.routeNumber} grey />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{bus.directionName}</div>
        <div className="text-lg font-bold">{eta}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Tag text={t.roughEstimate} color="grey" />
          {crowd && <Tag text={crowd.label} color={crowd.color} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[6px]">
      <span className="text-[15px]">{label}</span>
      <span className={`text-right text-[15px] ${bold ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}

function Departures({ data }: { data: ArrivalsResponse['departures'] }) {
  if (!data.startingPoint) return null;
  const gap = data.typicalGap;

  return (
    <>
      <Section title={t.departures} />
      <div className={`${card} divide-y divide-ink/15 px-4 py-2`}>
        <Row label={t.waitingNow} value={String(data.waitingCount)} />
        {data.lastBusLeftMinAgo !== null && <Row label={t.lastBusLeft} value={`${data.lastBusLeftMinAgo} ${t.minAgo}`} />}
        {gap && (
          <Row
            label={t.typicalGap}
            value={gap.lowMin === gap.highMin ? `${gap.lowMin} ${t.min}` : `${gap.lowMin}–${gap.highMin} ${t.min}`}
          />
        )}
        {data.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <RouteBadge route={item.routeNumber} grey={item.kind === 'not_started'} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{item.directionName}</div>
              <div className={`text-[15px] ${item.boarding ? 'font-bold text-brand' : ''}`}>{departureText(item)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EmptyState({ routes }: { routes: ArrivalsResponse['routes'] }) {
  return (
    <div className="mt-6 text-center">
      <p className="text-lg font-semibold">{t.noBusesNow}</p>
      {routes.length > 0 && (
        <>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">{t.routesHere}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {routes.map((r, i) => (
              <span key={i} className="rounded-full border-2 border-ink bg-white px-3 py-1 text-sm">
                {r.routeNumber} · {r.directionName}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Stop() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const stopId = Number(id);

  const { data, error, loading } = usePolling(() => getArrivals(stopId), 10);

  const [updatedAgo, setUpdatedAgo] = useState(0);
  const lastFetch = useRef(0);

  useEffect(() => {
    if (!data) return;
    lastFetch.current = Date.now();
    setUpdatedAgo(0);
    saveRecent({ id: stopId, placeName: data.stop.placeName, placeNameAm: data.stop.placeNameAm, side: data.stop.side });
  }, [data, stopId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastFetch.current > 0) setUpdatedAgo(Math.round((Date.now() - lastFetch.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasArrivals = (data?.arrivals.length ?? 0) > 0;
  const hasUpcoming = (data?.upcoming.length ?? 0) > 0;
  const hasDepartures = data?.departures.startingPoint ?? false;

  return (
    <div className="px-4">
      <button
        type="button"
        onClick={() => navigate('/stops')}
        className="mb-3 h-10 cursor-pointer rounded-full border-2 border-ink bg-white px-4 text-sm font-semibold"
      >
        ← {t.back}
      </button>

      {loading && !data && <p className="mt-6 text-center text-muted">{t.loading}</p>}

      {error && data && (
        <div className="mb-3 rounded-[16px] border-2 border-ink bg-[#f8d4d4] px-4 py-2 text-center text-sm">{t.noConnection}</div>
      )}

      {error && !data && !loading && (
        <div className={`${card} p-4 text-center`}>{error.message}</div>
      )}

      {data && (
        <>
          <div className={`${card} bg-paper p-4`}>
            <h1 className="text-xl font-bold">{data.stop.placeName}</h1>
            {data.stop.placeNameAm && <div className="text-muted">{data.stop.placeNameAm}</div>}
            <div className="mt-1 text-[15px]">{data.stop.side}</div>
            <div className="mt-1 text-xs text-muted">
              {t.updated} {updatedAgo}
              {t.secondsAgo}
            </div>
          </div>

          <Departures data={data.departures} />

          {hasArrivals && (
            <>
              <Section title={t.busesOnTheRoad} />
              {data.arrivals.map((bus) => (
                <ArrivalCard key={bus.busId} bus={bus} />
              ))}
            </>
          )}

          {hasUpcoming && (
            <>
              <Section title={t.notOnTheRoadYet} />
              {data.upcoming.map((bus) => (
                <UpcomingCard key={bus.busId} bus={bus} />
              ))}
            </>
          )}

          {!hasArrivals && !hasUpcoming && !hasDepartures && <EmptyState routes={data.routes} />}
        </>
      )}
    </div>
  );
}
