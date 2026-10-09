// server.js
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/dbConn.js';
import corsOptions from './config/corsOptions.js';
import apiRouter from './routes/index.js';
import { initSocket } from './socket/index.js';
import initCronJobs from './utils/cronJobs.js';

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
// app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', apiRouter);

// Fallback Route handler
app.get('/', (req, res) => res.send('ABU Shuttle Tracking API Server is Active.'));

// Wrap Express in a raw HTTP server so Socket.IO can share the port
const server = http.createServer(app);
initSocket(server);
initCronJobs();

// Open connection confirmation rule
mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
});