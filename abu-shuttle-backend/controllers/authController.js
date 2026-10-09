import User from '../models/User.js';
import DriverProfile from '../models/DriverProfile.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// @desc    Register a new student account (Self-registration)
export const registerStudent = async (req, res) => {
  try {
    const { name, email, studentId, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already registered' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await User.create({
      name, email, studentId, phone, password: passwordHash, role: 'student'
    });

    res.status(201).json({ message: 'Registration successful. Account active.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during student registry' });
  }
};

// @desc    Unified login portal for Students, Drivers, and Admins
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials or inactive account' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    // ✅ Match: Generate token with exactly 'id' and 'role' to fit your verifyJWT requirements
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, // ✅ Swapped to match your middleware verification secret
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, role: user.role }
    });
  
  } catch (err) {
    console.log(err)
    res.status(500).json({ message: 'Login server breakdown error' });
  }
};