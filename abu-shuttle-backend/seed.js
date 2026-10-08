import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

import User from './models/User.js';
import DriverProfile from './models/DriverProfile.js';
import Shuttle from './models/Shuttle.js';
import Route from './models/Route.js';
import Trip from './models/Trip.js';
import Reservation from './models/Reservation.js';
import Presence from './models/Presence.js';
import ScheduleSlot from './models/ScheduleSlot.js';
import { computeRoadProfile } from './utils/routing.js';

const seed = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  // ── Clean existing test data ──────────────────────────────────────
  const cleanCollections = async () => {
    // Order matters: child documents (trips/reservations) reference the users and
    // routes we are about to delete, which would otherwise leave orphaned rows that
    // populate() into null and render as "Unassigned" in the UI.
    const seededRoutes = await Route.find({ name: /Samaru|Kongo|Campus Loop|Shehu Idris/ });
    const seededRouteIds = seededRoutes.map((r) => r._id);
    await Promise.all([
      Reservation.deleteMany({}),
      Trip.deleteMany({}),
      Presence.deleteMany({}),
      ScheduleSlot.deleteMany({ routeId: { $in: seededRouteIds } }),
      User.deleteMany({ email: /admin@abu|driver@abu|@student/ }),
      DriverProfile.deleteMany({}),
      Shuttle.deleteMany({ plateNumber: /ABU-SHL/ }),
      Route.deleteMany({ _id: { $in: seededRouteIds } }),
    ]);
    console.log('Cleaned previous seed data\n');
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const hash = (pw) => bcrypt.hash(pw, 10);

  // ── Seed data ─────────────────────────────────────────────────────
  const seedAdmin = async () => {
    const existing = await User.findOne({ email: 'admin@abu.edu.ng' });
    if (existing) return existing;
    return User.create({
      name: 'System Admin',
      email: 'admin@abu.edu.ng',
      password: await hash('admin123'),
      role: 'admin',
    });
  };

  const seedDriver = async () => {
    const existing = await User.findOne({ email: 'driver@abu.edu.ng' });
    if (existing) {
      await DriverProfile.findOneAndUpdate(
        { userId: existing._id },
        { status: 'available', activeTripId: null, layoverRouteId: null, layoverShuttleId: null, currentLocation: { lat: null, lng: null }, locationUpdatedAt: null }
      );
      return existing;
    }
    const driverUser = await User.create({
      name: 'Ibrahim Musa',
      email: 'driver@abu.edu.ng',
      password: await hash('driver123'),
      role: 'driver',
    });
    await DriverProfile.create({
      userId: driverUser._id,
      licenseNumber: 'ABU-DRV-001',
      phoneNumber: '08030000001',
      status: 'available',
    });
    return driverUser;
  };

  const seedStudent = async () => {
    const existing = await User.findOne({ email: 'student@abu.edu.ng' });
    if (existing) return existing;
    return User.create({
      name: 'Aisha Bello',
      email: 'student@abu.edu.ng',
      password: await hash('student123'),
      role: 'student',
      studentId: 'U19CS1001',
    });
  };

  const seedSecondStudent = async () => {
    const existing = await User.findOne({ email: 'student2@abu.edu.ng' });
    if (existing) return existing;
    return User.create({
      name: 'Sani Abdullahi',
      email: 'student2@abu.edu.ng',
      password: await hash('student123'),
      role: 'student',
      studentId: 'U19CS1002',
    });
  };

  const seedShuttle = async () => {
    const existing = await Shuttle.findOne({ plateNumber: 'ABU-SHL-001' });
    if (existing) return existing;
    return Shuttle.create({
      plateNumber: 'ABU-SHL-001',
      model: 'Toyota Hiace',
      capacity: 14,
      status: 'active',
    });
  };

  const seedSmallShuttle = async () => {
    const existing = await Shuttle.findOne({ plateNumber: 'ABU-SHL-002' });
    if (existing) return existing;
    return Shuttle.create({
      plateNumber: 'ABU-SHL-002',
      model: 'Toyota Coaster',
      capacity: 1, // Tiny capacity to make waitlist easy to trigger
      status: 'active',
    });
  };

  // Itinerary: North Gate → Faculty of Engineering → Faculty of Environmental Design
  // → ICSA Hall → Aliko Dangote Hall → Shehu Idris Hostel (all in Samaru, Zaria).
  // Coordinates were supplied directly by the project owner from Google Maps, with the
  // campus-area caveats they flagged recorded in COORDINATES.md. These are authoritative
  // for this project — they supersede the earlier OSM/interpolated attempt.
  const seedRoute = async () => {
    const existing = await Route.findOne({ name: 'North Gate → Shehu Idris Link' });
    if (existing) return existing;

    const stops = [
      { index: 0, name: 'North Gate', lat: 11.1574538, lng: 7.6527229 },
      { index: 1, name: 'Faculty of Engineering', lat: 11.1523590, lng: 7.6501426 },
      { index: 2, name: 'Faculty of Environmental Design (garden)', lat: 11.1513796, lng: 7.6506793 },
      { index: 3, name: 'ICSA Hall (common room)', lat: 11.1495190, lng: 7.6487773 },
      { index: 4, name: 'Aliko Dangote Hall', lat: 11.1369371, lng: 7.6389611 },
      { index: 5, name: 'Shehu Idris Hostel', lat: 11.1385892, lng: 7.6378825 }
    ];

    // Measure each leg against the real road network so ETAs reflect the roads
    // the shuttle actually drives (crow-flies under-reports this loop badly —
    // see COORDINATES.md "Road routing").
    console.log('Measuring road profile via OSRM...');
    const roadSegments = await computeRoadProfile(stops);
    const roadMeters = roadSegments.reduce((sum, s) => sum + s.distanceMeters, 0);
    console.log(
      `  Road profile: ${(roadMeters / 1000).toFixed(2)} km over ${roadSegments.length} legs ` +
      `(${roadSegments.filter((s) => s.source === 'road').length}/${roadSegments.length} from OSRM)\n`
    );

    const forwardRoute = await Route.create({
      name: 'North Gate → Shehu Idris Link',
      direction: 'North Gate to Shehu Idris Link (westbound, Samaru Phase I → II)',
      distance: `${(roadMeters / 1000).toFixed(1)} km`,
      stops,
      roadSegments,
      roadProfileComputedAt: new Date(),
      isActive: true,
    });

    // Opposing direction — the auto-turnaround return leg. Same physical stops,
    // re-indexed 0..n-1 with their own road profile, linked to the forward pair
    // via reverseId so the terminus layover can chain straight onto it.
    console.log('Measuring reverse road profile via OSRM...');
    const reverseStops = [...stops]
      .sort((a, b) => b.index - a.index)
      .map((s, i) => ({ index: i, name: s.name, lat: s.lat, lng: s.lng }));
    const reverseRoadSegments = await computeRoadProfile(reverseStops);
    const reverseMeters = reverseRoadSegments.reduce((sum, s) => sum + s.distanceMeters, 0);
    console.log(`  Reverse road profile: ${(reverseMeters / 1000).toFixed(2)} km over ${reverseRoadSegments.length} legs`);

    const reverseRoute = await Route.create({
      name: 'Shehu Idris Hostel → North Gate Link',
      direction: 'Shehu Idris to North Gate (eastbound, Samaru Phase II → I)',
      distance: `${(reverseMeters / 1000).toFixed(1)} km`,
      stops: reverseStops,
      roadSegments: reverseRoadSegments,
      roadProfileComputedAt: new Date(),
      isActive: true,
      reverseId: forwardRoute._id,
    });

    forwardRoute.reverseId = reverseRoute._id;
    await forwardRoute.save();

    return [forwardRoute, reverseRoute];
  };

  // Operational windows so the student dashboard shows real timetables for both
  // directions after every reseed (schedule slots previously survived route
  // deletion as orgphans and were filtered out of the API).
  const seedScheduleSlots = async (forwardRoute, reverseRoute) => {
    const slotFor = (routeId) =>
      ScheduleSlot.create({
        routeId,
        recurringDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        schedulingType: 'continuous',
        startTime: '06:00',
        endTime: '21:00',
        departureTime: null,
        estimatedFrequencyMinutes: 15,
        isActive: true,
      });
    return Promise.all([slotFor(forwardRoute._id), slotFor(reverseRoute._id)]);
  };

  // ── Execute ───────────────────────────────────────────────────────
  await cleanCollections();

  const admin = await seedAdmin();
  console.log(`Admin:     ${admin.email} / admin123`);

  const driver = await seedDriver();
  console.log(`Driver:    driver@abu.edu.ng / driver123`);

  const student = await seedStudent();
  console.log(`Student:  student@abu.edu.ng / student123`);

  const student2 = await seedSecondStudent();
  console.log(`Student:  student2@abu.edu.ng / student123`);

  const shuttle = await seedShuttle();
  console.log(`Shuttle:   ${shuttle.plateNumber} (${shuttle.capacity} seats)`);

  const smallShuttle = await seedSmallShuttle();
  console.log(`Shuttle:   ${smallShuttle.plateNumber} (${smallShuttle.capacity} seat — waitlist test)`);

  const [route, reverseRoute] = await seedRoute();
  console.log(`Route:     ${route.name} (${route.stops.length} stops)`);
  console.log(`Reverse:   ${route.reverseId ? 'linked via reverseId' : 'missing'}`);

  await seedScheduleSlots(route, reverseRoute);
  console.log('Schedules: continuous 06:00-21:00 slots for both directions (every 15 min, Mon-Sat)');

  console.log('\n── Seed complete ──');
  console.log('\nUse these credentials to test:');
  console.log('  Student:  student@abu.edu.ng  / student123  →  /dashboard');
  console.log('  Student:  student2@abu.edu.ng / student123  →  /dashboard (waitlist)');
  console.log('  Driver:   driver@abu.edu.ng   / driver123   →  /driver');
  console.log('  Admin:    admin@abu.edu.ng    / admin123    →  /admin');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});