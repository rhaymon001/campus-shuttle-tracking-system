// controllers/adminController.js
import User from '../models/User.js';
import DriverProfile from '../models/DriverProfile.js';
import bcrypt from 'bcryptjs';

// @desc    Admin provisions a new campus shuttle driver and mounts their profile tracker
// @route   POST /api/v1/admin/drivers
export const onboardNewDriver = async (req, res) => {
  try {
    const { email, password, name, licenseNumber, phoneNumber } = req.body;

    // 1. Check if the user credential already exists
    const duplicate = await User.findOne({ email }).lean().exec();
    if (duplicate) return res.status(409).json({ message: 'Email already registered' });

    // 2. Hash the password for safety
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create core authentication profile explicitly assigned as a 'driver'
    const newDriverUser = await User.create({
      email,
      password: hashedPassword,
      name,
      role: 'driver' // Hardcoded here so no one can manipulate roles from the frontend
    });

    // 4. Create the corresponding tracking profile using the newly generated userId
    const newProfile = await DriverProfile.create({
      userId: newDriverUser._id,
      licenseNumber,
      phoneNumber,
      status: 'available', // Ready to start a trip loop
      activeTripId: null
    });

    res.status(201).json({
      message: `Driver account for ${name} provisioned successfully.`,
      driverId: newDriverUser._id,
      profileId: newProfile._id
    });

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal driver provisioning breakdown', error: err.message });
  }
};

// @desc    Admin reviews the full driver roster with live status flags
// @route   GET /api/v1/admin/drivers
export const getAllDrivers = async (req, res) => {
  try {
    const drivers = await DriverProfile.find()
      .populate('userId', 'name email')
      .populate('assignedShuttleId', 'plateNumber')
      .sort({ createdAt: -1 });

    res.json(drivers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch driver roster' });
  }
};