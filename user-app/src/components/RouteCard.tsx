import { Link } from 'react-router-dom';
import type { Card } from '../lib/trip';
import { crowdingDisplay, standingText } from '../lib/display';
import { nextBusText } from '../lib/tripText';
import { t } from '../strings';
import RouteBadge from './RouteBadge';
import Tag from './Tag';

export default function RouteCard({ card, selected, onSelect }: { card: Card; selected: boolean; onSelect: () => void }) {
  const { option, waitAt } = card;
  const bus = option.nextBus;
  const crowd = bus?.crowding ? crowdingDisplay(bus.crowding) : null;
  const standing = bus ? standingText(bus.standingMin ?? null) : null;
  const rough = bus?.source === 'upcoming' ? t.roughEstimate : bus?.source === 'departure' ? t.terminalSource : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={`cursor-pointer rounded-[20px] border-2 border-ink p-3 ${selected ? 'bg-[#fdeccf]' : 'bg-white'}`}
    >
      <div className="flex items-center gap-3">
        <RouteBadge route={option.routeNumber} grey={!bus} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{option.directionName}</div>
          <div className="text-sm text-muted">
            {option.stopsAway} {t.stops} · {t.waitAt} {waitAt.placeName}
          </div>
        </div>
        <div className="max-w-[40%] text-right">
          <div className={`text-[15px] font-bold leading-tight ${bus ? '' : 'text-muted'}`}>{nextBusText(option)}</div>
          {rough && <div className="text-xs text-muted">{rough}</div>}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {crowd && <Tag text={crowd.label} color={crowd.color} />}
          {standing && <Tag text={standing} color="amber" />}
        </div>
        <Link
          to={`/stops/${waitAt.stopId}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-none text-sm font-medium text-brand underline"
        >
          {t.stopDetails} ›
        </Link>
      </div>
    </div>
  );
}
