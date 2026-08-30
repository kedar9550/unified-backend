const allowedOrigins = process.env.FRONTEND_URIS
    ? process.env.FRONTEND_URIS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'active-role'],
    credentials: true,
};

module.exports = {
    allowedOrigins,
    corsOptions
};
