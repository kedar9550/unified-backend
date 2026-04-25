const Student = require("./Studentdata.model");
const csv = require("csv-parser");
const fs = require("fs");

/**
 * Upload Student CSV and map to new nested schema
 */
exports.uploadStudentCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const studentsData = [];
  const errors = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      const getVal = (prefixes) => {
        const key = Object.keys(data).find(k => 
          prefixes.some(p => k.trim().toLowerCase() === p.toLowerCase())
        );
        return key ? data[key] : null;
      };

      const rollNo = getVal(["Roll No", "rollNo", "RollNo", "Roll_No", "Student ID", "ID"]);
      const name = getVal(["Name", "Student Name", "name", "Full Name"]);

      if (rollNo && name) {
        studentsData.push({
          rollNo: rollNo.trim().toUpperCase(),
          personalInfo: {
            studentName: name.trim(),
          },
          academicInfo: {
            programName: getVal(["Program", "program", "Course"]) || "B.Tech",
            branch: getVal(["Branch", "branch"]) || "General",
            department: getVal(["Dept", "department", "Dept Name"]),
            semester: getVal(["Semester", "sem"]),
            joinedBatch: parseInt(getVal(["Batch", "joinedBatch"])) || new Date().getFullYear(),
            academicBatch: parseInt(getVal(["Academic Batch"])) || new Date().getFullYear(),
            joinedYear: getVal(["Joined Year"]) || new Date().getFullYear().toString(),
            relievedYear: getVal(["Relieved Year"]) || (new Date().getFullYear() + 4).toString(),
            seatType: getVal(["Seat Type"]) || "Convener"
          },
          contactInfo: {
            mobileNumber: getVal(["Phone", "Phone No", "Mobile", "phone"]) || "0000000000",
            emailId: getVal(["Email", "Email ID", "email"]) || `${rollNo.toLowerCase()}@aec.edu.in`
          },
          system: {
            isActive: true,
            password: "Student@123" // Default password
          }
        });
      } else {
        errors.push({ row: data, message: "Missing required fields (Roll No or Name)" });
      }
    })
    .on("end", async () => {
      try {
        let successCount = 0;
        let skipCount = 0;

        for (const sData of studentsData) {
          try {
            await Student.findOneAndUpdate(
              { rollNo: sData.rollNo },
              sData,
              { upsert: true, new: true, runValidators: true }
            );
            successCount++;
          } catch (err) {
            console.error(`Error saving student ${sData.rollNo}:`, err.message);
            skipCount++;
          }
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.status(200).json({
          success: true,
          message: `CSV processed. ${successCount} saved, ${skipCount} skipped.`,
          summary: { total: studentsData.length, success: successCount, skipped: skipCount, errors: errors.length }
        });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });
};

/**
 * Get Unassigned Students
 */
exports.getUnassignedStudents = async (req, res) => {
  try {
    // Unassigned means either dept or semester is missing
    const students = await Student.find({
      $or: [
        { "academicInfo.department": { $exists: false } },
        { "academicInfo.department": null },
        { "academicInfo.department": "" },
        { "academicInfo.semester": { $exists: false } },
        { "academicInfo.semester": null },
        { "academicInfo.semester": "" }
      ]
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Assign Students to Dept and Semester
 */
exports.assignStudents = async (req, res) => {
  const { studentIds, deptId, semester } = req.body;
  if (!studentIds || !deptId || !semester) {
    return res.status(400).json({ success: false, message: "Missing details" });
  }

  try {
    // Assuming deptId is a string name or ID. If it's a name:
    await Student.updateMany(
      { rollNo: { $in: studentIds } },
      { 
        "academicInfo.department": deptId, 
        "academicInfo.semester": semester 
      }
    );
    res.status(200).json({ success: true, message: "Students assigned" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Student
 */
exports.deleteStudent = async (req, res) => {
  try {
    const deleted = await Student.findOneAndDelete({ rollNo: req.params.rollNo });
    if (!deleted) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Unassigned
 */
exports.deleteAllUnassigned = async (req, res) => {
  try {
    const result = await Student.deleteMany({
      $or: [
        { "academicInfo.department": { $exists: false } },
        { "academicInfo.department": null },
        { "academicInfo.department": "" }
      ]
    });
    res.json({ success: true, count: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Assigned Students
 */
exports.getAssignedStudents = async (req, res) => {
  try {
    const students = await Student.find({
      "academicInfo.department": { $ne: null, $ne: "" },
      "academicInfo.semester": { $ne: null, $ne: "" }
    }).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
