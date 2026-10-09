// controllers/shuttleController.js
import Shuttle from "../models/Shuttle.js";

// @desc    Register a new vehicle into the campus transit fleet
// @route   POST /api/v1/shuttles
export const registerShuttle = async (req, res) => {
  try {
    const { plateNumber, model, capacity } = req.body;

    if (!plateNumber) {
      return res.status(400).json({ message: 'plateNumber is required' });
    }

    const newShuttle = await Shuttle.create({
      plateNumber, // e.g., "ABU-SHL-04"
      model,
      capacity: capacity || 32,
      status: 'active'
    });

    res.status(201).json({ message: 'Shuttle vehicle cataloged successfully', shuttle: newShuttle });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A shuttle with that plate number already exists' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to register fleet asset' });
  }
};

// @desc    Get all vehicles in the catalog
// @route   GET /api/v1/shuttles
export const getAllShuttles = async (req, res) => {
  try {
    const shuttles = await Shuttle.find();
    res.json(shuttles);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch fleet catalog' });
  }
};

// @desc    Flip a vehicle between active service and maintenance hold
// @route   PATCH /api/v1/shuttles/:id/status
export const updateShuttleStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'maintenance'].includes(status)) {
      return res.status(400).json({ message: "status must be 'active' or 'maintenance'" });
    }

    const shuttle = await Shuttle.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!shuttle) {
      return res.status(404).json({ message: 'Shuttle not found' });
    }

    res.json({ message: 'Shuttle status updated', shuttle });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update shuttle status' });
  }
};
