const Discrepancy = require("./discrepancy.model");
const path = require("path");
const fs = require("fs");

// Section → responsible role mapping
const SECTION_ROLE_MAP = {
    TEACHING: "EXAMSECTION",
    PROCTORING: "UNIPRIME",
    FEEDBACK: "FEEDBACK COORDINATOR",
    CO_ATTAINMENT: "EXAMSECTION",
    OTHER: "ADMIN",
};

/**
 * POST /api/discrepancies
 * Faculty raises a discrepancy
 */
const raiseDiscrepancy = async (req, res) => {
    try {
        const { academicYearId, semesterTypeId, semester, section, note, facultyInstitutionId, facultyName, proctoringType, studentDepartmentId } = req.body;

        if (!academicYearId || !section || !note) {
            return res.status(400).json({ message: "academicYearId, section, and note are required." });
        }

        let assignedRole = SECTION_ROLE_MAP[section] || "ADMIN";

        const disc = await Discrepancy.create({
            raisedBy: req.user.userId,
            facultyInstitutionId: facultyInstitutionId || "",
            facultyName: facultyName || "",
            academicYearId,
            semesterTypeId,
            semester,
            section,
            note,
            assignedRole,
            proctoringType,
            studentDepartmentId,
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
        const { role } = req.query; // Optional role from query params
        const userRoles = (req.user.roles || []).map(r => {
            const rname = r.role?.toUpperCase();
            return rname === "STAFF" ? "FACULTY" : rname;
        });

        // Determine which role to use for filtering
        let activeRole = role?.toUpperCase();
        if (activeRole === "STAFF") activeRole = "FACULTY";

        if (!activeRole || !userRoles.includes(activeRole)) {
            // Fallback: Pick first role that isn't FACULTY/STUDENT
            activeRole = userRoles.find(r => !["FACULTY", "STUDENT"].includes(r)) ||
                (userRoles.includes("FACULTY") ? "FACULTY" : null);
        }

        let query = {};

        if (activeRole && !["FACULTY", "STUDENT"].includes(activeRole)) {
            if (activeRole === "HOD") {
                // HOD resolves proctoring assigned count discrepancies
                query.$or = [
                    { assignedRole: "HOD" },
                    {
                        section: "PROCTORING",
                        proctoringType: "ASSIGNED_COUNT",
                        assignedRole: { $in: ["UNIPRIME", "EXAMSECTION"] }
                    }
                ];
            } else {
                const rolesToQuery = [activeRole];
                if (activeRole === "FEEDBACK COORDINATOR") {
                    rolesToQuery.push("FEEDBACK");
                }

                if (activeRole === "EXAMSECTION") {
                    rolesToQuery.push("TEACHING", "CO_ATTAINMENT");
                }

                if (activeRole === "UNIPRIME") {
                    rolesToQuery.push("PROCTORING");
                }

                query.assignedRole = { $in: rolesToQuery };
            }
        } else if (activeRole === "FACULTY") {
            // User is acting as faculty, see only raised discrepancies
            query.raisedBy = req.user.userId;
        } else {
            // Student or role with no resolver permissions
            return res.json([]);
        }

        const discrepancies = await Discrepancy.find(query)
            .populate("academicYearId", "year")
            .populate("semesterTypeId", "name")
            .populate("studentDepartmentId", "name")
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
            .populate("semesterTypeId", "name")
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
        const { resolutionNote, status, rejectionNote, academicYearId, semesterTypeId } = req.body;

        const disc = await Discrepancy.findById(id);
        if (!disc) return res.status(404).json({ message: "Discrepancy not found." });

        // Check this user's role matches assignedRole
        const userRoles = (req.user.roles || []).map(r => r.role?.toUpperCase());
        const isAdmin = userRoles.includes("ADMIN") || userRoles.includes("UNIPRIME") || userRoles.includes("FEEDBACK COORDINATOR");
        const isHOD = userRoles.includes("HOD");
        const hasAccess = isAdmin ||
            userRoles.includes(disc.assignedRole?.toUpperCase()) ||
            (isHOD && disc.section === "PROCTORING" && disc.proctoringType === "ASSIGNED_COUNT");

        if (!hasAccess) {
            return res.status(403).json({ message: "You are not authorized to update this discrepancy." });
        }

        // ── REJECT flow ─────────────────────────────────────────────
        if (status === "REJECTED") {
            if (!rejectionNote || !rejectionNote.trim()) {
                return res.status(400).json({ message: "Rejection note is required." });
            }
            disc.status = "REJECTED";
            disc.rejectionNote = rejectionNote.trim();
            disc.resolvedBy = req.user.userId;
            await disc.save();
            return res.json({ message: "Discrepancy rejected.", discrepancy: disc });
        }

        // ── RESOLVE flow ────────────────────────────────────────────
        if (!req.file) {
            return res.status(400).json({ message: "Proof document is required to resolve a discrepancy." });
        }

        // Limit proof document to 500kb for EXAMSECTION or UNIPRIME role
        if ((disc.assignedRole === "EXAMSECTION" || disc.assignedRole === "UNIPRIME") && req.file.size > 500 * 1024) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error("Failed to delete oversized file:", err);
            }
            return res.status(400).json({ message: "Proof document must be under 500kb." });
        }

        // Allow updating academic year / semester if admin corrected the data
        if (academicYearId) disc.academicYearId = academicYearId;
        if (semesterTypeId) disc.semesterTypeId = semesterTypeId;

        disc.resolvedBy = req.user.userId;
        disc.resolutionNote = resolutionNote || "";
        disc.proofDocument = req.file.filename;
        disc.status = "RESOLVED";

        await disc.save();

        res.json({ message: "Discrepancy resolved.", discrepancy: disc });
    } catch (err) {
        console.error("resolveDiscrepancy error:", err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * DELETE /api/discrepancies/:id
 * Faculty can delete their own PENDING discrepancy
 */
const deleteDiscrepancy = async (req, res) => {
    try {
        const { id } = req.params;
        const disc = await Discrepancy.findById(id);

        if (!disc) {
            return res.status(404).json({ message: "Discrepancy not found." });
        }

        // Only the creator can delete it
        if (disc.raisedBy.toString() !== req.user.userId.toString()) {
            return res.status(403).json({ message: "You can only delete your own discrepancies." });
        }

        // Only PENDING can be deleted
        if (disc.status !== "PENDING") {
            return res.status(400).json({ message: "Only pending discrepancies can be deleted." });
        }

        await Discrepancy.findByIdAndDelete(id);
        res.json({ message: "Discrepancy deleted successfully." });
    } catch (err) {
        console.error("deleteDiscrepancy error:", err);
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    raiseDiscrepancy,
    getDiscrepancies,
    getDiscrepancyById,
    resolveDiscrepancy,
    deleteDiscrepancy
};

