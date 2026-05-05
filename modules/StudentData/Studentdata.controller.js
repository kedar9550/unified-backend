const mongoose = require("mongoose");
const Student = require("./Studentdata.model");
const Department = require("../academics/department.model");
const Program = require("../academics/program.model");
const Branch = require("../academics/branch.model");
const studentService = require("./student.service");
const csv = require("csv-parser");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const Role = require("../role/role.model");
const UserAppRole = require("../userAppRole/userAppRole.model");

/**
 * Helper to flatten object for MongoDB $set
 */
const flattenObject = (obj, prefix = "") => {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + "." : "";
    if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k]) && !(obj[k] instanceof mongoose.Types.ObjectId)) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

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

    // STRICT PRESERVATION: Dept and Password
    if (existingStudent) {
      // Preserve existing password if it exists
      if (existingStudent.system && existingStudent.system.password) {
        delete transformedData.system.password;
      } else {
        // If existing student somehow has NO password, ensure we set the default
        const salt = await bcrypt.genSalt(10);
        transformedData.system.password = await bcrypt.hash("Aditya@123", salt);
      }

      if (!department && existingStudent.academicInfo && existingStudent.academicInfo.department) {
        transformedData.academicInfo.department = existingStudent.academicInfo.department;
      }
    }

    if (department) {
      const dept = await Department.findById(department);
      if (dept) transformedData.academicInfo.department = dept._id;
    }

    // Check for changes
    let hasChanged = true;
    if (existingStudent) {
      const currentObj = existingStudent.toObject();
      const relevantCurrent = {
        personalInfo: currentObj.personalInfo,
        academicInfo: { ...currentObj.academicInfo, department: transformedData.academicInfo.department },
        contactInfo: currentObj.contactInfo
      };
      const relevantNew = {
        personalInfo: transformedData.personalInfo,
        academicInfo: transformedData.academicInfo,
        contactInfo: transformedData.contactInfo
      };
      hasChanged = JSON.stringify(relevantCurrent) !== JSON.stringify(relevantNew);
    }

    if (hasChanged) {
      const updatePayload = flattenObject(transformedData);
      const student = await Student.findOneAndUpdate(
        { rollNo: formattedRollNo },
        { $set: updatePayload },
        { upsert: true, new: true, runValidators: true }
      );
      await assignStudentRole(student._id);
      return res.status(200).json({ success: true, updated: true, message: "Student updated successfully" });
    }

    res.status(200).json({ success: true, updated: false, message: "Data already up to date" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Sync/Update Student Data
 * Updates existing students from the external API (preserves existing department)
 */
exports.syncStudentData = async (req, res) => {
  let { rollNos } = req.body;

  try {
    if (!rollNos || !Array.isArray(rollNos) || rollNos.length === 0) {
      // If no rollNos provided, fetch all students from DB
      const allStudents = await Student.find({}, "rollNo");
      rollNos = allStudents.map(s => s.rollNo);
    }

    if (rollNos.length === 0) {
      return res.status(200).json({ success: true, updated: false, message: "No students found to sync." });
    }

    // Fetch all departments for auto-mapping
    const departments = await Department.find({});
    const deptMap = {};
    departments.forEach(d => {
      deptMap[d.name.toLowerCase()] = d._id;
      deptMap[d.code.toLowerCase()] = d._id;
    });

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

        // STRICT PRESERVATION: Dept and Password
        if (existingStudent && existingStudent.academicInfo && existingStudent.academicInfo.department) {
          transformedData.academicInfo.department = existingStudent.academicInfo.department;
        } else {
          // If it's a NEW student, try to auto-map from ECAP data if department info is present
          const ecapDept = externalData.deptname || externalData.departmentname || externalData.department;
          if (ecapDept) {
            const mappedDeptId = deptMap[ecapDept.toString().trim().toLowerCase()];
            if (mappedDeptId) {
              transformedData.academicInfo.department = mappedDeptId;
            } else {
              transformedData.academicInfo.department = null;
            }
          } else {
            transformedData.academicInfo.department = null;
          }
        }

        if (existingStudent) {
          if (existingStudent.system && existingStudent.system.password) {
            delete transformedData.system.password;
          } else {
            const salt = await bcrypt.genSalt(10);
            transformedData.system.password = await bcrypt.hash("Aditya@123", salt);
          }
        }

        // Check for changes
        let hasChanged = true;
        if (existingStudent) {
          const currentObj = existingStudent.toObject();
          const relevantCurrent = {
            personalInfo: currentObj.personalInfo,
            academicInfo: { ...currentObj.academicInfo, department: transformedData.academicInfo.department },
            contactInfo: currentObj.contactInfo
          };
          const relevantNew = {
            personalInfo: transformedData.personalInfo,
            academicInfo: transformedData.academicInfo,
            contactInfo: transformedData.contactInfo
          };
          hasChanged = JSON.stringify(relevantCurrent) !== JSON.stringify(relevantNew);
        }

        if (hasChanged) {
          const updatePayload = flattenObject(transformedData);
          const updatedStudent = await Student.findOneAndUpdate(
            { rollNo: formattedRollNo },
            { $set: updatePayload },
            { upsert: true, new: true, runValidators: true }
          );
          await assignStudentRole(updatedStudent._id);
          successCount++;
        } else {
          successCount++; // Count as success but no change
        }
      } catch (err) {
        errors.push({ rollNo, message: err.message });
        skipCount++;
      }
    }

    res.status(200).json({
      success: true,
      updated: successCount > 0,
      message: successCount > 0 ? "Sync Completed!" : "Data already up to date.",
      summary: { success: successCount, failed: skipCount, errors }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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

            const updatePayload = flattenObject(transformedData);
            const updatedStudent = await Student.findOneAndUpdate(
              { rollNo: row.rollNo },
              { $set: updatePayload },
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

exports.bulkUpdateStudentCSV = async (req, res) => {
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

      if (rollNo) {
        csvRows.push({ rollNo: rollNo.trim().toUpperCase() });
      }
    })
    .on("end", async () => {
      try {
        let updatedCount = 0;
        let upToDateCount = 0;
        let skipCount = 0;

        for (const row of csvRows) {
          try {
            const existingStudent = await Student.findOne({ rollNo: row.rollNo });
            if (!existingStudent) {
              errors.push({ rollNo: row.rollNo, message: "Student not found in our database" });
              skipCount++;
              continue;
            }

            const externalData = await studentService.fetchStudentDataFromAPI(row.rollNo);
            if (!externalData) {
              errors.push({ rollNo: row.rollNo, message: "Data not found in external API" });
              skipCount++;
              continue;
            }

            // Transform data (password doesn't matter since we delete it)
            const transformedData = await studentService.transformStudentData(externalData, "dummy");

            // STRICT PRESERVATION: Dept and Password
            if (existingStudent.academicInfo && existingStudent.academicInfo.department) {
              transformedData.academicInfo.department = existingStudent.academicInfo.department;
            }
            if (existingStudent.academicInfo && existingStudent.academicInfo.semester && !transformedData.academicInfo.semester) {
              transformedData.academicInfo.semester = existingStudent.academicInfo.semester;
            }

            if (existingStudent.system && existingStudent.system.password) {
              delete transformedData.system.password;
            } else {
              const salt = await bcrypt.genSalt(10);
              transformedData.system.password = await bcrypt.hash("Aditya@123", salt);
            }

            // Check for changes (simplified check using JSON stringify on relevant parts)
            // We compare personalInfo, academicInfo (excluding dept), and contactInfo
            const currentObj = existingStudent.toObject();
            const relevantCurrent = {
              personalInfo: currentObj.personalInfo,
              academicInfo: { ...currentObj.academicInfo, department: transformedData.academicInfo.department },
              contactInfo: currentObj.contactInfo
            };
            const relevantNew = {
              personalInfo: transformedData.personalInfo,
              academicInfo: transformedData.academicInfo,
              contactInfo: transformedData.contactInfo
            };

            // Deep check would be better, but for speed and simplicity:
            const hasChanged = JSON.stringify(relevantCurrent) !== JSON.stringify(relevantNew);

            if (hasChanged) {
              const updatePayload = flattenObject(transformedData);
              await Student.findOneAndUpdate(
                { rollNo: row.rollNo },
                { $set: updatePayload },
                { runValidators: true }
              );
              updatedCount++;
            } else {
              upToDateCount++;
            }
          } catch (err) {
            errors.push({ rollNo: row.rollNo, message: err.message });
            skipCount++;
          }
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.status(200).json({
          success: true,
          updated: updatedCount > 0,
          message: updatedCount > 0 ? "Update Successful!" : "Data already up to date.",
          summary: {
            total: csvRows.length,
            success: updatedCount,
            upToDate: upToDateCount,
            failed: skipCount,
            errors
          }
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
        { "academicInfo.department": null },
        { "academicInfo.branch": null },
        { "academicInfo.programName": null },
        { 
          $and: [
            { "academicInfo.programName": "Pharma.D" },
            { "academicInfo.yearName": null }
          ]
        },
        {
          $and: [
            { "academicInfo.programName": { $ne: "Pharma.D" } },
            { "academicInfo.semester": null }
          ]
        }
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
  const { studentIds, deptId } = req.body;

  if (!studentIds || !deptId) {
    return res.status(400).json({ success: false, message: "Missing details" });
  }

  try {
    await Student.updateMany(
      { rollNo: { $in: studentIds } },
      {
        "academicInfo.department": deptId
      }
    );

    res.status(200).json({ success: true, message: "Students assigned successfully" });
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
        { "academicInfo.department": null },
        { "academicInfo.branch": null },
        { "academicInfo.programName": null },
        { 
          $and: [
            { "academicInfo.programName": "Pharma.D" },
            { "academicInfo.yearName": null }
          ]
        },
        {
          $and: [
            { "academicInfo.programName": { $ne: "Pharma.D" } },
            { "academicInfo.semester": null }
          ]
        }
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
      "academicInfo.branch": { $ne: null },
      "academicInfo.programName": { $ne: null },
      $or: [
        { "academicInfo.programName": "Pharma.D", "academicInfo.yearName": { $ne: null } },
        { "academicInfo.programName": { $ne: "Pharma.D" }, "academicInfo.semester": { $ne: null } }
      ]
    }).populate("academicInfo.department", "name code").sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Unique Programs, Branches, and Departments for filtering
 */
exports.getFilterOptions = async (req, res) => {
  try {
    console.log("Fetching filter options from master models...");

    const programs = await Program.find({ status: true }, "name").sort("name");
    const branches = await Branch.find({ status: true }, "name").sort("name");
    const departments = await Department.find({ status: true }, "name code").sort("name");

    console.log("Found master programs:", programs.length);
    console.log("Found master branches:", branches.length);
    console.log("Found master depts:", departments.length);

    res.status(200).json({
      success: true,
      data: {
        programs: programs.map(p => p.name),
        branches: [...new Set(branches.map(b => b.name))], // Unique branch names
        departments: departments.map(d => ({ id: d._id, name: d.name, code: d.code }))
      }
    });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
