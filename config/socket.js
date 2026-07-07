const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URI || "http://localhost:5173",
                methods: ["GET", "POST", "PUT", "DELETE"],
                credentials: true,
            },
        });

        // Middleware for authentication
        io.use((socket, next) => {
            try {
                const cookieHeader = socket.request.headers.cookie;
                let token = null;
                if (cookieHeader) {
                    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
                    if (match) token = match[1];
                }

                if (!token) {
                    return next(new Error("Authentication error: No token provided"));
                }
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = decoded; // attach user info
                next();
            } catch (error) {
                next(new Error("Authentication error: Invalid token"));
            }
        });

        io.on("connection", (socket) => {
            console.log(`Socket connected: ${socket.id} (User: ${socket.user?.userId})`);
            
            // Join a personal room based on user ID for direct notifications
            if (socket.user && socket.user.userId) {
                socket.join(socket.user.userId.toString());
                console.log(`Socket ${socket.id} joined room ${socket.user.userId}`);
            }

            // Service Desk — join/leave a per-ticket room so addComment's
            // io.to(`service-desk-ticket-${ticket._id}`).emit("new_message", ...)
            // (ticket.controller.js) actually reaches everyone viewing that ticket.
            socket.on("join_ticket_room", (ticketId) => {
                if (!ticketId) return;
                socket.join(`service-desk-ticket-${ticketId}`);
                console.log(`Socket ${socket.id} joined ticket room ${ticketId}`);
            });

            socket.on("leave_ticket_room", (ticketId) => {
                if (!ticketId) return;
                socket.leave(`service-desk-ticket-${ticketId}`);
                console.log(`Socket ${socket.id} left ticket room ${ticketId}`);
            });

            socket.on("disconnect", () => {
                console.log(`Socket disconnected: ${socket.id}`);
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    }
};
