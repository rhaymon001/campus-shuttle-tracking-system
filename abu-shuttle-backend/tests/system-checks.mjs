import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, 'local-test-config.json');
const mode = process.argv[2] || 'regression';
const config = JSON.parse(await readFile(configPath, 'utf8'));
const apiBase = String(config.apiBase || '').replace(/\/$/, '');
const socketUrl = config.socketUrl;
const studentTokens = config.studentTokens || [];
const requiredCommon = ['driverToken'];
let tripId = config.tripId;
let routeId = config.routeId;
let scheduleSlotId = config.scheduleSlotId;
let scheduledFor = config.scheduledFor;
let boardingStop = config.boardingStop;
let destinationStop = config.destinationStop;
let gpsTrace = config.gpsTrace;

for (const key of requiredCommon) {
  assert.ok(config[key], `Set ${key} in tests/local-test-config.json`);
}
assert.ok(apiBase, 'Set apiBase in tests/local-test-config.json');
assert.ok(socketUrl, 'Set socketUrl in tests/local-test-config.json');
assert.ok(studentTokens.length >= 2, 'Provide at least two distinct studentTokens');

const tokenUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.id || payload.userId || payload.sub || payload.UserInfo?.userId;
  } catch {
    return null;
  }
};

const studentIds = studentTokens.map(tokenUserId);
assert.ok(studentIds.every(Boolean), 'Could not identify users from student tokens');
assert.equal(new Set(studentIds).size, studentIds.length, 'studentTokens must belong to distinct users');

async function request(endpoint, token, body) {
  const started = performance.now();
  const response = await fetch(`${apiBase}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { status: response.status, data, elapsedMs: performance.now() - started };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const idEquals = (left, right) => String(left) === String(right);

async function discoverFixtures() {
  const tripResponse = await request('/trips', studentTokens[0]);
  assert.equal(tripResponse.status, 200, `GET /trips returned ${tripResponse.status}`);
  const activeTrips = Array.isArray(tripResponse.data) ? tripResponse.data : [];
  const trip = activeTrips.find((item) =>
    item.status === 'active' && Number(item.seatsTotal) === 1 && Number(item.seatsCurrentOccupancy) === 0 &&
    (!config.tripId || idEquals(item._id, config.tripId)) &&
    (!config.routeId || idEquals(item.routeId?._id || item.routeId, config.routeId))
  );
  assert.ok(trip, 'API found no active, empty, capacity-one trip matching the optional config filters');
  tripId = String(trip._id);
  routeId = String(trip.routeId?._id || trip.routeId);
  const stops = [...(trip.routeId?.stops || [])].sort((a, b) => a.index - b.index);
  assert.ok(stops.length >= 2, 'The active test trip must have at least two ordered route stops');
  boardingStop ||= stops[0].name;
  destinationStop ||= stops.find((stop) => stop.index > stops.find((item) => item.name === boardingStop)?.index)?.name;
  assert.ok(boardingStop && destinationStop, 'Could not discover valid boarding and later destination stops');

  const scheduleResponse = await request('/transit/schedules', studentTokens[0]);
  assert.equal(scheduleResponse.status, 200, `GET /transit/schedules returned ${scheduleResponse.status}`);
  const matchingSlot = (scheduleResponse.data || []).find((slot) =>
    idEquals(slot.routeId?._id || slot.routeId, routeId) &&
    (!config.scheduleSlotId || idEquals(slot._id, config.scheduleSlotId))
  );
  assert.ok(matchingSlot, 'No active schedule slot was found for the selected trip route');
  scheduleSlotId = String(matchingSlot._id);
  scheduledFor ||= findDepartureWithinWindow(matchingSlot);
  assert.ok(scheduledFor, 'No departure time fits this schedule in the next 30 minutes; set scheduledFor manually in the local config');
  if (!gpsTrace) {
    const first = stops[0];
    const second = stops[1];
    gpsTrace = [0.08, 0.16, 0.24, 0.32, 0.40].map((fraction) => ({
      lat: first.lat + (second.lat - first.lat) * fraction,
      lng: first.lng + (second.lng - first.lng) * fraction
    }));
  }
}

function findDepartureWithinWindow(slot) {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const start = slot.startTime.split(':').map(Number);
  const end = slot.endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  for (let ahead = 2; ahead <= 29; ahead += 1) {
    const instant = new Date(Date.now() + ahead * 60000);
    const campusTime = new Date(instant.getTime() + 60 * 60000);
    const day = dayKeys[campusTime.getUTCDay()];
    const minute = campusTime.getUTCHours() * 60 + campusTime.getUTCMinutes();
    if (slot.recurringDays.includes(day) && minute >= startMinutes && minute <= endMinutes) {
      return instant.toISOString();
    }
  }
  return null;
}

async function assertFreshCapacityOneTrip() {
  const trips = await request('/trips', studentTokens[0]);
  assert.equal(trips.status, 200, `GET /trips returned ${trips.status}`);
  const trip = (Array.isArray(trips.data) ? trips.data : []).find((item) => idEquals(item._id, tripId));
  assert.ok(trip, 'The discovered trip is no longer active');
  assert.equal(Number(trip.seatsTotal), 1, 'The test trip must have capacity one');
  assert.equal(Number(trip.seatsCurrentOccupancy), 0, 'Use a fresh trip with zero onboard occupancy');

  const manifest = await request(`/trips/${tripId}/manifest`, config.driverToken);
  assert.equal(manifest.status, 200, `GET trip manifest returned ${manifest.status}`);
  const ownerTrip = await request('/trips/driver/active', config.driverToken);
  assert.equal(ownerTrip.status, 200, `GET driver active trip returned ${ownerTrip.status}: ${ownerTrip.data.message || 'no message'}`);
  assert.ok(idEquals(ownerTrip.data._id, tripId), 'The configured driver token does not own the discovered active trip');
  assert.equal(Number(manifest.data.onboard), 0, 'The test trip must start empty');
  const activeReservations = (manifest.data.perStop || []).reduce(
    (total, stop) => total + Number(stop.pendingBoarding || 0) + Number(stop.waitlisted || 0), 0
  );
  assert.equal(activeReservations, 0, 'The test trip must have no existing reservations');
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${socketUrl}/shuttle`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 7000
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Socket connection timed out'));
    }, 8000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(`Socket connection failed: ${error.message}`));
    });
  });
}

