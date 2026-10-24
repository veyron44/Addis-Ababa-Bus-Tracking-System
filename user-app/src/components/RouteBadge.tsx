import { routeColor } from '../lib/routeColors';

export default function RouteBadge({ route, grey }: { route: string; grey?: boolean }) {
  return (
    <div
      className="flex h-[46px] min-w-[46px] flex-none items-center justify-center rounded-[14px] border-2 border-ink px-2 text-lg font-bold text-white"
      style={{ background: grey ? '#8b95a3' : routeColor(route) }}
    >
      {route}
    </div>
  );
}
