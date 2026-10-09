// controllers/transitController.js
import Route from '../models/Route.js';
import { computeRoadProfile } from '../utils/routing.js';

/**
 * @route   GET /api/v1/transit/routes
 * @desc    Fetch active transit pathways (Student/Public)
 */
export const getAllRoutes = async (req, res) => {
  try {
    // Only return routes that are active, sorted alphabetically by name
    const routes = await Route.find({ isActive: true }).sort({ name: 1 });
    return res.status(200).json(routes);
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error retrieving route metrics.', 
      error: error.message 
    });
  }
};

/**
 * @route   POST /api/v1/transit/routes
 * @desc    Instantiate a new route with coordinates and distances (Admin Only)
 */
export const createRoute = async (req, res) => {
  try {
    const { name, direction, stops, distance } = req.body;

    if (!name || !direction || !Array.isArray(stops) || !distance) {
      return res.status(400).json({ 
        message: 'Name, direction, distance, and structured stops array are all mandatory fields.' 
      });
    }

    // Ensure stops are sequentially indexed correctly for tracking calculations
    const parsedStops = stops.map((stop, idx) => ({
      index: stop.index !== undefined ? Number(stop.index) : idx,
      name: stop.name.trim(),
      lat: Number(stop.lat),
      lng: Number(stop.lng)
    })).sort((a, b) => a.index - b.index);

    // Measure real road distance for every stop-to-stop leg so live ETAs track
    // the road network instead of crow-flies. Best effort: if the router is down
    // we keep straight-line legs and the ETA layer degrades gracefully.
    let roadSegments = [];
    let roadProfileComputedAt = null;
    try {
      roadSegments = await computeRoadProfile(parsedStops);
      roadProfileComputedAt = new Date();
    } catch (err) {
      console.warn('Road profile unavailable for new route:', err.message);
    }

    const newRoute = await Route.create({
      name: name.trim(),
      direction: direction.trim(),
      distance: distance.trim(),
      stops: parsedStops,
      roadSegments,
      roadProfileComputedAt,
      activeBuses: 0 // Defaults to 0 until a live trip commences
    });

    // Auto-generate the opposing direction as a linked pair. The loop is
    // bidirectional in practice, so the student side simply subscribes to the
    // reverse route's feed — no driver "turn around" button needed anywhere.
    try {
      const reverseStops = [...parsedStops]
        .sort((a, b) => b.index - a.index)
        .map((s, i) => ({ index: i, name: s.name, lat: s.lat, lng: s.lng }));

      let reverseSegments = [];
      try {
        reverseSegments = await computeRoadProfile(reverseStops);
      } catch (err2) {
        console.warn('Reverse road profile unavailable:', err2.message);
      }

      const reverse = await Route.create({
        name: reverseNameFor(name.trim()),
        direction: reverseDirectionFor(reverseStops),
        distance: distance.trim(),
        stops: reverseStops,
        roadSegments: reverseSegments,
        roadProfileComputedAt: reverseSegments.length ? new Date() : null,
        activeBuses: 0,
        isActive: true,
        reverseId: newRoute._id
      });

      newRoute.reverseId = reverse._id;
      await newRoute.save();

      return res.status(201).json({
        ...newRoute.toObject(),
        reverse
      });
    } catch (reverseErr) {
      console.warn('Reverse route auto-generation failed:', reverseErr.message);
      return res.status(201).json(newRoute);
    }
  } catch (error) {
    return res.status(500).json({ 
      message: 'Failed to save route configuration.', 
      error: error.message 
    });
  }
};

// Swap a "A → B" name so the paired route reads "B → A"; anything else just gets
// a "(reverse direction)" suffix so the pair stays visually distinguishable.
const reverseNameFor = (name) => {
  const match = name.match(/^\s*(.+?)\s*(?:→|⇢|->|>)\s*(.+?)\s*$/);
  if (match) return `${match[2].trim()} → ${match[1].trim()}`;
  return `${name} (reverse direction)`;
};

const reverseDirectionFor = (reverseStops) => {
  const first = reverseStops[0]?.name || '';
  const last = reverseStops[reverseStops.length - 1]?.name || '';
  return `${last} to ${first}`;
};

/**
 * @route   GET /api/v1/transit/routes/:id
 * @desc    Fetch single route details
 */
export const getRouteById = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ message: 'Route not found.' });
    }
    return res.status(200).json(route);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching route.', error: error.message });
  }
};