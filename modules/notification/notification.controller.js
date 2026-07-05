const Notification = require('./notification.model');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({
            recipientId: req.user.userId,
            isDeleted: false
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('senderId', 'name profileImage'); // Populate sender details if needed

        const unreadCount = await Notification.countDocuments({
            recipientId: req.user.userId,
            isDeleted: false,
            isRead: false
        });

        res.status(200).json({
            success: true,
            data: notifications,
            unreadCount
        });
    } catch (error) {
        console.error("Fetch Notifications Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: req.user.userId },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        console.error("Mark Read Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipientId: req.user.userId, isRead: false, isDeleted: false },
            { isRead: true }
        );

        res.status(200).json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        console.error("Mark All Read Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// @desc    Soft delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: req.user.userId },
            { isDeleted: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.status(200).json({ success: true, message: "Notification deleted" });
    } catch (error) {
        console.error("Delete Notification Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
