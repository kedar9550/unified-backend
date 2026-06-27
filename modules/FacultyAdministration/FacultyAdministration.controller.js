const FacultyAdministration = require("./FacultyAdministration.model");
const Employee = require("../employee/employee.model");
const AcademicYear = require("../academicYear/academicYear.model");
const { getHODDepartments } = require("../../utils/hodHelper");
const { syncAppraisalOnAdministrationRejection } = require("../../utils/appraisalSyncHelper");

const VALID_ADMIN_ROLES = [
    "Deans / Assoc Deans / CoE",
    "HoD / Dy. CoE / Coordinator (Univ. Office)",
    "Dy. HoD / Dept. Exam Cell Incharge",
    "Time Table / Project Coordinator / Curriculum Coordinator",
    "Placement / Internship / Alumni Coordinator",
    "Coursera / LinkedIn Coordinator / ALA",
    "EDC / IIC / IQAC Coordinator",
    "Course Coordinator",
    "Website Coordinator",
    "NSS / Any Clubs / Professional Chapters Coordinator",
    "Any Training Program Coordinator (Smart Interviews / GPP / Etc.)",
    "DRC / Research Coordinator",
    "Anti-Ragging Committee Coordinator",
    "Any other remarkable event / activity coordinator"
];

// @desc    Submit or update administrative roles
// @route   POST /api/faculty-administration
// @access  Private (Faculty)
exports.createOrUpdateEntry = async (req, res) => {
    try {
        const { academicYear, roles } = req.body;
        const facultyId = req.user.userId;

        if (!academicYear) {
            return res.status(400).json({ success: false, message: "Academic Year is required." });
        }

        const ayRecord = await AcademicYear.findById(academicYear);
        if (!ayRecord) {
            return res.status(400).json({ success: false, message: "Invalid Academic Year selected." });
        }

        if (!roles || !Array.isArray(roles)) {
            return res.status(400).json({ success: false, message: "Roles data is required." });
        }

        // Validate role entries
        for (const r of roles) {
            if (!VALID_ADMIN_ROLES.includes(r.roleName)) {
                return res.status(400).json({ success: false, message: `Invalid administrative role name: "${r.roleName}".` });
            }
            if (r.roleName === "Any other remarkable event / activity coordinator" && r.isResponsible && (!r.details || !r.details.trim())) {
                return res.status(400).json({ success: false, message: "Please specify details for the other remarkable event/activity." });
            }
        }

        // Format roles to set defaults
        const formattedRoles = roles.map(r => ({
            roleName: r.roleName,
            isResponsible: r.isResponsible,
            level: r.level || "",
            details: r.details || "",
            status: "Pending",
            approvedBy: null,
            approvalDate: null,
            remarks: ""
        }));

        // Check if an entry already exists for this faculty and academic year
        let entry = await FacultyAdministration.findOne({ facultyId, academicYear });
 
        if (entry) {
            // Create a map of existing roles by name to check against
            const existingRolesMap = {};
            (entry.roles || []).forEach(r => {
                existingRolesMap[r.roleName] = r;
            });

            // Map through incoming roles and preserve approval status for unchanged or removed roles
            const updatedRoles = formattedRoles.map(newRole => {
                const existing = existingRolesMap[newRole.roleName];
                if (existing) {
                    if (!newRole.isResponsible) {
                        // Role was removed from appraisal, preserve its audit details
                        return {
                            roleName: newRole.roleName,
                            isResponsible: false,
                            level: existing.level || "",
                            details: existing.details || "",
                            status: existing.status || "Pending",
                            approvedBy: existing.approvedBy || null,
                            approvalDate: existing.approvalDate || null,
                            remarks: existing.remarks || ""
                        };
                    } else if (existing.isResponsible) {
                        const isSame = 
                            existing.level === newRole.level &&
                            existing.details === newRole.details;
                        
                        if (isSame) {
                            return {
                                roleName: newRole.roleName,
                                isResponsible: newRole.isResponsible,
                                level: newRole.level,
                                details: newRole.details,
                                status: existing.status || "Pending",
                                approvedBy: existing.approvedBy || null,
                                approvalDate: existing.approvalDate || null,
                                remarks: existing.remarks || ""
                            };
                        }
                    }
                }
                return newRole;
            });

            entry.roles = updatedRoles;

            // Re-calculate overall entry status based on the status of active roles
            const activeRoles = entry.roles.filter(r => r.isResponsible);
            const allApproved = activeRoles.every(r => r.status === "Approved");
            const anyRejected = activeRoles.some(r => r.status === "Rejected");
            const anyPending = activeRoles.some(r => r.status === "Pending");

            if (activeRoles.length === 0) {
                entry.status = "Pending";
            } else if (allApproved) {
                entry.status = "Approved";
            } else if (anyPending) {
                entry.status = "Pending";
            } else if (anyRejected) {
                entry.status = "Rejected";
            } else {
                entry.status = "Pending";
            }

            entry.approvedBy = null;
            entry.approvalDate = null;
            entry.remarks = ""; // clear entry-level remarks

            entry.markModified("roles");
            await entry.save();
        } else {
            // Create a new entry
            entry = new FacultyAdministration({
                facultyId,
                academicYear,
                roles: formattedRoles,
                status: "Pending"
            });
            await entry.save();
        }

        res.status(201).json({ success: true, data: entry });
    } catch (err) {
        console.error("Create/Update Faculty Administration Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get faculty's own administration role declarations
// @route   GET /api/faculty-administration/my-entries
// @access  Private (Faculty)
exports.getMyEntries = async (req, res) => {
    try {
        const entries = await FacultyAdministration.find({ facultyId: req.user.userId })
            .populate("academicYear", "year")
            .populate("approvedBy", "name")
            .populate("roles.approvedBy", "name")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get My Administration Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    Get administration declarations for HOD's department
// @route   GET /api/faculty-administration/pending-hod
// @access  Private (HOD)
exports.getPendingAtHOD = async (req, res) => {
    try {
        const deptIds = await getHODDepartments(req.user);

        if (!deptIds || deptIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Find all faculty belonging to HOD's department(s)
        const facultyIds = await Employee.find({
            $or: [
                { coreDepartment: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        }).distinct("_id");

        // Find all administration entries for these faculty
        const entries = await FacultyAdministration.find({
            facultyId: { $in: facultyIds }
        })
        .populate("facultyId", "name institutionId department coreDepartment")
        .populate("academicYear", "year")
        .populate("approvedBy", "name")
        .populate("roles.approvedBy", "name")
        .sort({ createdAt: -1 });

        res.json({ success: true, data: entries });
    } catch (err) {
        console.error("Get Department Faculty Administration Entries Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// @desc    HOD action (Approve/Reject) on individual role
// @route   PUT /api/faculty-administration/hod-action-role/:id
// @access  Private (HOD)
exports.hodActionRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { roleName, action, remarks } = req.body; // action: "Approve" or "Reject"

        if (!roleName) {
            return res.status(400).json({ success: false, message: "roleName is required." });
        }

        if (!action || !["Approve", "Reject"].includes(action)) {
            return res.status(400).json({ success: false, message: "Action must be either Approve or Reject." });
        }

        const entry = await FacultyAdministration.findById(id);
        if (!entry) {
            return res.status(404).json({ success: false, message: "Administration roles entry not found." });
        }

        // Validate that this HOD has authority over this faculty member's department declarations
        const deptIds = await getHODDepartments(req.user);
        const targetFaculty = await Employee.findById(entry.facultyId);
        if (!targetFaculty) {
            return res.status(404).json({ success: false, message: "Faculty member associated with this entry not found." });
        }

        const hasAccess = deptIds.some(deptId => 
            (targetFaculty.department && targetFaculty.department.toString() === deptId.toString()) ||
            (targetFaculty.coreDepartment && targetFaculty.coreDepartment.toString() === deptId.toString())
        );

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Unauthorized: HOD is not authorized to act on declarations for this faculty member." });
        }

        // Find and update the role in roles array
        const role = entry.roles.find(r => r.roleName === roleName);
        if (!role) {
            return res.status(404).json({ success: false, message: `Role '${roleName}' not found in this entry.` });
        }

        role.status = action === "Approve" ? "Approved" : "Rejected";
        role.approvedBy = req.user.userId;
        role.approvalDate = new Date();
        role.remarks = remarks || "";

        // Calculate and update overall status based on active roles
        const activeRoles = entry.roles.filter(r => r.isResponsible);
        const allApproved = activeRoles.every(r => r.status === "Approved");
        const anyRejected = activeRoles.some(r => r.status === "Rejected");
        const anyPending = activeRoles.some(r => r.status === "Pending");

        if (allApproved) {
            entry.status = "Approved";
        } else if (anyPending) {
            entry.status = "Pending";
        } else if (anyRejected) {
            entry.status = "Rejected";
        } else {
            entry.status = "Pending";
        }

        // Keep document-level audit fields updated
        entry.approvedBy = req.user.userId;
        entry.approvalDate = new Date();

        entry.markModified("roles");
        await entry.save();

        const populatedEntry = await FacultyAdministration.findById(entry._id)
            .populate("facultyId", "name institutionId")
            .populate("academicYear", "year")
            .populate("approvedBy", "name")
            .populate("roles.approvedBy", "name");

        res.json({ success: true, data: populatedEntry });

        // Sync appraisal status if rejection (after response sent)
        if (action === "Reject") {
            syncAppraisalOnAdministrationRejection(entry.facultyId, entry.academicYear, [roleName]);
        }
    } catch (err) {
        console.error("HOD Administration Action Role Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
