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

// Trust reverse proxy (e.g., Nginx, ALB) to correctly parse X-Forwarded-For headers.
// This ensures rate limiting uses the actual client's IP instead of the proxy's IP.
app.set('trust proxy', 1);

// --- Security Middlewares ---

// 1. Helmet: Secure HTTP headers
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    frameguard: false,
}));

// 2. CORS: Cross-Origin Resource Sharing
const { corsOptions } = require('./config/cors');
app.use(cors(corsOptions));

// 3. Rate Limiting: Prevent Brute Force / DDoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Increased for enterprise usage with 10,000+ employees
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// 3b. Dedicated rate limiter for sensitive authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // High enough to support campus NAT networks where many users share one IP
    message: 'Too many login or OTP attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/employees/login', authLimiter);

// --- General Middlewares ---
app.use(logger('dev'));
// Conditionally apply body parser limits: 50mb for PDF generation, 10kb for everything else
app.use((req, res, next) => {
    if (req.path === '/api/appraisal/generate-pdf') {
        express.json({ limit: '50mb' })(req, res, next);
    } else {
        express.json({ limit: '10kb' })(req, res, next);
    }
});
app.use((req, res, next) => {
    if (req.path === '/api/appraisal/generate-pdf') {
        express.urlencoded({ extended: false, limit: '50mb' })(req, res, next);
    } else {
        express.urlencoded({ extended: false, limit: '10kb' })(req, res, next);
    }
});
app.use(cookieParser());

// NoSQL injection protection middleware
const mongoSanitize = require('./middlewares/mongoSanitize');
app.use(mongoSanitize);

// --- Static Files (Profile Images) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Image Proxy (For PDF Generation) ---
app.get('/api/proxy/image', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).send('URL is required');
        const response = await fetch(url);
        if (!response.ok) return res.status(response.status).send('Failed to fetch image');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.set('Content-Type', response.headers.get('content-type'));
        res.set('Access-Control-Allow-Origin', '*');
        res.send(buffer);
    } catch (err) {
        console.error('Image proxy error:', err);
        res.status(500).send('Error fetching image');
    }
});

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
app.use('/api/research-uploads', require('./modules/ResearchUploads/ResearchUploads.route'));
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
app.use('/api/value-addition/contribution-category', require('./modules/Contribution/ContributionCategory.router'));
app.use('/api/appraisal', require('./modules/Appraisal/Appraisal.route'));
app.use('/api/leadership-roles', require('./modules/leadershipRole/leadershipRole.route'));
app.use('/api/notifications', require('./modules/notification/notification.routes'));
app.use('/api/utilities', require('./modules/utilities/utilities.route'));
app.use('/api/service-desk/services', require('./modules/serviceDesk/service.route'));
app.use('/api/service-desk/tickets', require('./modules/serviceDesk/ticket.route'));
app.use('/api/events', require('./modules/Events/Events.route'));
app.use('/api/clubs', require('./modules/Club/Club.route'));
app.use('/api/groups', require('./modules/Group/Group.route'));
app.use('/api/event-departments', require('./modules/EventDepartment/EventDepartment.route'));
// app.use('/api/eventdepartments', require('./modules/EventDepartment/EventDepartment.route'));
// app.use('/api/departments', require('./modules/EventDepartment/EventDepartment.route'));
app.use('/api/organisation-committee', require('./modules/OrganisationCommittee/OrganisationCommittee.route'));
app.use('/api/event-assignments', require('./modules/EventAssignment/EventAssignment.route'));
app.use('/api/event-groups', require('./modules/EventAssignment/EventGroup.route'));
app.use('/api/major-events', require('./modules/EventAssignment/MajorEvent.route'));
app.use('/api/event-students', require('./modules/EventStudents/EventStudent.route'));
app.use('/api/infrastructure', require('./modules/Infrastructure/Infrastructure.route'));
app.use('/api/inquiry', require('./modules/Inquiry/Inquiry.route'));
app.use('/api/contact', require('./modules/Inquiry/Inquiry.route'));

// payments
app.use('/api/razorpay', require('./modules/Payments/Payments.route'));
app.use('/api/payments', require('./modules/Payments/Payments.route'));

// Proxy for Student Photos to fix CORS in PDF Generation
app.get('/api/proxy/student-photo/:roll', async (req, res) => {
    try {
        const { roll } = req.params;
        const axios = require('axios');
        const response = await axios.get(`https://info.aec.edu.in/adityacentral/StudentPhotos/${roll}.jpg`, {
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', 'image/jpeg');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.send(response.data);
    } catch (error) {
        res.status(404).send('Not Found');
    }
});

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
