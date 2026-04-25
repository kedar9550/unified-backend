const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Import configurations and middlewares
const connectDB = require('./config/db/unifieddb');
const errorMiddleware = require('./middlewares/errorMiddleware');

// Load environment variables
dotenv.config();

// Initialize Database connection
connectDB();

const app = express();

// --- Security Middlewares ---

// 1. Helmet: Secure HTTP headers
app.use(helmet());

// 2. CORS: Cross-Origin Resource Sharing
const corsOptions = {
    origin: process.env.FRONTEND_URI || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use(cors(corsOptions));

// 3. Rate Limiting: Prevent Brute Force / DDoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// --- General Middlewares ---
app.use(logger('dev'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// --- Static Files (Profile Images) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Routes ---

// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/users', require('./modules/user/user.route'));
app.use('/api/academic-years', require('./modules/academicYear/academicYear.route'));
app.use('/api/feedback', require('./modules/feedback/feedback.route'));
app.use('/api/faculty-subject-results', require('./modules/FacultySubjectResult/FacultySubjectResult.route'));
app.use('/api/faculty-feedback-results', require('./modules/FacultyFeedbackResults/FacultyFeedbackResult.route'));
app.use('/api/discrepancies',           require('./modules/discrepancy/discrepancy.route'));
app.use('/api/dept-proctor',           require('./modules/ProcterMaping/ProcterMaping.route'));
app.use('/api/student-results',        require('./modules/StudentResult/StudentResult.route'));
app.use('/api/academics',               require('./modules/academics/academics.route'));
app.use('/api/roles',                   require('./modules/role/role.route'));
app.use('/api/student-data',          require('./modules/StudentData/Studentdata.route'));
app.use('/api/semester-types',        require('./modules/semesterType/semesterType.route'));

// --- Error Handling ---

// 404 Handler
app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

// Global Error Handler
app.use(errorMiddleware);

module.exports = app;
