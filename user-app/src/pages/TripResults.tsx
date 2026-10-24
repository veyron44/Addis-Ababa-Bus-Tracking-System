import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getTrips, type TripsResponse, type TripOption } from '../api';
import { etaText, crowdingDisplay, standingText, type CrowdingDisplay } from '../lib/display';
import { routeColor } from '../lib/routeColors';
import { t } from '../strings';


function CrowdingTag({ display }: { display: CrowdingDisplay }) {
  return <span className={`tag ${display.color}`}>{display.label}</span>;
}

function nextBusText(option: TripOption): string {
  if (!option.nextBus) return t.noBusNow;

  const bus = option.nextBus;

  if (bus.source === 'departure') {
    if (bus.lowMin !== null && bus.highMin !== null) {
      const range =
        bus.lowMin === bus.highMin
          ? `${bus.lowMin} ${t.min}`
          : `${bus.lowMin}–${bus.highMin} ${t.min}`;
      return `${t.leavesTerminal} ${range}`;
    }
    if (bus.boarding) return t.boarding;
    return t.atTerminal;
  }

  if (bus.source === 'upcoming') {
    return `${t.about} ${etaText({
      code: 'estimate',
      lowMin: bus.lowMin,
      highMin: bus.highMin,
      lessCertain: true,
    })}`;
  }

  // arrival (live)
  return etaText({
    code: bus.code,
    lowMin: bus.lowMin,
    highMin: bus.highMin,
  });
}

function sourceLabel(option: TripOption): string | null {
  if (!option.nextBus) return null;
  if (option.nextBus.source === 'upcoming') return t.roughEstimate;
  if (option.nextBus.source === 'departure') return t.terminalSource;
  return null;
}

//  Option card

function OptionCard({
  option,
  waitAt,
  onOpenStop,
  onOpenMap,
}: {
  option: TripOption;
  waitAt: { stopId: number; placeName: string; side: string | null };
  onOpenStop: () => void;
  onOpenMap: () => void;
}) {
  const noBus = !option.nextBus;
  const crowd = option.nextBus?.crowding
    ? crowdingDisplay(option.nextBus.crowding as any)
    : null;
  const standing = option.nextBus?.standingMin !== undefined
    ? standingText(option.nextBus.standingMin ?? null)
    : null;
  const badge = sourceLabel(option);

  return (
    <div className={`trip-card${noBus ? ' trip-card--no-bus' : ''}`} onClick={onOpenStop}>
      <div className="trip-card-header">
        <div className="route-badge" style={{ background: routeColor(option.routeNumber) }}>
          {option.routeNumber}
        </div>
        <div className="trip-card-info">
          <div className="trip-card-direction">{option.directionName}</div>
          <div className="trip-card-stops">{option.stopsAway} {t.stops}</div>
        </div>
        <div className="trip-card-eta">
          <div className={`trip-card-time${noBus ? ' no-estimate' : ''}`}>
            {nextBusText(option)}
          </div>
          {badge && <span className="rough-badge">{badge}</span>}
        </div>
      </div>

      <div className="trip-card-footer">
        <div className="trip-card-wait">
          {t.waitAt} <strong>{waitAt.placeName}</strong>
        </div>
        <div className="trip-card-tags">
          {crowd && <CrowdingTag display={crowd} />}
          {standing && <span className="tag amber">{standing}</span>}
        </div>
      </div>

      <button
        className="trip-map-btn"
        onClick={(e) => { e.stopPropagation(); onOpenMap(); }}
        aria-label="Map"
      >
        🗺️ {t.map}
      </button>
    </div>
  );
}

// Results page 

export default function TripResults() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const [data, setData] = useState<TripsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrips(from, to)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  if (loading) {
    return <div className="page"><div className="loading-center">{t.loading}</div></div>;
  }

  return (
    <div className="page">
      <button className="back-link" onClick={() => navigate('/trip')}>{t.back}</button>

      <h1 className="trip-results-title">
        {from} → {to}
      </h1>

      {error && <div className="error-bar">{error}</div>}

      {data && data.trips.length === 0 && (
        <div className="empty-state">
          <div className="icon">🚌</div>
          <p>{t.noTripsFound}</p>
        </div>
      )}

      {data && data.trips.map((trip, ti) => (
        <div key={ti} className="trip-group">
          {trip.options.map((option, oi) => (
            <OptionCard
              key={oi}
              option={option}
              waitAt={trip.waitAt}
              onOpenStop={() => navigate(`/stop/${trip.waitAt.stopId}`)}
              onOpenMap={() => {
                // One map for every route of this trip, each in its own colour.
                const dirs = trip.options.map((o) => o.routeDirectionId).join(',');
                const dest = trip.options.map((o) => o.toStopId).join(',');
                navigate(`/map?dirs=${dirs}&stop=${trip.waitAt.stopId}&to=${dest}`);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
