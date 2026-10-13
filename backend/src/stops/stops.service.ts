import { searchStopRows } from './stops.repository';

const MAX_PLACES = 20;

type Stop = {
  id: number;
  side: string | null;
  location: [number, number]; // [longitude, latitude]
  serves: { routeNumber: string; directionName: string }[];
};

type Place = {
  placeName: string;
  placeNameAm: string | null;
  stops: Stop[];
};

export async function searchPlaces(text: string): Promise<Place[]> {
  const rows = await searchStopRows(text);

  const places = new Map<string, Place>();
  const stopsById = new Map<number, Stop>();

  for (const row of rows) {
    // Group by place name.
    let place = places.get(row.place_name);
    if (!place) {
      place = { placeName: row.place_name, placeNameAm: row.place_name_am, stops: [] };
      places.set(row.place_name, place);
    }
    if (!place.placeNameAm && row.place_name_am) place.placeNameAm = row.place_name_am;

    // One stop appears once, with all its routes collected under it.
    let stop = stopsById.get(row.id);
    if (!stop) {
      stop = {
        id: row.id,
        side: row.side,
        location: [Number(row.lng), Number(row.lat)],
        serves: [],
      };
      stopsById.set(row.id, stop);
      place.stops.push(stop);
    }
    if (row.route_number && row.direction_name) {
      stop.serves.push({ routeNumber: row.route_number, directionName: row.direction_name });
    }
  }

  return [...places.values()].slice(0, MAX_PLACES);
}