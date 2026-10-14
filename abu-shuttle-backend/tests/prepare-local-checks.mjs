import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, 'local-test-config.json');
const apiBase = process.argv[2] || 'http://127.0.0.1:5000/api/v1';
const origin = new URL(apiBase).origin;
const readExistingConfig = async () => {
  try { return JSON.parse(await readFile(configPath, 'utf8')); }
  catch { return {}; }
};
let config = await readExistingConfig();

async function request(endpoint, { token, body, method } = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(`${endpoint} failed with HTTP ${response.status}`);
  return data;
}

async function login(email, password) {
  const result = await request('/auth/login', { body: { email, password } });
  if (!result.token) throw new Error('Login succeeded without an access token');
  return result.token;
}

const adminToken = await login('admin@abu.edu.ng', 'admin123');
const [seedDriverToken, studentToken1, studentToken2] = await Promise.all([
  login('driver@abu.edu.ng', 'driver123'),
  login('student@abu.edu.ng', 'student123'),
  login('student2@abu.edu.ng', 'student123')
]);

const activeTripsBeforeSetup = await request('/trips', { token: studentToken1 });
for (const activeTrip of activeTripsBeforeSetup) {
  if (activeTrip.driverId?.name !== 'Temporary Shuttle Test Driver') continue;
  await request(`/trips/${activeTrip._id}/force-end`, {
    token: adminToken,
    method: 'PATCH'
  });
}

const suffix = randomUUID().slice(0, 8);
const testDriver = {
  email: `shuttle-check-${suffix}@abu.edu.ng`,
  password: randomBytes(24).toString('base64url'),
  name: 'Temporary Shuttle Test Driver',
  licenseNumber: `TEST-${suffix}`,
  phoneNumber: `TEST-${suffix}`
};
const driverResult = await request('/admin/drivers', { token: adminToken, body: testDriver });
if (!driverResult.driverId) throw new Error('Admin API did not return the provisioned test driver ID');
const testDriverToken = await login(testDriver.email, testDriver.password);

const routes = await request('/transit/routes');
const route = routes.find((item) => Array.isArray(item.stops) && item.stops.length >= 2);
if (!route) throw new Error('No active route with at least two stops was returned by the API');
const shuttleResult = await request('/shuttles', {
  token: adminToken,
  body: {
    plateNumber: `TEST-SHL-${suffix}`,
    model: 'Temporary Regression Shuttle',
    capacity: 1
  }
});
const shuttle = shuttleResult.shuttle;
if (!shuttle?._id) throw new Error('Admin API did not return the temporary capacity-one shuttle');
const scheduleResponse = await request('/transit/schedules');
let schedule = scheduleResponse.find((item) => String(item.routeId?._id || item.routeId) === String(route._id));
if (!schedule) {
  schedule = await request('/transit/schedules', {
    token: adminToken,
    body: {
      routeId: route._id,
      recurringDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      schedulingType: 'continuous',
      startTime: '00:00',
      endTime: '23:59',
      estimatedFrequencyMinutes: 15
    }
  });
  if (!schedule?._id) throw new Error('Could not create a test schedule for the selected route');
}

const started = await request('/trips/start', {
  token: testDriverToken,
  body: { shuttleId: shuttle._id, routeId: route._id }
});
const trip = started.trip;
if (!trip?._id) throw new Error('Trip start did not return an active trip ID');

config = {
  ...config,
  apiBase,
  socketUrl: origin,
  tripId: String(trip._id),
  routeId: String(route._id),
  scheduleSlotId: String(schedule._id),
  testDriver,
  testDriverId: String(driverResult.driverId),
  testShuttleId: String(shuttle._id),
  boardingStop: route.stops.slice().sort((a, b) => a.index - b.index)[0].name,
  destinationStop: route.stops.slice().sort((a, b) => a.index - b.index)[1].name,
  driverToken: testDriverToken,
  otherDriverToken: seedDriverToken,
  studentTokens: [studentToken1, studentToken2],
  scheduledFor: undefined,
  gpsTrace: undefined
};
await writeFile(configPath, JSON.stringify(config, null, 2));
console.log(`Local test config prepared. Active trip: ${trip._id}; route: ${route.name}; schedule: ${schedule._id}. Tokens were written locally and were not printed.`);
console.log('A unique test driver and capacity-one shuttle were provisioned through the admin API. Test records remain in the development database after testing.');
