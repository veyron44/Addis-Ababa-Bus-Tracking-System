import { Outlet, useLocation } from 'react-router-dom';
import { TripProvider, useTrip } from '../lib/trip';
import BottomNav from './BottomNav';
import Header from './Header';
import MapView from './MapView';
import Planner from './Planner';
import ResultsSheet from './ResultsSheet';

function Shell() {
  const { pathname } = useLocation();
  const { searched } = useTrip();
  const onStops = pathname.startsWith('/stops');

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-sand">
      <Header>{!onStops && <Planner />}</Header>
      <MapView />
      {!onStops && searched && <ResultsSheet />}
      {onStops && (
        <div className="absolute inset-x-0 bottom-0 top-[53px] z-20 overflow-y-auto bg-sand pb-[110px] pt-[44px]">
          <Outlet />
        </div>
      )}
      <BottomNav onStops={onStops} />
    </div>
  );
}

export default function Layout() {
  return (
    <TripProvider>
      <Shell />
    </TripProvider>
  );
}
