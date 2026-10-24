import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRouteLive, type LiveResponse } from '../api';
import { useTrip } from '../lib/trip';
import { usePolling } from '../lib/usePolling';
import { routeColor, STALE_COLOR } from '../lib/routeColors';
import { sheetHeights } from '../lib/layout';
import { t } from '../strings';

const ADDIS: L.LatLngExpression = [9.03, 38.75];

const squareBtn = 'flex h-11 w-11 cursor-pointer items-center justify-center border-2 border-ink bg-white p-0 text-ink';

function busIcon(color: string, routeNumber: string, big: boolean): L.DivIcon {
  const size = big ? 40 : 34;
  return L.divIcon({
    className: 'bus-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<svg viewBox="0 0 34 34" width="${size}" height="${size}">
      <circle cx="17" cy="17" r="15" fill="${color}" stroke="#1a1a1a" stroke-width="2.5"/>
      <text x="17" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${routeNumber}</text>
    </svg>`,
  });
}

export default function MapView() {
  const { cards, selectedDir, sheetH, snap, searched } = useTrip();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const roadsRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<L.CircleMarker | null>(null);
  const busesRef = useRef<Map<number, L.Marker>>(new Map());
  const fittedRef = useRef('');
  const [notice, setNotice] = useState<string | null>(null);

  const layers = useMemo(() => {
    const seen = new Set<number>();
    return cards
      .filter((c) => !seen.has(c.option.routeDirectionId) && seen.add(c.option.routeDirectionId))
      .map((c) => ({ dirId: c.option.routeDirectionId, stopId: c.waitAt.stopId, destId: c.option.toStopId }));
  }, [cards]);
  const layersKey = layers.map((l) => `${l.dirId}:${l.stopId}`).join(',');

  const { data, refresh } = usePolling<LiveResponse[]>(
    () =>
      Promise.all(
        layers.map((l) => getRouteLive(l.dirId, l.stopId).catch(() => getRouteLive(l.dirId, null))),
      ),
    5,
  );

  useEffect(() => {
    refresh();
  }, [layersKey, refresh]);

  const lives = useMemo(
    () => (data ?? []).filter((live) => layers.some((l) => l.dirId === live.route.routeDirectionId)),
    [data, layers],
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!box || mapRef.current) return;

    const map = L.map(box, { center: ADDIS, zoom: 13, zoomSnap: 0.25, zoomControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    roadsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(box);

    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      roadsRef.current = null;
      meRef.current = null;
      busesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const group = roadsRef.current;
    if (!group) return;
    group.clearLayers();

    for (const live of lives) {
      const dir = live.route.routeDirectionId;
      const layer = layers.find((l) => l.dirId === dir);
      const color = routeColor(live.route.routeNumber);
      const dimmed = selectedDir !== null && dir !== selectedDir;
      const chosen = selectedDir === dir;

      if (live.route.line.length > 1) {
        L.polyline(live.route.line, {
          color,
          weight: chosen ? 8 : dimmed ? 4 : 6,
          opacity: dimmed ? 0.3 : 0.9,
        }).addTo(group);
      }
      if (dimmed) continue;

      for (const s of live.stops) {
        if (s.lat === null || s.lng === null) continue;
        const key = s.stopId === layer?.stopId || s.stopId === layer?.destId;
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: key ? 9 : chosen ? 5 : 3,
          color: key ? '#1a1a1a' : color,
          weight: key ? 3 : 2,
          fillColor: '#fff',
          fillOpacity: 1,
        }).addTo(group);
        marker.bindTooltip(s.placeName, { permanent: key && (chosen || selectedDir === null), direction: 'top' });
      }
    }
  }, [lives, layers, selectedDir]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = new Set<number>();

    for (const live of lives) {
      const dir = live.route.routeDirectionId;
      const dimmed = selectedDir !== null && dir !== selectedDir;
      const base = routeColor(live.route.routeNumber);

      for (const bus of live.buses) {
        if (!bus.position) continue;
        current.add(bus.busId);
        const icon = busIcon(bus.fresh ? base : STALE_COLOR, live.route.routeNumber, selectedDir === dir);
        const latlng = L.latLng(bus.position.lat, bus.position.lng);
        const label = bus.nextStop ? `${t.nextStop}: ${bus.nextStop.placeName}` : live.route.directionName;

        let marker = busesRef.current.get(bus.busId);
        if (marker) {
          marker.setLatLng(latlng);
          marker.setIcon(icon);
          marker.setTooltipContent(label);
        } else {
          marker = L.marker(latlng, { icon }).addTo(map).bindTooltip(label, { direction: 'top', offset: [0, -14] });
          busesRef.current.set(bus.busId, marker);
        }
        marker.setOpacity(dimmed ? 0.35 : 1);
        marker.setZIndexOffset(selectedDir === dir ? 2000 : 1000);
      }
    }

    for (const [id, marker] of busesRef.current) {
      if (!current.has(id)) {
        marker.remove();
        busesRef.current.delete(id);
      }
    }
  }, [lives, selectedDir]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lives.length === 0) return;
    const key = `${layersKey}|${selectedDir}`;
    if (fittedRef.current === key) return;

    const wanted = selectedDir === null ? lives : lives.filter((l) => l.route.routeDirectionId === selectedDir);
    const points = wanted.flatMap((l) => l.route.line);
    if (points.length === 0) return;
    fittedRef.current = key;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [24, 44],
      paddingBottomRight: [24, sheetHeights(window.innerHeight).half],
    });
  }, [lives, layersKey, selectedDir]);

  useEffect(() => {
    if (!searched) fittedRef.current = '';
  }, [searched]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function locate() {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) {
      setNotice(t.locationOff);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = L.latLng(pos.coords.latitude, pos.coords.longitude);
        meRef.current?.remove();
        meRef.current = L.circleMarker(here, {
          radius: 9,
          color: '#fff',
          weight: 3,
          fillColor: '#3f7468',
          fillOpacity: 1,
        }).addTo(map);
        map.flyTo(here, 16);
      },
      () => setNotice(t.locationOff),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const controlsBottom = searched ? sheetH + 20 : 44;
  const hideControls = searched && snap === 'full';

  return (
    <div className="relative z-0 -mt-[30px] mb-[62px] min-h-0 flex-1">
      <div ref={boxRef} className="absolute inset-0 z-0" />

      {!hideControls && (
        <>
          <div
            style={{ bottom: controlsBottom }}
            className="absolute right-[14px] z-20 flex flex-col overflow-hidden rounded-[16px] border-ink"
          >
            <button type="button" aria-label={t.zoomIn} onClick={() => mapRef.current?.zoomIn()} className={`${squareBtn} rounded-t-[16px] border-b`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button type="button" aria-label={t.zoomOut} onClick={() => mapRef.current?.zoomOut()} className={`${squareBtn} rounded-b-[16px] border-t`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            aria-label={t.myLocation}
            onClick={locate}
            style={{ bottom: controlsBottom }}
            className="absolute left-[14px] z-20 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-4 border-[#b9b9b9] bg-brand p-0 shadow-[0_0_0_2px_#1a1a1a]"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M12 2l8 19-8-4-8 4z" />
            </svg>
          </button>
        </>
      )}

      {notice && (
        <div
          style={{ bottom: controlsBottom + 68 }}
          className="absolute left-[14px] right-[14px] z-20 rounded-[16px] border-2 border-ink bg-paper px-4 py-2 text-center text-sm text-ink"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
