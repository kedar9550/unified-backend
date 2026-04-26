const Student = require("./Studentdata.model");
const Department = require("../academics/department.model");
const studentService = require("./student.service");
const csv = require("csv-parser");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Role = require("../role/role.model");
const UserAppRole = require("../userAppRole/userAppRole.model");

const assignStudentRole = async (studentId) => {
  const appName = process.env.APP_NAME || "UNIFIED_SYSTEM";
  const existingRole = await UserAppRole.findOne({ userId: studentId, app: appName });
  if (existingRole) return;

  let defaultRole = await Role.findOne({ name: "STUDENT", app: appName });
  if (!defaultRole) {
      defaultRole = await Role.create({ name: "STUDENT", app: appName, defaultRole: true, description: "Default role for STUDENT" });
  }
  await UserAppRole.create({ userId: studentId, userModel: "Student", app: appName, role: defaultRole._id });
};

/**
 * Add a single student via API
 */
exports.addStudent = async (req, res) => {
  const { rollNo, department } = req.body;
  if (!rollNo) {
    return res.status(400).json({ success: false, message: "rollNo is required" });
  }

  try {
    const formattedRollNo = rollNo.trim().toUpperCase();
    const externalData = await studentService.fetchStudentDataFromAPI(formattedRollNo);
    
    if (!externalData) {
      return res.status(404).json({ success: false, message: `Student data not found in external API for ${formattedRollNo}` });
    }

    const existingStudent = await Student.findOne({ rollNo: formattedRollNo });
    let defaultPassword = "Aditya@123";
    if (!existingStudent) {
      const salt = await bcrypt.genSalt(10);
      defaultPassword = await bcrypt.hash("Aditya@123", salt);
    }

    const transformedData = await studentService.transformStudentData(externalData, defaultPassword);

    if (existingStudent) {
      delete transformedData.system.password;
    }

    if (department) {
      // Find department
      const dept = await Department.findById(department);
      if (dept) {
        transformedData.academicInfo.department = dept._id;
      }
    }

    // Save or update student
    const student = await Student.findOneAndUpdate(
      { rollNo: formattedRollNo },
      transformedData,
      { upsert: true, new: true, runValidators: true }
    );

    await assignStudentRole(student._id);

    res.status(200).json({ success: true, data: student, message: "Student added/updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sync/Update Student Data
 * Updates existing students from the external API (preserves existing department)
 */
exports.syncStudentData = async (req, res) => {
  const { rollNos } = req.body; // Array of roll numbers, if empty sync all (maybe too heavy, let's require rollNos)
  
  if (!rollNos || !Array.isArray(rollNos) || rollNos.length === 0) {
    return res.status(400).json({ success: false, message: "Please provide an array of rollNos to sync" });
  }

  let successCount = 0;
  let skipCount = 0;
  const errors = [];

  for (let rollNo of rollNos) {
    try {
      const formattedRollNo = rollNo.trim().toUpperCase();
      const existingStudent = await Student.findOne({ rollNo: formattedRollNo });
      
      const externalData = await studentService.fetchStudentDataFromAPI(formattedRollNo);
      
      if (!externalData) {
        errors.push({ rollNo, message: "Not found in external API" });
        skipCount++;
        continue;
      }

      let defaultPassword = "Aditya@123";
      if (!existingStudent) {
        const salt = await bcrypt.genSalt(10);
        defaultPassword = await bcrypt.hash("Aditya@123", salt);
      }
      
      const transformedData = await studentService.transformStudentData(externalData, defaultPassword);

      // Preserve existing department if any
      if (existingStudent && existingStudent.academicInfo && existingStudent.academicInfo.department) {
        transformedData.academicInfo.department = existingStudent.academicInfo.department;
      }

      // If it's an update, we should not hash the password again if we are passing the existing one.
      if (existingStudent) {
        delete transformedData.system.password;
      }

      const updatedStudent = await Student.findOneAndUpdate(
        { rollNo: formattedRollNo },
        { $set: transformedData },
        { upsert: true, new: true, runValidators: true }
      );
      
      await assignStudentRole(updatedStudent._id);
      successCount++;
    } catch (err) {
      errors.push({ rollNo, message: err.message });
      skipCount++;
    }
  }

  res.status(200).json({
    success: true,
    message: `Sync completed. ${successCount} updated, ${skipCount} failed.`,
    summary: { success: successCount, failed: skipCount, errors }
  });
};

/**
 * Upload Student CSV and fetch from API
 */
exports.uploadStudentCSV = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const csvRows = [];
  const errors = [];

  // Parse CSV
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
      const departmentName = getVal(["Dept", "department", "Dept Name", "Department Name"]);

      if (rollNo) {
        csvRows.push({
          rollNo: rollNo.trim().toUpperCase(),
          departmentName: departmentName ? departmentName.trim() : null
        });
      } else {
        errors.push({ row: data, message: "Missing Roll No" });
      }
    })
    .on("end", async () => {
      try {
        let successCount = 0;
        let skipCount = 0;

        // Fetch all departments for quick lookup
        const departments = await Department.find({});
        const deptMap = {};
        departments.forEach(d => {
          deptMap[d.name.toLowerCase()] = d._id;
          deptMap[d.code.toLowerCase()] = d._id;
        });

        for (const row of csvRows) {
          try {
            const externalData = await studentService.fetchStudentDataFromAPI(row.rollNo);
            
            if (!externalData) {
              errors.push({ rollNo: row.rollNo, message: "Data not found in external API" });
              skipCount++;
              continue;
            }

            const existingStudent = await Student.findOne({ rollNo: row.rollNo });
            
            let defaultPassword = "Aditya@123";
            if (!existingStudent) {
              const salt = await bcrypt.genSalt(10);
              defaultPassword = await bcrypt.hash("Aditya@123", salt);
            }

            const transformedData = await studentService.transformStudentData(externalData, defaultPassword);

            // Assign department if it exists in CSV and matches DB
            if (row.departmentName) {
              const deptId = deptMap[row.departmentName.toLowerCase()];
              if (deptId) {
                transformedData.academicInfo.department = deptId;
              } else {
                transformedData.academicInfo.department = null; // Do NOT throw error for missing department
              }
            } else {
              transformedData.academicInfo.department = null;
            }

            if (existingStudent) {
              delete transformedData.system.password;
            }

            const updatedStudent = await Student.findOneAndUpdate(
              { rollNo: row.rollNo },
              { $set: transformedData },
              { upsert: true, new: true, runValidators: true }
            );
            await assignStudentRole(updatedStudent._id);
            successCount++;
          } catch (err) {
            errors.push({ rollNo: row.rollNo, message: err.message });
            skipCount++;
          }
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.status(200).json({
          success: true,
          message: `CSV processed. ${successCount} saved, ${skipCount} failed.`,
          summary: { total: csvRows.length, success: successCount, failed: skipCount, errors }
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
    const students = await Student.find({
      $or: [
        { "academicInfo.department": { $exists: false } },
        { "academicInfo.department": null },
        { "academicInfo.semester": { $exists: false } },
        { "academicInfo.semester": null }
      ]
    }).populate("academicInfo.department", "name code").sort({ createdAt: -1 });
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
    await Student.updateMany(
      { rollNo: { $in: studentIds } },
      { 
        "academicInfo.department": deptId, 
        "academicInfo.semester": Number(semester)
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
      "academicInfo.department": { $ne: null },
      "academicInfo.semester": { $ne: null }
    }).populate("academicInfo.department", "name code").sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
