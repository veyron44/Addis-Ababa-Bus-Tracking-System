// Runs every admin CRUD check against the running server and prints PASS or FAIL for each.
// Usage (the server must be running):
//   npx tsx src/scripts/test-admin-crud.ts <adminUsername> <adminPassword>
// It makes its own test vehicles and crew logins with a fresh name each run, so it can be rerun.
// Test vehicles and crew that got shifts stay in the database (history is never deleted).

export {}; // makes this file a module, so its names do not clash with other scripts

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

type Reply = { status: number; json: any };

async function http(method: string, path: string, token: string | null, body?: unknown): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '   -> ' + detail : ''}`);
}
const show = (r: Reply) => `HTTP ${r.status} ${JSON.stringify(r.json)}`;
function section(title: string) {
  console.log(`\n--- ${title} ---`);
}

async function main() {
  const [adminUser, adminPass] = process.argv.slice(2);
  if (!adminUser || !adminPass) {
    console.error('Usage: npx tsx src/scripts/test-admin-crud.ts <adminUsername> <adminPassword>');
    process.exitCode = 1;
    return;
  }

  // A different name every run.
  const sfx = Date.now().toString(36).slice(-6);
  const plateA = `TEST-${sfx}-A`.toUpperCase();
  const plateB = `TEST-${sfx}-B`.toUpperCase();
  const plateC = `TEST-${sfx}-C`.toUpperCase();
  const user1 = `t1${sfx}`;
  const user2 = `t2${sfx}`;
  const user3 = `t3${sfx}`;
  const PASS1 = 'testpass123';
  const PASS1_NEW = 'newpass12345';

  section('Admin login and the gate');
  const login = await http('POST', '/auth/admin/login', null, { username: adminUser, password: adminPass });
  if (login.status !== 200 || !login.json?.token) {
    console.error(`Admin login failed: ${show(login)}`);
    process.exitCode = 1;
    return;
  }
  const admin: string = login.json.token;
  check('1 admin login works', true);

  const noToken = await http('GET', '/admin/vehicles', null);
  check('2 no token is refused (401)', noToken.status === 401, show(noToken));
  const fakeToken = await http('GET', '/admin/vehicles', 'not-a-real-token');
  check('3 a made-up token is refused (401)', fakeToken.status === 401, show(fakeToken));

  const before = (await http('GET', '/admin/assignment-changes', admin)).json?.summary?.totalChanges;

  section('Vehicles');
  const vA = await http('POST', '/admin/vehicles', admin, { plate: plateA.toLowerCase() });
  check('4 create a vehicle (201, plate in capitals)', vA.status === 201 && vA.json?.vehicle?.plate === plateA, show(vA));
  const vAId: number = vA.json?.vehicle?.id;

  const dup = await http('POST', '/admin/vehicles', admin, { plate: plateA });
  check('5 same plate again: 409 plate_taken', dup.status === 409 && dup.json?.code === 'plate_taken', show(dup));

  const badPlate = await http('POST', '/admin/vehicles', admin, { plate: 'x' });
  check('6 plate "x" is refused (400)', badPlate.status === 400, show(badPlate));
  const noPlate = await http('POST', '/admin/vehicles', admin, {});
  check('7 no plate is refused (400)', noPlate.status === 400, show(noPlate));

  const vB = await http('POST', '/admin/vehicles', admin, { plate: plateB });
  const vBId: number = vB.json?.vehicle?.id;
  const vC = await http('POST', '/admin/vehicles', admin, { plate: plateC });
  const vCId: number = vC.json?.vehicle?.id;
  check('8 more vehicles created', vB.status === 201 && vC.status === 201, `${show(vB)} ${show(vC)}`);

  const rename = await http('PATCH', `/admin/vehicles/${vCId}`, admin, { plate: `${plateC}X` });
  check('9 rename a vehicle (200)', rename.status === 200 && rename.json?.vehicle?.plate === `${plateC}X`, show(rename));
  const renameClash = await http('PATCH', `/admin/vehicles/${vCId}`, admin, { plate: plateA });
  check('10 rename to a plate that exists: 409', renameClash.status === 409, show(renameClash));
  const renameUnknown = await http('PATCH', '/admin/vehicles/999999', admin, { plate: 'ZZ-9999' });
  check('11 rename an unknown vehicle: 404', renameUnknown.status === 404, show(renameUnknown));
  const badId = await http('PATCH', '/admin/vehicles/abc', admin, { plate: 'ZZ-9999' });
  check('12 a bad id is refused (400)', badId.status === 400, show(badId));

  const list = await http('GET', '/admin/vehicles', admin);
  const found = (list.json?.vehicles ?? []).find((v: any) => v.id === vAId);
  check('13 the list shows the vehicle with inUse and shiftCount', !!found && found.inUse === false && found.shiftCount === 0, show(list).slice(0, 200));

  const delC = await http('DELETE', `/admin/vehicles/${vCId}`, admin);
  check('14 delete a vehicle with no shifts (200)', delC.status === 200 && delC.json?.deleted === true, show(delC));
  const delC2 = await http('DELETE', `/admin/vehicles/${vCId}`, admin);
  check('15 delete it again: 404', delC2.status === 404, show(delC2));

  section('Crew logins');
  const d1 = await http('POST', '/admin/drivers', admin, { name: 'Test Crew One', username: user1, password: PASS1 });
  check('16 create a crew login (201)', d1.status === 201 && d1.json?.driver?.username === user1, show(d1));
  check('17 the answer has no password or hash', !/pass|hash/i.test(JSON.stringify(d1.json)), JSON.stringify(d1.json));
  const d1Id: number = d1.json?.driver?.id;

  const dupUser = await http('POST', '/admin/drivers', admin, { name: 'Test Crew One', username: user1, password: PASS1 });
  check('18 same username again: 409 username_taken', dupUser.status === 409 && dupUser.json?.code === 'username_taken', show(dupUser));
  const shortPw = await http('POST', '/admin/drivers', admin, { name: 'Short Pw', username: `x${sfx}`, password: 'short' });
  check('19 a short password is refused (400)', shortPw.status === 400, show(shortPw));
  const badUser = await http('POST', '/admin/drivers', admin, { name: 'Bad User', username: 'A B', password: PASS1 });
  check('20 a bad username is refused (400)', badUser.status === 400, show(badUser));
  const badName = await http('POST', '/admin/drivers', admin, { name: 'A', username: `y${sfx}`, password: PASS1 });
  check('21 a one-letter name is refused (400)', badName.status === 400, show(badName));

  const firstLogin = await http('POST', '/auth/driver/login', null, { username: user1, password: PASS1 });
  check('22 the new crew can log in (the hash works)', firstLogin.status === 200 && !!firstLogin.json?.token, show(firstLogin));
  const crew1OldToken: string = firstLogin.json?.token;

  const adminWithCrewToken = await http('GET', '/admin/vehicles', crew1OldToken);
  check('23 a crew token does not open admin data (401)', adminWithCrewToken.status === 401, show(adminWithCrewToken));

  const d2 = await http('POST', '/admin/drivers', admin, { name: 'Test Crew Two', username: user2, password: PASS1 });
  const d2Id: number = d2.json?.driver?.id;
  const d3 = await http('POST', '/admin/drivers', admin, { name: 'Test Crew Three', username: user3, password: PASS1 });
  const d3Id: number = d3.json?.driver?.id;
  check('24 two more crew created', d2.status === 201 && d3.status === 201, `${show(d2)} ${show(d3)}`);

  const dRename = await http('PATCH', `/admin/drivers/${d1Id}`, admin, { name: 'Renamed Crew' });
  check('25 rename a crew (200)', dRename.status === 200 && dRename.json?.driver?.name === 'Renamed Crew', show(dRename));
  const dList = await http('GET', '/admin/drivers', admin);
  check('26 the crew list has no password or hash', dList.status === 200 && !/hash/i.test(JSON.stringify(dList.json)), '');

  const reset = await http('POST', `/admin/drivers/${d1Id}/password`, admin, { password: PASS1_NEW });
  check('27 reset a password (200)', reset.status === 200 && reset.json?.reset === true, show(reset));
  const resetShort = await http('POST', `/admin/drivers/${d1Id}/password`, admin, { password: 'abc' });
  check('28 a short new password is refused (400)', resetShort.status === 400, show(resetShort));
  const resetUnknown = await http('POST', '/admin/drivers/999999/password', admin, { password: PASS1_NEW });
  check('29 reset for an unknown crew: 404', resetUnknown.status === 404, show(resetUnknown));

  const oldTokenNow = await http('GET', '/auth/me', crew1OldToken);
  check('30 the old session is closed (401)', oldTokenNow.status === 401, show(oldTokenNow));
  const oldPwLogin = await http('POST', '/auth/driver/login', null, { username: user1, password: PASS1 });
  check('31 the old password no longer works (401)', oldPwLogin.status === 401, show(oldPwLogin));
  const newPwLogin = await http('POST', '/auth/driver/login', null, { username: user1, password: PASS1_NEW });
  check('32 the new password works', newPwLogin.status === 200 && !!newPwLogin.json?.token, show(newPwLogin));
  const crew1: string = newPwLogin.json?.token;

  section('Shifts');
  const dirs = await http('GET', '/admin/route-directions', admin);
  const dirList: any[] = dirs.json?.directions ?? [];
  const dirA = dirList.find((d) => d.routeNumber === '61' && d.directionName === 'toward Legehar') ?? dirList[0];
  const dirB = dirList.find((d) => d.id !== dirA?.id);
  check('33 the list of route directions is there', dirs.status === 200 && !!dirA && !!dirB, show(dirs).slice(0, 200));
  if (!dirA || !dirB) {
    console.error('Cannot go on without two route directions.');
    process.exitCode = 1;
    return;
  }

  const s1 = await http('POST', '/admin/assignments', admin, { driverId: d1Id, vehicleId: vAId, routeDirectionId: dirA.id });
  check('34 create a shift (201, assigned, regular)',
    s1.status === 201 && s1.json?.assignment?.status === 'assigned' && s1.json?.assignment?.serviceType === 'regular', show(s1));
  const s1Id: number = s1.json?.assignment?.id;
  check('35 the shift shows the crew, vehicle and route',
    s1.json?.assignment?.crew?.username === user1 && s1.json?.assignment?.vehicle?.plate === plateA &&
      s1.json?.assignment?.route?.directionId === dirA.id, JSON.stringify(s1.json?.assignment));

  const busyDriver = await http('POST', '/admin/assignments', admin, { driverId: d1Id, vehicleId: vBId, routeDirectionId: dirA.id });
  check('36 the same crew twice: 409 driver_busy', busyDriver.status === 409 && busyDriver.json?.code === 'driver_busy', show(busyDriver));
  const busyVehicle = await http('POST', '/admin/assignments', admin, { driverId: d2Id, vehicleId: vAId, routeDirectionId: dirA.id });
  check('37 the same vehicle twice: 409 vehicle_busy', busyVehicle.status === 409 && busyVehicle.json?.code === 'vehicle_busy', show(busyVehicle));

  const unkV = await http('POST', '/admin/assignments', admin, { driverId: d2Id, vehicleId: 999999, routeDirectionId: dirA.id });
  check('38 unknown vehicle: 400 unknown_vehicle', unkV.status === 400 && unkV.json?.code === 'unknown_vehicle', show(unkV));
  const unkD = await http('POST', '/admin/assignments', admin, { driverId: 999999, vehicleId: vBId, routeDirectionId: dirA.id });
  check('39 unknown crew: 400 unknown_driver', unkD.status === 400 && unkD.json?.code === 'unknown_driver', show(unkD));
  const unkR = await http('POST', '/admin/assignments', admin, { driverId: d2Id, vehicleId: vBId, routeDirectionId: 999999 });
  check('40 unknown route direction: 400 unknown_direction', unkR.status === 400 && unkR.json?.code === 'unknown_direction', show(unkR));
  const missing = await http('POST', '/admin/assignments', admin, { driverId: d2Id });
  check('41 missing fields: 400', missing.status === 400, show(missing));
  const badType = await http('POST', '/admin/assignments', admin, { driverId: d2Id, vehicleId: vBId, routeDirectionId: dirA.id, serviceType: 'vip' });
  check('42 a made-up service type: 400', badType.status === 400, show(badType));

  const s2 = await http('POST', '/admin/assignments', admin, { driverId: d2Id, vehicleId: vBId, routeDirectionId: dirA.id, serviceType: 'premium' });
  check('43 a second shift with another crew and vehicle (premium)', s2.status === 201 && s2.json?.assignment?.serviceType === 'premium', show(s2));
  const s2Id: number = s2.json?.assignment?.id;

  const listUnfinished = await http('GET', '/admin/assignments', admin);
  const ids = (listUnfinished.json?.assignments ?? []).map((a: any) => a.id);
  check('44 the unfinished list has both shifts', ids.includes(s1Id) && ids.includes(s2Id), show(listUnfinished).slice(0, 200));
  const listEnded = await http('GET', '/admin/assignments?status=ended&limit=200', admin);
  const endedIds = (listEnded.json?.assignments ?? []).map((a: any) => a.id);
  check('45 the ended list does not have them', !endedIds.includes(s1Id) && !endedIds.includes(s2Id), '');
  const badFilter = await http('GET', '/admin/assignments?status=nonsense', admin);
  check('46 a bad status filter: 400', badFilter.status === 400, show(badFilter));

  const swapDriver = await http('PATCH', `/admin/assignments/${s2Id}`, admin, { driverId: d1Id });
  check('47 move a shift to a crew that is busy: 409', swapDriver.status === 409 && swapDriver.json?.code === 'driver_busy', show(swapDriver));
  const swapVehicle = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { vehicleId: vBId });
  check('48 move a shift to a vehicle that is busy: 409', swapVehicle.status === 409 && swapVehicle.json?.code === 'vehicle_busy', show(swapVehicle));
  const emptyPatch = await http('PATCH', `/admin/assignments/${s1Id}`, admin, {});
  check('49 an empty change: 400', emptyPatch.status === 400, show(emptyPatch));
  const unknownShift = await http('PATCH', '/admin/assignments/999999', admin, { serviceType: 'special' });
  check('50 an unknown shift: 404', unknownShift.status === 404, show(unknownShift));
  const badPatchType = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { serviceType: 'vip' });
  check('51 a made-up service type in a change: 400', badPatchType.status === 400, show(badPatchType));

  const toB = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { routeDirectionId: dirB.id });
  check('52 change the default route before the start (200)', toB.status === 200 && toB.json?.assignment?.route?.directionId === dirB.id, show(toB));
  const crewSees = await http('GET', '/assignments/current', crew1);
  check('53 the crew sees the route the admin set', crewSees.json?.assignment?.routeDirectionId === dirB.id, show(crewSees).slice(0, 200));
  const toSpecial = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { serviceType: 'special' });
  check('54 service type to special (200)', toSpecial.status === 200 && toSpecial.json?.assignment?.serviceType === 'special', show(toSpecial));
  const backRegular = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { serviceType: 'regular' });
  check('55 and back to regular (200)', backRegular.status === 200 && backRegular.json?.assignment?.serviceType === 'regular', show(backRegular));

  section('After the crew starts');
  const start = await http('POST', '/assignments/start', crew1);
  check('56 the crew starts the shift', start.status === 200, show(start));
  const routeAfterStart = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { routeDirectionId: dirA.id });
  check('57 changing the route after the start: 409 already_started',
    routeAfterStart.status === 409 && routeAfterStart.json?.code === 'already_started', show(routeAfterStart));
  const typeAfterStart = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { serviceType: 'premium' });
  check('58 the service type can still change (200)', typeAfterStart.status === 200 && typeAfterStart.json?.assignment?.serviceType === 'premium', show(typeAfterStart));

  const liveAll = await http('GET', '/admin/live-all', admin);
  const inLive = (liveAll.json?.buses ?? []).find((b: any) => b.busId === s1Id);
  check('59 the running shift is on the admin fleet map, hidden from riders (premium)', !!inLive && inLive.shownToRiders === false, show(liveAll).slice(0, 200));

  section('Ending shifts');
  const end1 = await http('POST', `/admin/assignments/${s1Id}/end`, admin);
  check('60 end a running shift (200, ended, has an end time)',
    end1.status === 200 && end1.json?.assignment?.status === 'ended' && !!end1.json?.assignment?.endedAt, show(end1));
  const end1Again = await http('POST', `/admin/assignments/${s1Id}/end`, admin);
  check('61 end it again: 409 already_ended', end1Again.status === 409 && end1Again.json?.code === 'already_ended', show(end1Again));
  const patchEnded = await http('PATCH', `/admin/assignments/${s1Id}`, admin, { serviceType: 'regular' });
  check('62 change an ended shift: 409 ended', patchEnded.status === 409 && patchEnded.json?.code === 'ended', show(patchEnded));
  const endUnknown = await http('POST', '/admin/assignments/999999/end', admin);
  check('63 end an unknown shift: 404', endUnknown.status === 404, show(endUnknown));
  const crewNoShift = await http('GET', '/assignments/current', crew1);
  check('64 the crew now has no shift (404)', crewNoShift.status === 404, show(crewNoShift));
  const cancel2 = await http('POST', `/admin/assignments/${s2Id}/end`, admin);
  check('65 cancel a shift that never started (200)', cancel2.status === 200 && cancel2.json?.assignment?.status === 'ended', show(cancel2));

  section('Deleting and the crew-override log');
  const delVehicleWithShifts = await http('DELETE', `/admin/vehicles/${vAId}`, admin);
  check('66 a vehicle with shifts cannot be deleted (409)', delVehicleWithShifts.status === 409 && delVehicleWithShifts.json?.code === 'has_shifts', show(delVehicleWithShifts));
  const delDriverWithShifts = await http('DELETE', `/admin/drivers/${d1Id}`, admin);
  check('67 a crew with shifts cannot be deleted (409)', delDriverWithShifts.status === 409 && delDriverWithShifts.json?.code === 'has_shifts', show(delDriverWithShifts));
  const delDriverFree = await http('DELETE', `/admin/drivers/${d3Id}`, admin);
  check('68 a crew with no shifts can be deleted (200)', delDriverFree.status === 200 && delDriverFree.json?.deleted === true, show(delDriverFree));
  const delDriverAgain = await http('DELETE', `/admin/drivers/${d3Id}`, admin);
  check('69 delete it again: 404', delDriverAgain.status === 404, show(delDriverAgain));

  const after = (await http('GET', '/admin/assignment-changes', admin)).json?.summary?.totalChanges;
  check('70 admin changes were NOT written to the crew-override log', before !== undefined && before === after, `before ${before}, after ${after}`);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('The test run stopped:', err);
  process.exitCode = 1;
});
