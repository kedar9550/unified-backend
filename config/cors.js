const allowedOrigins = [
    'http://localhost:5173',
    'https://unified-frontend-neon.vercel.app'
];

if (process.env.FRONTEND_URI) {
    const envOrigins = process.env.FRONTEND_URI.split(',').map(o => o.trim());
    envOrigins.forEach(o => {
        if (o && !allowedOrigins.includes(o)) {
            allowedOrigins.push(o);
        }
    });
}

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

module.exports = {
    allowedOrigins,
    corsOptions
};
