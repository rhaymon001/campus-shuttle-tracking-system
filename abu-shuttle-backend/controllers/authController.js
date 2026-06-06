import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// @desc    Self-registration for students only 
export const registerStudent = async (expressReq, expressRes) => {
    try {
        const { name, email, password, studentId, phone } = expressReq.body;

        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return expressRes.status(400).json({ message: 'User already registered with this email.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newStudent = new User({
            name,
            email,
            passwordHash,
            role: 'student',
            studentId,
            phone
        });

        await newStudent.save();
        expressRes.status(201).json({ message: 'Student registration successful. You can now login.' });

    } catch (err) {
        console.error(err.message);
        expressRes.status(500).send('Server Error during registration');
    }
};

// @desc    Authenticate user (All Roles) & return JWT token 
export const loginUser = async (expressReq, expressRes) => {
    try {
        const { email, password } = expressReq.body;

        const user = await User.findOne({ email });
        if (!user || !user.isActive) {
            return expressRes.status(400).json({ message: 'Invalid credentials or inactive account.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return expressRes.status(400).json({ message: 'Invalid credentials.' });
        }

        const payload = {
            user: {
                id: user._id,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                expressRes.json({
                    token,
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                });
            }
        );

    } catch (err) {
        console.error(err.message);
        expressRes.status(500).send('Server Error during authentication login');
    }
};