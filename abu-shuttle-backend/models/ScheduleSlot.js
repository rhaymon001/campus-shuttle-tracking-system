import mongoose from "mongoose";

const ScheduleSlotSchema = new mongoose.Schema({
  routeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Route', 
    required: true 
  },
  // Still critical: Shuttles might not run on Sundays, or have shorter Saturday windows
  recurringDays: { 
    type: [String], 
    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    required: true 
  },
  // Switch from a single departure point to an operational window
  schedulingType: {
    type: String,
    enum: ['continuous', 'fixed'],
    default: 'continuous'
  },
  // For 'continuous' modes, these define the service window (e.g., 06:00 to 18:30)
  startTime: { type: String, required: true }, 
  endTime: { type: String, required: true },
  
  // For 'fixed' modes (optional, defaults to null for continuous loops)
  departureTime: { type: String, default: null }, 
  
  // High value addition for sunrise/sunset loops
  estimatedFrequencyMinutes: { type: Number, default: 15 }, 
  isActive: { type: Boolean, default: true }
});

const scheduleSlot = mongoose.model('ScheduleSlot', ScheduleSlotSchema);
export default scheduleSlot;