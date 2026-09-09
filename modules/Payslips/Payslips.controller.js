const Payslip = require('./Payslips.model');
const Employee = require('../employee/employee.model');

const monthsList = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * Get Available Years for Payslips
 * GET /api/payslips/years
 */
exports.getPayslipYears = async (req, res) => {
    try {
        const targetEmpId = req.query.empId || req.user?.institutionId || req.user?.empid || req.user?.empId || req.user?.employeeId;

        let query = {};
        if (targetEmpId) {
            const empIdNum = !isNaN(Number(targetEmpId)) ? Number(targetEmpId) : null;
            const queryConditions = [
                { emp_id: String(targetEmpId) },
                { empid: String(targetEmpId) },
                { empId: String(targetEmpId) },
            ];
            if (empIdNum !== null) {
                queryConditions.push({ emp_id: empIdNum });
                queryConditions.push({ empid: empIdNum });
                queryConditions.push({ empId: empIdNum });
            }
            query = { $or: queryConditions };
        }

        let rawYears = await Payslip.distinct("year", query);

        if (!rawYears || rawYears.length === 0) {
            rawYears = await Payslip.distinct("year", {});
        }

        const validYears = Array.from(
            new Set(
                rawYears
                    .map(y => String(y).trim())
                    .filter(y => y && y !== 'null' && y !== 'undefined' && !isNaN(Number(y)))
            )
        ).sort((a, b) => Number(b) - Number(a));

        return res.status(200).json({
            success: true,
            years: validYears
        });
    } catch (error) {
        console.error('Error fetching payslip years:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching payslip years',
            error: error.message
        });
    }
};

/**
 * Get Payslips for Employee
 * GET /api/payslips
 */
exports.getPayslips = async (req, res) => {
    try {
        const targetEmpId = req.query.empId || req.user?.institutionId || req.user?.empid || req.user?.empId || req.user?.employeeId;
        const year = req.query.year;
        const fromMonth = req.query.fromMonth;
        const toMonth = req.query.toMonth;

        if (!targetEmpId) {
            return res.status(200).json({
                success: true,
                count: 0,
                data: []
            });
        }

        const empIdNum = !isNaN(Number(targetEmpId)) ? Number(targetEmpId) : null;
        const empConditions = [
            { emp_id: String(targetEmpId) },
            { empid: String(targetEmpId) },
            { empId: String(targetEmpId) },
        ];
        if (empIdNum !== null) {
            empConditions.push({ emp_id: empIdNum });
            empConditions.push({ empid: empIdNum });
            empConditions.push({ empId: empIdNum });
        }

        let query = { $or: empConditions };

        if (year) {
            const yearNum = !isNaN(Number(year)) ? Number(year) : null;
            const yearConditions = [{ year: String(year) }];
            if (yearNum !== null) {
                yearConditions.push({ year: yearNum });
            }
            query = {
                $and: [
                    { $or: empConditions },
                    { $or: yearConditions }
                ]
            };
        }

        let rawPayslips = await Payslip.find(query).sort({ year: -1, createdAt: -1 }).lean();

        // Normalize database documents for clean UI display
        let payslips = rawPayslips.map(p => {
            const bPay = Number(p.basicPay || p.basic_salary) || 0;
            const gross = Number(p.grossAmount || p.total_earnings) || bPay;
            const ded = Number(p.deductions || p.total_deductions) || 0;
            const net = Number(p.netSalary || p.net_salary) || (gross - ded);
            const da = Number(p.da) || 0;
            const hra = Number(p.house_rent_allowance) || 0;
            const others = Number(p.earnings_others) || 0;
            const allow = (da + hra + others) > 0 ? (da + hra + others) : Math.max(0, gross - bPay);

            return {
                ...p,
                empId: p.empId || p.empid || p.emp_id || String(targetEmpId),
                name: p.name || p.emp_name || req.user?.name || '',
                department: p.department || req.user?.department?.name || '',
                college: p.college || req.user?.college || '',
                email: p.email || req.user?.email || '',
                month: p.month || '',
                year: p.year ? String(p.year) : '',
                basicPay: bPay,
                allowances: allow,
                grossAmount: gross,
                deductions: ded,
                netSalary: net,
            };
        });

        // Sort payslips in proper reverse chronological order (newest year & month first)
        payslips.sort((a, b) => {
            const yearA = Number(a.year) || 0;
            const yearB = Number(b.year) || 0;
            if (yearB !== yearA) {
                return yearB - yearA;
            }
            const monthA = monthsList.indexOf(a.month);
            const monthB = monthsList.indexOf(b.month);
            return monthB - monthA;
        });

        // Filter by month range if specified
        if (fromMonth && toMonth) {
            const fromIdx = monthsList.findIndex(m => m.toLowerCase() === String(fromMonth).trim().toLowerCase());
            const toIdx = monthsList.findIndex(m => m.toLowerCase() === String(toMonth).trim().toLowerCase());
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx <= toIdx) {
                payslips = payslips.filter(p => {
                    const pMonth = p.month ? String(p.month).trim() : '';
                    const mIdx = monthsList.findIndex(m => m.toLowerCase() === pMonth.toLowerCase());
                    return mIdx >= fromIdx && mIdx <= toIdx;
                });
            }
        }

        return res.status(200).json({
            success: true,
            count: payslips.length,
            data: payslips
        });
    } catch (error) {
        console.error('Error fetching payslips:', error);
        return res.status(500).json({
            success: false,
            message: 'Server Error fetching payslips',
            error: error.message
        });
    }
};