async function cancelBooking(token, reservationId) {
  if (!reservationId) return;
  const result = await request('/reservations/cancel', token, { reservationId });
  if (![200, 400, 404].includes(result.status)) {
    throw new Error(`Cleanup failed with HTTP ${result.status}`);
  }
}

async function runRegressionChecks() {
  assert.ok(config.otherDriverToken, 'Set otherDriverToken for the driver-ownership regression check');
  await discoverFixtures();
  assertFreshScheduledInputs();
  await assertFreshCapacityOneTrip();

  const created = [];
  const sockets = [];
  try {
    const raceResults = await Promise.all(studentTokens.slice(0, 2).map((token) =>
      request('/reservations/issue', token, {
        tripId,
        stopName: boardingStop,
        destStopName: destinationStop
      })
    ));
    for (let index = 0; index < raceResults.length; index += 1) {
      if (raceResults[index].data._id) {
        created.push({ token: studentTokens[index], reservationId: raceResults[index].data._id });
      }
    }
    for (const result of raceResults) {
      assert.equal(result.status, 201, `Concurrent booking returned HTTP ${result.status}`);
      assert.ok(result.data._id, 'Booking response did not include its reservation id');
    }

    const admitted = raceResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.data.waitlisted !== true);
    const waitlisted = raceResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.data.waitlisted === true)
      .sort((a, b) => Number(a.result.data.waitlistPosition) - Number(b.result.data.waitlistPosition));
    assert.equal(admitted.length, 1, `Expected one seat winner, received ${admitted.length}`);
    assert.equal(waitlisted.length, raceResults.length - 1, 'Every other request must be waitlisted');
    console.log(`Seat race: ${admitted.length} admitted, ${waitlisted.length} waitlisted; mean response ${(raceResults.reduce((sum, item) => sum + item.elapsedMs, 0) / raceResults.length).toFixed(1)} ms.`);

    for (const token of studentTokens) {
      const socket = await connectSocket(token);
      socket.emit('route:subscribe', { routeId });
      sockets.push(socket);
    }
    await sleep(250);

    const received = [];
    sockets.forEach((socket, index) => {
      socket.on('waitlist:promoted', (payload) => received.push({ index, payload }));
    });

    const seatHolder = admitted[0];
    const firstWaiter = waitlisted[0];
    const cancelResult = await request('/reservations/cancel', studentTokens[seatHolder.index], {
      reservationId: seatHolder.result.data._id
    });
    assert.equal(cancelResult.status, 200, `Cancel to open the seat returned HTTP ${cancelResult.status}`);

    const deadline = Date.now() + 5000;
    while (received.length === 0 && Date.now() < deadline) await sleep(50);
    await sleep(300);
    assert.equal(received.length, 1, `Expected one user-room promotion event, received ${received.length}`);
    assert.equal(received[0].index, firstWaiter.index, 'Waitlist code event reached the wrong student socket');
    assert.ok(idEquals(received[0].payload.reservationId, firstWaiter.result.data._id), 'Promotion event reservation did not match the first waitlisted booking');
    console.log('Room isolation: waitlist promotion reached only its intended student socket.');

    for (const item of created) await cancelBooking(item.token, item.reservationId);
    created.length = 0;

    const schedule = {
      scheduleSlotId,
      stopName: boardingStop,
      destStopName: destinationStop,
      scheduledFor
    };
    const scheduled = await request('/reservations/schedule', studentTokens[0], schedule);
    assert.equal(scheduled.status, 201, `Schedule booking returned HTTP ${scheduled.status}`);
    const scheduledId = scheduled.data._id;
    assert.ok(scheduledId, 'Schedule booking did not return an id');
    created.push({ token: studentTokens[0], reservationId: scheduledId });

    let scheduledPass = null;
    const confirmDeadline = Date.now() + 75000;
    while (Date.now() < confirmDeadline) {
      const list = await request('/reservations/scheduled', studentTokens[0]);
      assert.equal(list.status, 200, `GET scheduled bookings returned HTTP ${list.status}`);
      scheduledPass = (list.data || []).find((item) => idEquals(item._id, scheduledId));
      if (scheduledPass?.status === 'confirmed' && scheduledPass.confirmationCode) break;
      await sleep(2500);
    }
    assert.ok(scheduledPass?.status === 'confirmed' && scheduledPass.confirmationCode,
      'Scheduled booking did not become a confirmed pass within 75 seconds; check active route and cron status');

    const wrongDriver = await request('/reservations/confirm', config.otherDriverToken, {
      confirmationCode: scheduledPass.confirmationCode
    });
    assert.equal(wrongDriver.status, 403, `A different driver should receive 403, received ${wrongDriver.status}: ${wrongDriver.data.message || 'no message'}`);

    const boarding = await request('/reservations/confirm', config.driverToken, {
      confirmationCode: scheduledPass.confirmationCode
    });
    assert.equal(boarding.status, 200, `The owning driver should board the scheduled pass, received ${boarding.status}: ${boarding.data.message || 'no message'}`);
    const manifest = await request(`/trips/${tripId}/manifest`, config.driverToken);
    assert.equal(manifest.status, 200);
    assert.ok(Number(manifest.data.onboard) >= 1, 'Boarded scheduled passenger is missing from the manifest occupancy');
    console.log('Scheduled boarding: owner accepted; other driver rejected; manifest includes the boarded passenger.');
    console.log('Note: this test boards a passenger and changes trip occupancy; use a disposable development trip.');
  } finally {
    for (const socket of sockets) socket.close();
    for (const item of created) {
      try { await cancelBooking(item.token, item.reservationId); } catch (error) {
        console.error(`Waitlist cleanup warning: ${error.message}`);
      }
    }
  }
}

