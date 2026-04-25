const StudentData = require("./Studentdata.model");
const csv = require("csv-parser");
const fs = require("fs");

// Upload Student CSV
exports.uploadStudentCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const students = [];
  const errors = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      // Robust normalization of keys
      const getVal = (prefixes) => {
        const key = Object.keys(data).find(k => 
          prefixes.some(p => k.trim().toLowerCase() === p.toLowerCase())
        );
        return key ? data[key] : null;
      };

      const student = {
        rollNo: getVal(["Roll No", "rollNo", "RollNo", "Roll_No", "Student ID", "ID"]),
        name: getVal(["Name", "Student Name", "name", "Full Name"]),
        dept: getVal(["Dept", "department", "Dept Name"]),
        email: getVal(["Email", "Email ID", "email"]),
        phone: getVal(["Phone", "Phone No", "Mobile", "phone"]),
        branch: getVal(["Branch", "branch"]),
        program: getVal(["Program", "program", "Course"]),
      };

      if (student.rollNo && student.name) {
        students.push(student);
      } else {
        errors.push({ row: data, message: "Missing required fields (Roll No or Name)" });
      }
    })
    .on("end", async () => {
      try {
        let successCount = 0;
        let skipCount = 0;

        for (const student of students) {
          try {
            await StudentData.findOneAndUpdate(
              { rollNo: student.rollNo },
              student,
              { upsert: true, new: true }
            );
            successCount++;
          } catch (err) {
            console.error(`Error saving student ${student.rollNo}:`, err);
            skipCount++;
          }
        }

        // Clean up temporary file
        fs.unlinkSync(req.file.path);

        res.status(200).json({
          success: true,
          message: `CSV processed successfully. ${successCount} records saved/updated, ${skipCount} skipped.`,
          summary: {
            total: students.length,
            success: successCount,
            skipped: skipCount,
            errors: errors.length
          }
        });
      } catch (error) {
        console.error("CSV processing failed:", error);
        res.status(500).json({ success: false, message: "Internal server error during CSV processing" });
      }
    });
};

// Get Unassigned Students
exports.getUnassignedStudents = async (req, res) => {
  try {
    const students = await StudentData.find({ status: "unassigned" }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    console.error("Failed to fetch unassigned students:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Assign Students to Department and Semester
exports.assignStudents = async (req, res) => {
  const { studentIds, deptId, semester } = req.body;

  if (!studentIds || !deptId || !semester) {
    return res.status(400).json({ success: false, message: "Missing assignment details" });
  }

  try {
    await StudentData.updateMany(
      { rollNo: { $in: studentIds } },
      { 
        assignedDept: deptId, 
        semester: semester,
        status: "assigned"
      }
    );

    res.status(200).json({ success: true, message: "Students assigned successfully" });
  } catch (error) {
    console.error("Assignment failed:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete Student
exports.deleteStudent = async (req, res) => {
  const { rollNo } = req.params;

  try {
    const deleted = await StudentData.findOneAndDelete({ rollNo });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    res.status(200).json({ success: true, message: "Student record deleted successfully" });
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Delete All Unassigned Students
exports.deleteAllUnassigned = async (req, res) => {
  try {
    const result = await StudentData.deleteMany({ status: "unassigned" });
    res.status(200).json({ 
      success: true, 
      message: `${result.deletedCount} unassigned records deleted successfully` 
    });
  } catch (error) {
    console.error("Bulk delete failed:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Get Assigned Students
exports.getAssignedStudents = async (req, res) => {
  try {
    const students = await StudentData.find({ status: "assigned" })
      .populate("assignedDept", "name")
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    console.error("Failed to fetch assigned students:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
