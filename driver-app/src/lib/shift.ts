// rules about a shift

export type ShiftStatus = 'assigned' | 'on_trip' | 'at_terminal' | 'ended';

export type CrowdingCode = 'seats_available' | 'standing_only' | 'full' | 'not_reported';

// The backend only lets the crew change the route before Start or at a terminal.
export function canChangeRoute(status: ShiftStatus): boolean {
  return status === 'assigned' || status === 'at_terminal';
}

// Start is offered only for a shift that has not started.
export function canStart(status: ShiftStatus): boolean {
  return status === 'assigned';
}

// A started shift (on the road or at a terminal) belongs on the Running screen.
export function isRunning(status: ShiftStatus): boolean {
  return status === 'on_trip' || status === 'at_terminal';
}

// At the terminal: show Departing now and Start return trip buttons.
export function isAtTerminal(status: ShiftStatus): boolean {
  return status === 'at_terminal';
}

// Short text for the status chip.
export function statusLabel(status: ShiftStatus): string {
  if (status === 'assigned') return 'Not started';
  if (status === 'on_trip') return 'On the road';
  if (status === 'at_terminal') return 'At the terminal';
  return 'Ended';
}
