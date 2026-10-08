import ScheduleSlot from '../models/ScheduleSlot.js';
import Route from '../models/Route.js';

/**
 * @route   GET /api/v1/transit/schedules
 * @desc    Fetch available timetable slots and operational loops (Public/Student)
 */
export const getScheduleSlots = async (req, res) => {
  try {
    let query = { isActive: true };

    // Optional Filter: Filter by day of the week if passed as a query param (e.g., ?day=mon)
    if (req.query.day) {
      query.recurringDays = req.query.day.toLowerCase();
    }

    // Optional Filter: Filter by scheduling type if passed (e.g., ?type=continuous)
    if (req.query.type) {
      query.schedulingType = req.query.type;
    }

    const slots = await ScheduleSlot.find(query)
      .populate('routeId', 'name direction stops') // Pulls full route and stop configurations
      .sort({ startTime: 1 })
      .lean();

    // Routes can be deleted/re-seeded during the dev lifecycle while orphaned
    // ScheduleSlot rows linger, so populate() yields null for those. Serving them
    // crashes the student dashboard — only return slots bound to a live route.
    const validSlots = slots.filter((s) => s.routeId && s.routeId._id);

    return res.status(200).json(validSlots);
  } catch (error) {
    return res.status(500).json({ 
      message: 'Error fetching transit schedule window configurations.', 
      error: error.message 
    });
  }
};

/**
 * @route   POST /api/v1/transit/schedules
 * @desc    Create a new operational window or fixed departure schedule (Admin Only)
 */
export const createScheduleSlot = async (req, res) => {
  try {
    const { 
      routeId, 
      recurringDays, 
      schedulingType, 
      startTime, 
      endTime, 
      departureTime, 
      estimatedFrequencyMinutes 
    } = req.body;

    // 1. Core structural validations
    if (!routeId || !recurringDays || !Array.isArray(recurringDays) || !startTime || !endTime) {
      return res.status(400).json({ 
        message: 'Route ID, an array of recurring days, start time, and end time are required.' 
      });
    }

    // 2. Validate enum constraints for days manually to throw a clean 400 error before database insertion
    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const hasInvalidDay = recurringDays.some(day => !validDays.includes(day.toLowerCase()));
    if (hasInvalidDay) {
      return res.status(400).json({ message: 'Invalid day string detected. Days must be: mon, tue, wed, thu, fri, sat, sun.' });
    }

    // 3. Conditional business logic validation based on schedulingType
    if (schedulingType === 'fixed' && !departureTime) {
      return res.status(400).json({ 
        message: "A precise 'departureTime' is mandatory when the scheduling type is configured as 'fixed'." 
      });
    }

    // 4. Verify the parent route exists in the system database
    const targetRoute = await Route.findById(routeId);
    if (!targetRoute) {
      return res.status(404).json({ message: 'The referenced transit route path does not exist.' });
    }

    // 5. Build and save the slot instance
    const newSlot = await ScheduleSlot.create({
      routeId,
      recurringDays: recurringDays.map(d => d.toLowerCase()),
      schedulingType: schedulingType || 'continuous',
      startTime,
      endTime,
      departureTime: schedulingType === 'fixed' ? departureTime : null,
      estimatedFrequencyMinutes: estimatedFrequencyMinutes !== undefined ? Number(estimatedFrequencyMinutes) : 15
    });

    return res.status(201).json(newSlot);
  } catch (error) {
    return res.status(500).json({ 
      message: 'Failed to instantiate schedule slot block.', 
      error: error.message 
    });
  }
};

/**
 * @route   PATCH /api/v1/transit/schedules/:id
 * @desc    Modify operational timing windows, frequencies, or toggle status (Admin Only)
 */
export const updateScheduleSlot = async (req, res) => {
  try {
    const { 
      recurringDays, 
      schedulingType, 
      startTime, 
      endTime, 
      departureTime, 
      estimatedFrequencyMinutes,
      isActive 
    } = req.body;

    const slot = await ScheduleSlot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Target schedule slot configuration not found.' });
    }

    // Process array days if updated
    if (recurringDays && Array.isArray(recurringDays)) {
      const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const hasInvalidDay = recurringDays.some(day => !validDays.includes(day.toLowerCase()));
      if (hasInvalidDay) {
        return res.status(400).json({ message: 'Invalid day string detected.' });
      }
      slot.recurringDays = recurringDays.map(d => d.toLowerCase());
    }

    // Evaluate structural type shifts (e.g. converting a continuous window into a single fixed time)
    if (schedulingType) {
      if (schedulingType === 'fixed' && !departureTime && !slot.departureTime) {
        return res.status(400).json({ message: "A 'departureTime' is required to switch this to a fixed schedule." });
      }
      slot.schedulingType = schedulingType;
    }

    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    
    if (departureTime) slot.departureTime = departureTime;
    if (estimatedFrequencyMinutes !== undefined) slot.estimatedFrequencyMinutes = Number(estimatedFrequencyMinutes);
    if (isActive !== undefined) slot.isActive = isActive;

    await slot.save();
    return res.status(200).json(slot);
  } catch (error) {
    return res.status(500).json({ 
      message: 'Failed to update schedule variables.', 
      error: error.message 
    });
  }
};

/**
 * @route   DELETE /api/v1/transit/schedules/:id
 * @desc    Permanently wipe a timetable loop block from service (Admin Only)
 */
export const deleteScheduleSlot = async (req, res) => {
  try {
    const slot = await ScheduleSlot.findByIdAndDelete(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Schedule reference not found.' });
    }
    return res.status(200).json({ message: 'Transit timetable schedule loop cleanly removed.' });
  } catch (error) {
    return res.status(500).json({ 
      message: 'Failed to delete schedule slot configuration.', 
      error: error.message 
    });
  }
};