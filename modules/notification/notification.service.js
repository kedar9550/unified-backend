const Notification = require('./notification.model');
const socketConfig = require('../../config/socket');
const Employee = require('../employee/employee.model');
const Student = require('../StudentData/Studentdata.model');
const firebaseAdmin = require('../../utils/firebase');

class NotificationService {
    /**
     * Send a notification and emit via Socket.io and FCM
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

            // 3. Send via Firebase Cloud Messaging (Push Notifications)
            try {
                // Find user in Employee or Student to get fcmIds
                let user = await Employee.findById(data.recipientId).select('fcmIds');
                let isEmployee = true;
                if (!user) {
                    user = await Student.findById(data.recipientId).select('fcmIds');
                    isEmployee = false;
                }

                if (user && user.fcmIds && user.fcmIds.length > 0) {
                    const message = {
                        notification: {
                            title: data.title,
                            body: data.message
                        },
                        data: {
                            link: data.link || '',
                            module: data.module || '',
                            type: data.type || ''
                        },
                        tokens: user.fcmIds
                    };

                    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
                    
                    // Cleanup invalid/expired FCM tokens
                    if (response.failureCount > 0) {
                        const failedTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                const errCode = resp.error?.code;
                                if (errCode === 'messaging/invalid-registration-token' || 
                                    errCode === 'messaging/registration-token-not-registered') {
                                    failedTokens.push(user.fcmIds[idx]);
                                }
                            }
                        });

                        if (failedTokens.length > 0) {
                            if (isEmployee) {
                                await Employee.findByIdAndUpdate(data.recipientId, { $pull: { fcmIds: { $in: failedTokens } } });
                            } else {
                                await Student.findByIdAndUpdate(data.recipientId, { $pull: { fcmIds: { $in: failedTokens } } });
                            }
                        }
                    }
                }
            } catch (fcmErr) {
                console.error("FCM Push Notification failed:", fcmErr.message);
            }

            return notification;
        } catch (error) {
            console.error("Failed to send notification:", error);
            throw error;
        }
    }
}

module.exports = NotificationService;
