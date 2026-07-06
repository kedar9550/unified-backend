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
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

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
    max: 1000, // Increased for development/intensive dashboard use
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// 3b. Dedicated rate limiter for sensitive authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // max 20 attempts
    message: 'Too many login or OTP attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/employees/login', authLimiter);

// --- General Middlewares ---
app.use(logger('dev'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// NoSQL injection protection middleware
const mongoSanitize = require('./middlewares/mongoSanitize');
app.use(mongoSanitize);

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
app.use('/api/auth', require('./modules/auth/auth.route'));
app.use('/api/employees', require('./modules/employee/employee.route'));
app.use('/api/academic-years', require('./modules/academicYear/academicYear.route'));
app.use('/api/faculty-subject-results', require('./modules/FacultySubjectResult/FacultySubjectResult.route'));
app.use('/api/faculty-feedback-results', require('./modules/FacultyFeedbackResults/FacultyFeedbackResult.route'));
app.use('/api/discrepancies', require('./modules/discrepancy/discrepancy.route'));
app.use('/api/dept-proctor', require('./modules/ProctorMapping/ProctorMapping.route'));
app.use('/api/student-results', require('./modules/StudentResult/StudentResult.route'));
app.use('/api/academics', require('./modules/academics/academics.route'));
app.use('/api/roles', require('./modules/role/role.route'));
app.use('/api/student-data', require('./modules/StudentData/Studentdata.route'));
app.use('/api/semester-types', require('./modules/semesterType/semesterType.route'));
app.use('/api/dashboard', require('./modules/dashboard/dashboard.route'));
app.use('/api/reference-journals', require('./modules/ReferenceJournal/ReferenceJournal.route'));
app.use('/api/journal-impact-factors', require('./modules/JournalImpactFactor/JournalImpactFactor.route'));
app.use('/api/journal-masters', require('./modules/JournalMaster/JournalMaster.route'));
app.use('/api/author-citations', require('./modules/AuthorCitations/AuthorCitations.route'));
app.use('/api/research/textbook', require('./modules/Textbook/Textbook.router'));
app.use('/api/research/book-chapter', require('./modules/BookChapter/BookChapter.router'));
app.use('/api/research/journal', require('./modules/Journal/Journal.router'));
app.use('/api/research/patent', require('./modules/Patent/Patent.router'));
app.use('/api/research/funded-project', require('./modules/FundedProject/FundedProject.router'));
app.use('/api/research/consultancy', require('./modules/Consultancy/Consultancy.router'));
app.use('/api/research/conference', require('./modules/Conference/Conference.router'));
app.use('/api/research/phd-scholar', require('./modules/PhdScholar/PhdScholar.router'));
app.use('/api/research/novel-product', require('./modules/NovelProduct/NovelProduct.router'));
app.use('/api/sdgs', require('./modules/SDG/sdg.route'));
app.use('/api/publishers', require('./modules/Publisher/Publisher.router'));
app.use('/api/hod/research-requests', require('./modules/researchApproval/researchApproval.route'));
app.use('/api/faculty-proctoring', require('./modules/FacultyProctoringEntry/FacultyProctoringEntry.route'));
app.use('/api/faculty-administration', require('./modules/FacultyAdministration/FacultyAdministration.route'));
app.use('/api/value-addition/resource-utilization', require('./modules/ResourceUtilization/ResourceUtilization.router'));
app.use('/api/value-addition/contribution', require('./modules/Contribution/Contribution.router'));
app.use('/api/appraisal', require('./modules/Appraisal/Appraisal.route'));
app.use('/api/leadership-roles', require('./modules/leadershipRole/leadershipRole.route'));
app.use('/api/notifications', require('./modules/notification/notification.routes'));
app.use('/api/utilities', require('./modules/utilities/utilities.route'));

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
