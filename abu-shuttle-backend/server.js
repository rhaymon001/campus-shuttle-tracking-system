// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/dbConn.js';
import authRoutes from './routes/auth/auth.routes.js';
import corsOptions from './config/corsOptions.js';

// Initialize environment variables configuration
dotenv.config();

const PORT = process.env.PORT || 3500;

// Connect to DB
connectDB();

const app = express();

// Cross Origin Resource Sharing
app.use(cors(corsOptions));

// Built-in middleware for json
app.use(express.json());

// Routes 
app.use('/api/v1/auth', authRoutes);

// Fallback Route handler
app.get('/', (req, res) => res.send('ABU Shuttle Tracking API Server is Active.'));

// Open connection confirmation rule
mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
});

app.listen(PORT, () => console.log(`Server runtime context executing on port ${PORT}`));