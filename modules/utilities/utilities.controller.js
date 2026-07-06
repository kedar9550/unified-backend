const Utility = require('./utilities.model');
const crypto = require('crypto');

// Helper to generate short code
const generateShortCode = async () => {
    let code;
    let exists = true;
    while (exists) {
        code = crypto.randomBytes(4).toString('base64url'); // ~6 chars
        const found = await Utility.findOne({ shortCode: code });
        if (!found) {
            exists = false;
        }
    }
    return code;
};

// @desc    Create a Short URL
// @route   POST /api/utilities/shorten-url
// @access  Private
exports.createShortUrl = async (req, res) => {
    try {
        const { longUrl, expiresAt } = req.body;
        if (!longUrl) {
            return res.status(400).json({ success: false, message: 'longUrl is required' });
        }

        const shortCode = await generateShortCode();
        
        const utility = await Utility.create({
            longUrl,
            shortCode,
            userId: req.user.userId || req.user._id,
            expiresAt: expiresAt || null,
            type: 'short_url'
        });

        res.status(201).json({ success: true, data: utility });
    } catch (error) {
        console.error('Error creating short url:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Create a QR Code
// @route   POST /api/utilities/generate-qr
// @access  Private
exports.createQrCode = async (req, res) => {
    try {
        const { longUrl, expiresAt } = req.body;
        if (!longUrl) {
            return res.status(400).json({ success: false, message: 'longUrl is required' });
        }

        const shortCode = await generateShortCode();
        
        const utility = await Utility.create({
            longUrl,
            shortCode,
            userId: req.user.userId || req.user._id,
            expiresAt: expiresAt || null,
            type: 'qr'
        });

        res.status(201).json({ success: true, data: utility });
    } catch (error) {
        console.error('Error creating QR code:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Get user's utilities
// @route   GET /api/utilities/my-links
// @access  Private
exports.getMyUtilities = async (req, res) => {
    try {
        const utilities = await Utility.find({ userId: req.user.userId || req.user._id, isDeleted: false }).sort('-createdAt');
        res.status(200).json({ success: true, data: utilities });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Deactivate/Activate my utility
// @route   PUT /api/utilities/:id/status
// @access  Private
exports.updateMyUtilityStatus = async (req, res) => {
    try {
        const userId = req.user.userId || req.user._id;
        const utility = await Utility.findOne({ _id: req.params.id, userId });
        if (!utility) {
            return res.status(404).json({ success: false, message: 'Utility not found or unauthorized' });
        }
        
        utility.isActive = !utility.isActive;
        await utility.save();
        
        res.status(200).json({ success: true, data: utility });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Soft Delete my utility
// @route   DELETE /api/utilities/:id/soft-delete
// @access  Private
exports.softDeleteMyUtility = async (req, res) => {
    try {
        const userId = req.user.userId || req.user._id;
        const utility = await Utility.findOne({ _id: req.params.id, userId });
        if (!utility) {
            return res.status(404).json({ success: false, message: 'Utility not found or unauthorized' });
        }
        
        utility.isDeleted = true;
        utility.isActive = false; // also make it inactive
        await utility.save();
        
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all utilities (Admin/UNIPRIME)
// @route   GET /api/utilities/admin/all
// @access  Private (Admin)
exports.getAllUtilitiesAdmin = async (req, res) => {
    try {
        const utilities = await Utility.find()
            .populate('userId', 'name employeeId designation')
            .sort('-createdAt');
        res.status(200).json({ success: true, data: utilities });
    } catch (error) {
        console.error('Error fetching all utilities:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Deactivate/Activate utility (Admin/UNIPRIME)
// @route   PUT /api/utilities/admin/:id/status
// @access  Private (Admin)
exports.updateUtilityStatus = async (req, res) => {
    try {
        const utility = await Utility.findById(req.params.id);
        if (!utility) {
            return res.status(404).json({ success: false, message: 'Utility not found' });
        }
        
        utility.isActive = !utility.isActive;
        await utility.save();
        
        res.status(200).json({ success: true, data: utility });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Soft Delete utility (Admin/UNIPRIME)
// @route   DELETE /api/utilities/admin/:id/soft-delete
// @access  Private (Admin)
exports.softDeleteUtility = async (req, res) => {
    try {
        const utility = await Utility.findById(req.params.id);
        if (!utility) {
            return res.status(404).json({ success: false, message: 'Utility not found' });
        }
        
        utility.isDeleted = true;
        utility.isActive = false; // also make it inactive
        await utility.save();
        
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Hard Delete utility (Admin/UNIPRIME)
// @route   DELETE /api/utilities/admin/:id/hard-delete
// @access  Private (Admin)
exports.hardDeleteUtility = async (req, res) => {
    try {
        const utility = await Utility.findById(req.params.id);
        if (!utility) {
            return res.status(404).json({ success: false, message: 'Utility not found' });
        }
        
        await utility.deleteOne();
        
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Redirect short code to long url
// @route   GET /api/utilities/r/:shortCode
// @access  Public
exports.redirectUrl = async (req, res) => {
    try {
        const { shortCode } = req.params;
        const utility = await Utility.findOne({ shortCode, isDeleted: false });

        if (!utility) {
            return res.status(404).json({ success: false, message: 'URL not found or deleted' });
        }

        if (!utility.isActive) {
            return res.status(400).json({ success: false, message: 'URL is inactive' });
        }

        if (utility.expiresAt && new Date() > utility.expiresAt) {
            return res.status(400).json({ success: false, message: 'URL has expired' });
        }

        // Increment clicks
        utility.clicks += 1;
        await utility.save();

        res.redirect(utility.longUrl);
    } catch (error) {
        console.error('Redirection error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
