const Notification = require('./notification.model');
const socketConfig = require('../../config/socket');

class NotificationService {
    /**
     * Send a notification and emit via Socket.io
     * @param {Object} data 
     * @param {String} data.recipientId - User ID receiving notification
     * @param {String} data.senderId - User ID sending notification (optional)
     * @param {String} data.module - Module name (e.g., 'Research', 'Appraisal')
     * @param {String} data.type - 'INFO', 'ACTION_REQUIRED', 'SUCCESS', 'REJECTED', 'WARNING'
     * @param {String} data.title - Notification title
     * @param {String} data.message - Detailed message
     * @param {String} data.link - URL to navigate to when clicked
     * @param {Object} data.metadata - Any extra JSON payload
     */
    static async sendNotification(data) {
        try {
            // 1. Save to Database
            const notification = await Notification.create(data);

            // 2. Emit via Socket.io to the recipient's personal room
            try {
                const io = socketConfig.getIO();
                io.to(data.recipientId.toString()).emit('new_notification', notification);
            } catch (socketErr) {
                console.error("Socket emission failed, but notification saved.", socketErr.message);
            }

            return notification;
        } catch (error) {
            console.error("Failed to send notification:", error);
            throw error;
        }
    }
}

module.exports = NotificationService;
