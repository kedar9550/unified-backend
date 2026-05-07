const Sgd = require("../models/Sgd");

// 1. Create SGD
exports.createSgd = async (req, res) => {
    try {
        const { sdgNumber, sdgTitle, keywords } = req.body;

        // Validate required fields
        if (!sdgNumber || !sdgTitle || !keywords || keywords.length === 0) {
            return res.status(400).json({ message: "Please provide SDG Number, SDG Title, and at least one Keyword" });
        }

        // Check if SDG Number already exists
        const existingSgd = await Sgd.findOne({ sdgNumber });
        if (existingSgd) {
            return res.status(400).json({ message: "SDG Number already exists" });
        }

        // Create new SGD
        const newSgd = new Sgd({
            sdgNumber,
            sdgTitle,
            keywords
        });

        await newSgd.save();
        res.status(201).json({ message: "SDG created successfully", sgd: newSgd });

    } catch (error) {
        console.error("Error creating SGD:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 2. Get All SGDs with Search and Pagination
exports.getAllSgds = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";

        const skip = (page - 1) * limit;

        let query = {};

        // Search by SDG Number or SDG Title
        if (search) {
            query.$or = [
                { sdgNumber: { $regex: search, $options: "i" } },
                { sdgTitle: { $regex: search, $options: "i" } },
                { keywords: { $in: [search] } }  // Search in keywords array
            ];
        }

        // Fetch all SGDs with pagination
        const sgds = await Sgd.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ sdgNumber: 1 });

        // Get total count for pagination metadata
        const total = await Sgd.countDocuments(query);

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: sgds
        });

    } catch (error) {
        console.error("Error fetching SGDs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 3. Get Single SDG by ID
exports.getSgdById = async (req, res) => {
    try {
        const sgd = await Sgd.findById(req.params.id);

        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        res.status(200).json({ success: true, data: sgd });

    } catch (error) {
        console.error("Error fetching SDG:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 4. Update SGD
exports.updateSgd = async (req, res) => {
    try {
        const { sdgNumber, sdgTitle, keywords } = req.body;

        // Find SDG by ID
        const sgd = await Sgd.findById(req.params.id);

        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        // Update fields if provided
        if (sdgNumber) {
            // Check if SDG Number already exists (excluding current SDG)
            const existingSgd = await Sgd.findOne({
                sdgNumber,
                _id: { $ne: req.params.id }
            });
            if (existingSgd) {
                return res.status(400).json({ message: "SDG Number already exists" });
            }
            sgd.sdgNumber = sdgNumber;
        }

        if (sdgTitle) {
            sgd.sdgTitle = sdgTitle;
        }

        if (keywords) {
            sgd.keywords = keywords;
        }

        // Save updated SDG
        await sgd.save();
        res.status(200).json({ message: "SDG updated successfully", sgd });

    } catch (error) {
        console.error("Error updating SGD:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 5. Delete SDG
exports.deleteSgd = async (req, res) => {
    try {
        const sgd = await Sgd.findByIdAndDelete(req.params.id);

        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        res.status(200).json({ message: "SDG deleted successfully", sgd });

    } catch (error) {
        console.error("Error deleting SDG:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};