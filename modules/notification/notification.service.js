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
            // Auto-detect targetRole if not explicitly set
            if (!data.metadata) {
                data.metadata = {};
            }

            if (!data.metadata.targetRole) {
                try {
                    const UserAppRole = require('../userAppRole/userAppRole.model');
                    const userAppRoles = await UserAppRole.find({ userId: data.recipientId }).populate('role');
                    const roles = userAppRoles.map(uar => uar.role?.name?.toUpperCase()).filter(Boolean);

                    if (roles.length === 1) {
                        data.metadata.targetRole = roles[0];
                    } else if (roles.length > 1) {
                        const link = data.link || '';
                        const module = data.module || '';

                        // 1. Service Desk Module
                        if (module === 'Service Desk' || module === 'ServiceDesk' || link.includes('/service-desk')) {
                            if (link.includes('/admin') || link.includes('/reports')) {
                                if (roles.includes('SERVICE_ADMIN')) {
                                    data.metadata.targetRole = 'SERVICE_ADMIN';
                                }
                            } else if (link.includes('/assigned-to-me')) {
                                if (roles.includes('SERVICE_EMP')) {
                                    data.metadata.targetRole = 'SERVICE_EMP';
                                }
                            } else if (link.includes('/ticket/')) {
                                const msgLower = (data.message || '').toLowerCase();
                                const titleLower = (data.title || '').toLowerCase();
                                const isForEmp = titleLower.includes('assigned') || msgLower.includes('assigned to you') || msgLower.includes('by user');
                                
                                if (isForEmp && roles.includes('SERVICE_EMP')) {
                                    data.metadata.targetRole = 'SERVICE_EMP';
                                } else if (roles.includes('SERVICE_ADMIN') && (titleLower.includes('admin') || titleLower.includes('new ticket') || titleLower.includes('escalated'))) {
                                    data.metadata.targetRole = 'SERVICE_ADMIN';
                                } else {
                                    const clientRoles = ['FACULTY', 'STAFF', 'TECHNICAL STAFF', 'EXAMSECTION', 'HOD', 'STUDENT'];
                                    const matchedRole = clientRoles.find(r => roles.includes(r));
                                    if (matchedRole) {
                                        data.metadata.targetRole = matchedRole;
                                    }
                                }
                            }
                        }
                        
                        // 2. Research / Approvals Modules
                        const researchModules = ['Research', 'Journal', 'Conference', 'BookChapter', 'Textbook', 'Patent', 'FundedProject', 'Consultancy', 'NovelProduct'];
                        if (researchModules.includes(module) || link.includes('/research') || link.includes('/hod') || link.includes('/research-dean') || link.includes('/research-coordinator')) {
                            if (link.includes('/hod/')) {
                                if (roles.includes('HOD')) {
                                    data.metadata.targetRole = 'HOD';
                                }
                            } else if (link.includes('/research-dean/')) {
                                if (roles.includes('RESEARCH_DEAN')) {
                                    data.metadata.targetRole = 'RESEARCH_DEAN';
                                }
                            } else if (link.includes('/research-coordinator/')) {
                                if (roles.includes('RESEARCH_COORDINATOR')) {
                                    data.metadata.targetRole = 'RESEARCH_COORDINATOR';
                                }
                            } else {
                                if (roles.includes('FACULTY')) {
                                    data.metadata.targetRole = 'FACULTY';
                                } else if (roles.includes('STUDENT')) {
                                    data.metadata.targetRole = 'STUDENT';
                                }
                            }
                        }
                    }
                } catch (roleErr) {
                    console.error("Failed to auto-detect targetRole:", roleErr.message);
                }
            }

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
