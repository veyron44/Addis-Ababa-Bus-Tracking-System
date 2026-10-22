// Plain rules about a shift, kept apart from the screens so they can be tested.

export type ShiftStatus = 'assigned' | 'on_trip' | 'at_terminal' | 'ended';

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

// Short text for the status chip.
export function statusLabel(status: ShiftStatus): string {
  if (status === 'assigned') return 'Not started';
  if (status === 'on_trip') return 'On the road';
  if (status === 'at_terminal') return 'At the terminal';
  return 'Ended';
}
