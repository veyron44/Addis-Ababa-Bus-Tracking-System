import { useEffect, useRef, useState } from 'react';
import { useTrip } from '../lib/trip';
import { SHEET_BOTTOM, SHEET_TUCK, nearestSnap, sheetHeights, type Snap } from '../lib/layout';
import { sheetSummary } from '../lib/tripText';
import { t } from '../strings';
import RouteCard from './RouteCard';

const TAP_LIMIT = 6;

export default function ResultsSheet() {
  const { cards, loading, error, snap, setSnap, setSheetH, selectedDir, selectDir } = useTrip();
  const [viewH, setViewH] = useState(window.innerHeight);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef({ startY: 0, startH: 0, moved: false });

  useEffect(() => {
    const onResize = () => setViewH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const heights = sheetHeights(viewH);
  const height = dragH ?? heights[snap];

  useEffect(() => {
    setSheetH(height);
  }, [height, setSheetH]);

  useEffect(() => () => setSheetH(0), [setSheetH]);

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, moved: false };
  }

  function onMove(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dy = drag.current.startY - e.clientY;
    if (Math.abs(dy) > TAP_LIMIT) drag.current.moved = true;
    if (!drag.current.moved) return;
    setDragH(Math.min(heights.full, Math.max(heights.peek, drag.current.startH + dy)));
  }

  function onUp() {
    if (drag.current.moved && dragH !== null) {
      setSnap(nearestSnap(dragH, viewH));
    } else {
      const next: Record<Snap, Snap> = { peek: 'half', half: 'full', full: 'half' };
      setSnap(next[snap]);
    }
    setDragH(null);
  }

  function pick(dir: number) {
    selectDir(selectedDir === dir ? null : dir);
    setSnap('half');
  }

  const summary = loading ? t.tripSearching : error ? error : sheetSummary(cards.map((c) => c.option));

  return (
    <section
      style={{ height, bottom: SHEET_BOTTOM }}
      className={`fixed inset-x-0 z-20 flex flex-col rounded-t-[26px] border-2 border-b-0 border-ink bg-paper ${
        dragH === null ? 'transition-[height] duration-200' : ''
      }`}
    >
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDragH(null)}
        className="flex-none cursor-grab touch-none select-none px-4 pb-2 pt-2"
      >
        <div className="mx-auto h-[5px] w-12 rounded-full bg-ink/30" />
        <div className="mt-2 truncate text-center text-[15px] font-semibold">{summary}</div>
      </div>

      <div
        style={{ paddingBottom: SHEET_TUCK + 12 }}
        className={`min-h-0 flex-1 space-y-2 overflow-y-auto px-3 ${height < heights.peek + 40 ? 'invisible' : ''}`}
      >
        {cards.map((card) => (
          <RouteCard
            key={card.key}
            card={card}
            selected={selectedDir === card.option.routeDirectionId}
            onSelect={() => pick(card.option.routeDirectionId)}
          />
        ))}
      </div>
    </section>
  );
}