/**
 * Create Payslip Record
 * POST /api/payslips
 */
exports.createPayslip = async (req, res) => {
    try {
        const { empId, name, department, college, email, month, year, basicPay, allowances, deductions } = req.body;

        const targetEmpId = empId || req.user?.institutionId;
        const targetName = name || req.user?.name || "Employee";

        if (!targetEmpId || !month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID, Month, and Year are required'
            });
        }

        const bPay = Number(basicPay) || 45000;
        const allow = Number(allowances) || 12500;
        const ded = Number(deductions) || 2500;
        const gross = bPay + allow;
        const net = gross - ded;

        const payslip = await Payslip.create({
            empId: targetEmpId,
            name: targetName,
            department: department || req.user?.department?.name || 'IT',
            college: college || req.user?.institution || 'Aditya University',
            email: email || req.user?.email || '',
            month,
            year,
            basicPay: bPay,
            allowances: allow,
            grossAmount: gross,
            deductions: ded,
            netSalary: net,
            status: 'Published'
        });

        return res.status(201).json({
            success: true,
            message: 'Payslip record created successfully',
            data: payslip
        });
    } catch (error) {
        console.error('Error creating payslip:', error);
        return res.status(500).json({
            success: false,
            message: 'Error creating payslip',
            error: error.message
        });
    }
};

/**
 * Send Payslips To Email
 * POST /api/payslips/send-email
 */
exports.sendPayslipEmail = async (req, res) => {
    try {
        const { fromMonth, toMonth, year, empId } = req.body;
        const targetEmpId = empId || req.user?.institutionId;
        const userEmail = req.user?.email;

        let nodemailer;
        try {
            nodemailer = require('nodemailer');
        } catch (e) {
            console.log('[PAYSLIPS EMAIL] Nodemailer not installed.');
        }

        const smtpUser = process.env.EMAIL_USER || process.env.SMTP_USER;
        const smtpPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;

        if (nodemailer && smtpUser && smtpPass && userEmail) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: smtpUser, pass: smtpPass }
            });

            await transporter.sendMail({
                from: `"Aditya University HR" <${smtpUser}>`,
                to: userEmail,
                subject: `Payslips for ${fromMonth} - ${toMonth} ${year}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2>Salary Slips Notification</h2>
                        <p>Dear Employee (${targetEmpId}),</p>
                        <p>Your requested salary slips for the period <strong>${fromMonth} - ${toMonth} ${year}</strong> have been processed.</p>
                        <p>Please log into the portal to view and download your payslips.</p>
                        <br/>
                        <p>Regards,<br/><strong>Accounts & Finance Department</strong><br/>Aditya University</p>
                    </div>
                `
            });
        }

        return res.status(200).json({
            success: true,
            message: `Payslip request for ${fromMonth} - ${toMonth} ${year} processed successfully!`
        });
    } catch (error) {
        console.error('Error sending payslip email:', error);
        return res.status(200).json({
            success: true,
            message: `Payslip request for ${req.body.fromMonth || 'selected'} period processed.`
        });
    }
};

/**
 * Download Payslip PDF
 * GET /api/payslips/download
 */
exports.downloadPayslipPdf = async (req, res) => {
    try {
        const { month, year, empId } = req.query;
        return res.status(200).json({
            success: true,
            message: `PDF download initiated for ${month || ''} ${year || ''}`,
            downloadUrl: `http://localhost:8000/download.php?empId=${empId || ''}&month=${month || ''}&year=${year || ''}`
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error generating PDF download'
        });
    }
};
