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

// @desc    Update the authenticated user's password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password change failed:', error.message);
    return res.status(500).json({ message: 'Server error while updating password.' });
  }
};