function assertFreshScheduledInputs() {
  const departure = new Date(scheduledFor);
  const aheadMinutes = (departure.getTime() - Date.now()) / 60000;
  assert.ok(Number.isFinite(departure.getTime()) && aheadMinutes > 0 && aheadMinutes <= 30,
    'scheduledFor must be within the next 30 minutes for automatic confirmation');
}

async function runLoadCheck() {
  await discoverFixtures();
  const fixes = gpsTrace.slice(0, 5);
  assert.ok(Array.isArray(fixes) && fixes.length >= 5,
    'Could not derive five GPS fixes from the route; set gpsTrace in tests/local-test-config.json');
  assert.ok(fixes.every((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lng)),
    'Every gpsTrace fix must have numeric lat and lng');
  assert.equal(new Set(fixes.map((fix) => `${fix.lat},${fix.lng}`)).size, fixes.length,
    'gpsTrace fixes must be distinct so received pings can be correlated');
  await assertFreshCapacityOneTrip();

  const sockets = [];
  let driverSocket;
  const created = [];
  const latencySamples = [];
  const reservationTimes = [];
  try {
    for (let index = 0; index < 50; index += 1) {
      const token = studentTokens[index % studentTokens.length];
      const socket = await connectSocket(token);
      socket.emit('route:subscribe', { routeId });
      sockets.push(socket);
    }
    driverSocket = await connectSocket(config.driverToken);
    await sleep(300);

    for (let fixIndex = 0; fixIndex < fixes.length; fixIndex += 1) {
      const fix = fixes[fixIndex];
      const started = performance.now();
      const deliveries = sockets.map((socket) => new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.off('server:eta_update', listener);
          resolve(value);
        };
        const listener = (payload) => {
          if (payload.lat === fix.lat && payload.lng === fix.lng) {
            finish(performance.now() - started);
          }
        };
        const timer = setTimeout(() => finish(null), 6000);
        socket.on('server:eta_update', listener);
      }));
      driverSocket.emit('driver:location', { tripId, lat: fix.lat, lng: fix.lng });
      const latencies = await Promise.all(deliveries);
      const delivered = latencies.filter((value) => value != null);
      assert.equal(delivered.length, 50, `GPS fix ${fixIndex + 1} reached ${delivered.length}/50 students`);
      latencySamples.push(...delivered);
      console.log(`GPS fix ${fixIndex + 1}: ${delivered.length}/50 clients received the update.`);
      if (fixIndex < fixes.length - 1) await sleep(2200);
    }

    let admitted = 0;
    const bookingRounds = 25;
    for (let round = 0; round < bookingRounds; round += 1) {
      const pair = studentTokens.slice(0, 2);
      const issued = await Promise.all(pair.map((token) =>
        request('/reservations/issue', token, { tripId, stopName: boardingStop, destStopName: destinationStop })
      ));
      reservationTimes.push(...issued.map((item) => item.elapsedMs));
      for (let index = 0; index < issued.length; index += 1) {
        if (issued[index].data._id) {
          created.push({ token: pair[index], reservationId: issued[index].data._id });
        }
        assert.equal(issued[index].status, 201, `Booking request returned HTTP ${issued[index].status}`);
        assert.ok(issued[index].data._id, 'Booking response did not include its reservation id');
      }
      const winners = issued.filter((item) => item.data.waitlisted !== true).length;
      assert.equal(winners, 1, `Race round ${round + 1} admitted ${winners} students instead of one`);
      admitted += winners;
      for (let index = 0; index < issued.length; index += 1) {
        await cancelBooking(pair[index], issued[index].data._id);
      }
      created.length = 0;
    }

    const summarize = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p50: sorted[Math.floor((sorted.length - 1) * 0.50)],
        p95: sorted[Math.floor((sorted.length - 1) * 0.95)]
      };
    };
    const latency = summarize(latencySamples);
    const reservation = summarize(reservationTimes);
    console.log(`WebSocket driver-to-client delivery: n=${latencySamples.length}, mean=${latency.mean.toFixed(2)} ms, p50=${latency.p50.toFixed(2)} ms, p95=${latency.p95.toFixed(2)} ms.`);
    console.log(`Reservation contention: n=${reservationTimes.length} requests across ${bookingRounds} two-student races, mean=${reservation.mean.toFixed(2)} ms, p50=${reservation.p50.toFixed(2)} ms, p95=${reservation.p95.toFixed(2)} ms; ${admitted} seat admitted per round.`);
    console.log('Note: 50 socket connections reuse the two student identities; this is connection-load, not 50 unique students.');
  } finally {
    if (driverSocket) driverSocket.close();
    for (const socket of sockets) socket.close();
    for (const item of created) {
      try { await cancelBooking(item.token, item.reservationId); } catch (error) {
        console.error(`Load-test cleanup warning: ${error.message}`);
      }
    }
  }
}

if (mode === 'regression') {
  await runRegressionChecks();
} else if (mode === 'load') {
  await runLoadCheck();
} else {
  throw new Error('Choose mode "regression" or "load".');
}
