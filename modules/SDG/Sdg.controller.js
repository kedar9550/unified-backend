const Sdg = require("./Sdg.model");
const escapeRegex = require("../../utils/escapeRegex");
const extractBackgroundColor = require("../../utils/extractBackgroundColor");
const path = require("path");

// 1. Create SGD
exports.createSdg = async (req, res) => {
    try {
        const { sdgNumber, sdgTitle, keywords, imageUrl, color, backgroundColor } = req.body;

        // Validate required fields
        if (!sdgNumber || !sdgTitle || !keywords || (Array.isArray(keywords) && keywords.length === 0)) {
            return res.status(400).json({ message: "Please provide SDG Number, SDG Title, and at least one Keyword" });
        }

        // Check if SDG Number already exists
        const existingSdg = await Sdg.findOne({ sdgNumber });
        if (existingSdg) {
            return res.status(400).json({ message: "SDG Number already exists" });
        }

        let finalImageUrl = imageUrl || "";
        let extractedBgColor = backgroundColor || color || "";

        if (req.file) {
            finalImageUrl = `/uploads/sdgs/${req.file.filename}`;
            const detected = await extractBackgroundColor(req.file.path);
            if (detected) extractedBgColor = detected;
        } else if (!finalImageUrl && sdgNumber) {
            const numMatch = String(sdgNumber).match(/\d+/);
            if (numMatch) {
                const paddedNum = numMatch[0].padStart(2, '0');
                finalImageUrl = `/uploads/sdgs/sdg-en-${paddedNum}.png`;
                const fullDiskPath = path.join(__dirname, "../../uploads/sdgs", `sdg-en-${paddedNum}.png`);
                const detected = await extractBackgroundColor(fullDiskPath);
                if (detected) extractedBgColor = detected;
            }
        }

        // Create new SGD
        const newSdg = new Sdg({
            sdgNumber,
            sdgTitle,
            keywords: Array.isArray(keywords) ? keywords : String(keywords).split(",").map(k => k.trim()).filter(Boolean),
            imageUrl: finalImageUrl,
            backgroundColor: extractedBgColor,
            color: extractedBgColor
        });

        await newSdg.save();
        res.status(201).json({
            message: "SDG created successfully",
            sgd: newSdg,
            data: newSdg,
            code: newSdg.sdgNumber,
            title: newSdg.sdgTitle,
            imageUrl: newSdg.imageUrl,
            backgroundColor: newSdg.backgroundColor
        });

    } catch (error) {
        console.error("Error creating SGD:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 2. Get All SGDs with Search and Pagination
exports.getAllSdgs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || "";

        const skip = (page - 1) * limit;

        let query = {};

        // Search by SDG Number or SDG Title
        if (search) {
            const escapedSearch = escapeRegex(search);
            query.$or = [
                { sdgNumber: { $regex: escapedSearch, $options: "i" } },
                { sdgTitle: { $regex: escapedSearch, $options: "i" } },
                { keywords: { $in: [search] } }  // Search in keywords array
            ];
        }

        // Fetch all SGDs with pagination
        const sgds = await Sdg.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ sdgNumber: 1 });

        // Get total count for pagination metadata
        const total = await Sdg.countDocuments(query);

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: sgds,
            sgds: sgds // Backward compatibility
        });

    } catch (error) {
        console.error("Error fetching SGDs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 3. Get Single SDG by ID
exports.getSdgById = async (req, res) => {
    try {
        const sgd = await Sdg.findById(req.params.id);

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
exports.updateSdg = async (req, res) => {
    try {
        const { sdgNumber, sdgTitle, keywords, imageUrl, color, backgroundColor } = req.body;

        // Find SDG by ID
        const sgd = await Sdg.findById(req.params.id);

        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        // Update fields if provided
        if (sdgNumber) {
            const existingSdg = await Sdg.findOne({
                sdgNumber,
                _id: { $ne: req.params.id }
            });
            if (existingSdg) {
                return res.status(400).json({ message: "SDG Number already exists" });
            }
            sgd.sdgNumber = sdgNumber;
        }

        if (sdgTitle) {
            sgd.sdgTitle = sdgTitle;
        }

        if (keywords !== undefined) {
            sgd.keywords = Array.isArray(keywords) ? keywords : String(keywords).split(",").map(k => k.trim()).filter(Boolean);
        }

        if (imageUrl !== undefined) {
            sgd.imageUrl = imageUrl;
        }

        if (backgroundColor !== undefined) {
            sgd.backgroundColor = backgroundColor;
            sgd.color = backgroundColor;
        } else if (color !== undefined) {
            sgd.backgroundColor = color;
            sgd.color = color;
        }

        if (req.file) {
            sgd.imageUrl = `/uploads/sdgs/${req.file.filename}`;
            const detectedColor = await extractBackgroundColor(req.file.path);
            if (detectedColor) {
                sgd.backgroundColor = detectedColor;
                sgd.color = detectedColor;
            }
        }

        // Save updated SDG
        await sgd.save();
        res.status(200).json({
            message: "SDG updated successfully",
            sgd,
            data: sgd,
            code: sgd.sdgNumber,
            title: sgd.sdgTitle,
            imageUrl: sgd.imageUrl,
            backgroundColor: sgd.backgroundColor
        });

    } catch (error) {
        console.error("Error updating SGD:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 5. Upload SDG Image specifically
exports.uploadSdgImage = async (req, res) => {
    try {
        const sgd = await Sdg.findById(req.params.id);
        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "No image file uploaded" });
        }

        sgd.imageUrl = `/uploads/sdgs/${req.file.filename}`;
        const detectedColor = await extractBackgroundColor(req.file.path);
        if (detectedColor) {
            sgd.backgroundColor = detectedColor;
            sgd.color = detectedColor;
        }

        await sgd.save();

        res.status(200).json({
            success: true,
            message: "SDG image uploaded successfully",
            data: sgd,
            sgd,
            code: sgd.sdgNumber,
            title: sgd.sdgTitle,
            imageUrl: sgd.imageUrl,
            backgroundColor: sgd.backgroundColor
        });
    } catch (error) {
        console.error("Error uploading SDG image:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 6. Delete SDG
exports.deleteSdg = async (req, res) => {
    try {
        const sgd = await Sdg.findByIdAndDelete(req.params.id);

        if (!sgd) {
            return res.status(404).json({ message: "SDG not found" });
        }

        res.status(200).json({ message: "SDG deleted successfully", sgd });

    } catch (error) {
        console.error("Error deleting SDG:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// 7. Re-analyze Background Colors for All Present SDGs
exports.reanalyzeAllSdgColors = async (req, res) => {
    try {
        const sdgs = await Sdg.find({});
        let updatedCount = 0;
        const results = [];

        for (const sdg of sdgs) {
            let imgFileName = "";
            if (sdg.imageUrl) {
                imgFileName = path.basename(sdg.imageUrl);
            } else if (sdg.sdgNumber) {
                const numMatch = String(sdg.sdgNumber).match(/\d+/);
                if (numMatch) {
                    const paddedNum = numMatch[0].padStart(2, '0');
                    imgFileName = `sdg-en-${paddedNum}.png`;
                    sdg.imageUrl = `/uploads/sdgs/${imgFileName}`;
                }
            }

            if (imgFileName) {
                const fullDiskPath = path.join(__dirname, "../../uploads/sdgs", imgFileName);
                const detected = await extractBackgroundColor(fullDiskPath);
                if (detected) {
                    sdg.backgroundColor = detected;
                    sdg.color = detected;
                    await sdg.save();
                    updatedCount++;
                    results.push({
                        sdgNumber: sdg.sdgNumber,
                        sdgTitle: sdg.sdgTitle,
                        backgroundColor: detected
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Successfully analyzed background colors for ${updatedCount} SDGs`,
            updatedCount,
            data: results
        });
    } catch (error) {
        console.error("Error re-analyzing SDG colors:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};