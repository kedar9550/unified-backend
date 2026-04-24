const Discrepancy = require("./discrepancy.model");
const path = require("path");

// Section → responsible role mapping
const SECTION_ROLE_MAP = {
    TEACHING:   "EXAMSECTION",
    PROCTORING: "EXAMSECTION",
    FEEDBACK:   "FEEDBACK COORDINATOR",
    OTHER:      "ADMIN",
};

/**
 * POST /api/discrepancies
 * Faculty raises a discrepancy
 */
const raiseDiscrepancy = async (req, res) => {
    try {
        const { academicYearId, semesterId, section, note, facultyInstitutionId, facultyName } = req.body;

        if (!academicYearId || !semesterId || !section || !note) {
            return res.status(400).json({ message: "academicYearId, semesterId, section, and note are required." });
        }

        const assignedRole = SECTION_ROLE_MAP[section] || "ADMIN";

        const disc = await Discrepancy.create({
            raisedBy:             req.user.userId,
            facultyInstitutionId: facultyInstitutionId || "",
            facultyName:          facultyName || "",
            academicYearId,
            semesterId,
            section,
            note,
            assignedRole,
        });

        res.status(201).json({ message: "Discrepancy raised successfully.", discrepancy: disc });
    } catch (err) {
        console.error("raiseDiscrepancy error:", err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * GET /api/discrepancies
 * - FACULTY: sees only their own discrepancies
 * - Other roles (EXAMSECTION, FEEDBACK, ADMIN): sees those assigned to their role
 */
const getDiscrepancies = async (req, res) => {
    try {
        const userRoles = (req.user.roles || []).map(r => r.role?.toUpperCase());
        const isFaculty = userRoles.includes("FACULTY");

        let query = {};

        if (isFaculty) {
            // Faculty only sees what they raised
            query.raisedBy = req.user.userId;
        } else {
            // Find the highest-priority role that has assignments
            const resolverRoles = userRoles.filter(r => !["FACULTY", "STUDENT"].includes(r));
            if (resolverRoles.length === 0) {
                return res.json([]);
            }
            
            // Backward compatibility for existing discrepancies that were saved with "FEEDBACK" role
            const rolesToQuery = [...resolverRoles];
            if (rolesToQuery.includes("FEEDBACK COORDINATOR")) {
                rolesToQuery.push("FEEDBACK");
            }

            query.assignedRole = { $in: rolesToQuery };
        }

        const discrepancies = await Discrepancy.find(query)
            .populate("academicYearId", "year")
            .populate("semesterId", "type")
            .populate("raisedBy", "name institutionId")
            .populate("resolvedBy", "name")
            .sort({ createdAt: -1 });

        res.json(discrepancies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * GET /api/discrepancies/:id
 */
const getDiscrepancyById = async (req, res) => {
    try {
        const disc = await Discrepancy.findById(req.params.id)
            .populate("academicYearId", "year")
            .populate("semesterId", "type")
            .populate("raisedBy", "name institutionId department")
            .populate("resolvedBy", "name");

        if (!disc) return res.status(404).json({ message: "Discrepancy not found." });
        res.json(disc);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * PUT /api/discrepancies/:id
 * Resolver team updates status + uploads proof (RESOLVED) or rejects with note (REJECTED)
 */
const resolveDiscrepancy = async (req, res) => {
    try {
        const { id } = req.params;
        const { resolutionNote, status, rejectionNote, academicYearId, semesterId } = req.body;

        const disc = await Discrepancy.findById(id);
        if (!disc) return res.status(404).json({ message: "Discrepancy not found." });

        // Check this user's role matches assignedRole
        const userRoles = (req.user.roles || []).map(r => r.role?.toUpperCase());
        const isAdmin   = userRoles.includes("ADMIN") || userRoles.includes("UNIPRIME") || userRoles.includes("FEEDBACK COORDINATOR");
        const hasAccess = isAdmin || userRoles.includes(disc.assignedRole?.toUpperCase());

        if (!hasAccess) {
            return res.status(403).json({ message: "You are not authorized to update this discrepancy." });
        }

        // ── REJECT flow ─────────────────────────────────────────────
        if (status === "REJECTED") {
            if (!rejectionNote || !rejectionNote.trim()) {
                return res.status(400).json({ message: "Rejection note is required." });
            }
            disc.status        = "REJECTED";
            disc.rejectionNote = rejectionNote.trim();
            disc.resolvedBy    = req.user.userId;
            await disc.save();
            return res.json({ message: "Discrepancy rejected.", discrepancy: disc });
        }

        // ── RESOLVE flow ────────────────────────────────────────────
        if (!req.file) {
            return res.status(400).json({ message: "Proof document is required to resolve a discrepancy." });
        }

        // Allow updating academic year / semester if admin corrected the data
        if (academicYearId) disc.academicYearId = academicYearId;
        if (semesterId)     disc.semesterId     = semesterId;

        disc.resolvedBy     = req.user.userId;
        disc.resolutionNote = resolutionNote || "";
        disc.proofDocument  = req.file.filename;
        disc.status         = "RESOLVED";

        await disc.save();

        res.json({ message: "Discrepancy resolved.", discrepancy: disc });
    } catch (err) {
        console.error("resolveDiscrepancy error:", err);
        res.status(500).json({ message: err.message });
    }
};

module.exports = { raiseDiscrepancy, getDiscrepancies, getDiscrepancyById, resolveDiscrepancy };
