import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRouteLive, type LiveBus, type LiveResponse } from '../api';
import { usePolling } from '../lib/usePolling';
import { crowdingDisplay, type CrowdingDisplay } from '../lib/display';
import { routeColor, STALE_COLOR } from '../lib/routeColors';
import { t } from '../strings';

// A bus with the route it belongs to, so the map and the sheet can colour it.
type MapBus = LiveBus & { routeNumber: string; directionName: string; color: string };

function busIcon(color: string, routeNumber: string): L.DivIcon {
  return L.divIcon({
    className: 'bus-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<svg viewBox="0 0 34 34" width="34" height="34">
      <circle cx="17" cy="17" r="15" fill="${color}" stroke="#fff" stroke-width="2.5"/>
      <text x="17" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">${routeNumber}</text>
    </svg>`,
  });
}

function CrowdingTag({ display }: { display: CrowdingDisplay }) {
  return <span className={`tag ${display.color}`}>{display.label}</span>;
}

function BusSheet({ bus, onClose }: { bus: MapBus; onClose: () => void }) {
  const crowd = crowdingDisplay(bus.crowding as any);

  return (
    <div className="map-sheet">
      <button className="map-sheet-close" onClick={onClose}>✕</button>
      <div className="map-sheet-header">
        <div className="route-badge" style={{ background: bus.color }}>{bus.routeNumber}</div>
        <div className="map-sheet-info">
          <div className="map-sheet-dir">{bus.directionName}</div>
          {bus.nextStop && (
            <div className="map-sheet-next">{t.nextStop}: {bus.nextStop.placeName}</div>
          )}
          {bus.forStop && (
            <div className="map-sheet-dist">
              {bus.forStop.passed ? t.passed : `${Math.round(bus.forStop.distanceM)}m ${t.away}`}
            </div>
          )}
          {!bus.fresh && <div className="map-sheet-stale">{t.stalePosition}</div>}
        </div>
      </div>
      <div className="bus-tags" style={{ marginTop: 8 }}>
        {crowd && <CrowdingTag display={crowd} />}
      </div>
    </div>
  );
}

function ids(text: string | null): number[] {
  return (text ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

// One map for one or more route directions.
export default function MapScreen() {
  const { directionId } = useParams<{ directionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const dirsKey = params.get('dirs') ?? directionId ?? '';
  const directionIds = useMemo(() => ids(dirsKey), [dirsKey]);
  const stopId = params.get('stop') ? Number(params.get('stop')) : null;
  const destKey = params.get('to') ?? '';
  const destIds = useMemo(() => ids(destKey), [destKey]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const roadLayerRef = useRef<L.LayerGroup | null>(null);
  const busMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const drawnRef = useRef(false);
  const fittedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [9.03, 38.75], // Addis Ababa
      zoom: 13,
      zoomSnap: 0.25,
      zoomControl: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    roadLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      roadLayerRef.current = null;
      busMarkersRef.current.clear();
      drawnRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  const { data, error } = usePolling<LiveResponse[]>(
    () =>
      Promise.all(
        directionIds.map((id) =>
          // The wait stop is only asked for when it is on this direction.
          getRouteLive(id, stopId).catch(() => getRouteLive(id, null)),
        ),
      ),
    5,
  );

  // Each route with its colour. The first one is drawn widest, so lines on the same road stay visible.
  const layers = useMemo(
    () =>
      (data ?? []).map((live, index) => ({
        live,
        index,
        color: routeColor(live.route.routeNumber),
      })),
    [data],
  );

  const buses: MapBus[] = useMemo(
    () =>
      layers.flatMap(({ live, color }) =>
        live.buses.map((b) => ({
          ...b,
          routeNumber: live.route.routeNumber,
          directionName: live.route.directionName,
          color,
        })),
      ),
    [layers],
  );

  // Draw the roads and stops once, when the first answer arrives.
  useEffect(() => {
    const map = mapRef.current;
    const group = roadLayerRef.current;
    if (!map || !group || layers.length === 0 || drawnRef.current) return;
    drawnRef.current = true;

    const all: L.LatLngExpression[] = [];

    for (const { live, index, color } of layers) {
      const weight = Math.max(3, 9 - index * 3);
      if (live.route.line.length > 1) {
        L.polyline(live.route.line, { color, weight, opacity: index === 0 ? 0.55 : 0.95 }).addTo(group);
        all.push(...live.route.line);
      }

      for (const s of live.stops) {
        if (s.lat === null || s.lng === null) continue;
        const isWait = s.stopId === stopId;
        const isDest = destIds.includes(s.stopId);
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: isWait || isDest ? 9 : 4,
          color: isWait || isDest ? '#1b1f24' : color,
          weight: isWait || isDest ? 3 : 2,
          fillColor: '#fff',
          fillOpacity: 1,
        }).addTo(group);
        marker.bindTooltip(s.placeName, { permanent: isWait || isDest, direction: 'top' });
      }
    }

    if (all.length > 0 && !fittedRef.current) {
      map.fitBounds(L.latLngBounds(all), { padding: [50, 50] });
      fittedRef.current = true;
    }
  }, [layers, stopId, destIds]);

  // Fit to the buses if there were no roads to fit to.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current || buses.length === 0) return;
    const pts = buses
      .filter((b) => b.position)
      .map((b) => [b.position!.lat, b.position!.lng] as L.LatLngExpression);
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [buses]);

  // Move the bus markers on every poll.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = new Set<number>();

    for (const bus of buses) {
      if (!bus.position) continue;
      current.add(bus.busId);
      const color = bus.fresh ? bus.color : STALE_COLOR;
      const icon = busIcon(color, bus.routeNumber);
      const latlng: L.LatLngExpression = [bus.position.lat, bus.position.lng];

      const existing = busMarkersRef.current.get(bus.busId);
      if (existing) {
        const start = existing.getLatLng();
        const end = L.latLng(latlng);
        const steps = 20;
        let step = 0;
        const latStep = (end.lat - start.lat) / steps;
        const lngStep = (end.lng - start.lng) / steps;
        const interval = setInterval(() => {
          step++;
          existing.setLatLng([start.lat + latStep * step, start.lng + lngStep * step]);
          if (step >= steps) clearInterval(interval);
        }, 50);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(latlng, { icon, zIndexOffset: 1000 })
          .addTo(map)
          .on('click', () => setSelectedId(bus.busId));
        busMarkersRef.current.set(bus.busId, marker);
      }
    }

    for (const [id, marker] of busMarkersRef.current) {
      if (!current.has(id)) {
        map.removeLayer(marker);
        busMarkersRef.current.delete(id);
      }
    }
  }, [buses]);

  const selected = buses.find((b) => b.busId === selectedId) ?? null;

  return (
    <div className="map-page">
      <button className="map-back-btn" onClick={() => navigate(-1)}>{t.back}</button>

      {layers.length > 0 && (
        <div className="map-legend">
          {layers.map(({ live, color }) => (
            <div className="map-legend-item" key={live.route.routeDirectionId}>
              <span className="map-legend-dot" style={{ background: color }} />
              <span>{live.route.routeNumber}</span>
              <span className="map-legend-dir">{live.route.directionName}</span>
            </div>
          ))}
        </div>
      )}

      {error && !data && (
        <div className="error-bar" style={{ margin: 16 }}>{error.message}</div>
      )}
      {error && data && (
        <div className="map-error-bar">{t.noConnection}</div>
      )}

      <div ref={mapContainerRef} className="map-container" />

      {data && buses.length === 0 && (
        <div className="map-empty-overlay">{t.noBusesOnRoute}</div>
      )}

      {selected && <BusSheet bus={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
