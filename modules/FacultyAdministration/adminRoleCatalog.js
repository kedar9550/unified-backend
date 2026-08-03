const ADMIN_ROLE_CATALOG = [
    { roleId: 'dean', label: 'Dean', category: 'Direct', pointsGroup: 'dean', allowedLevels: ['Central'] },
    { roleId: 'assoc_dean', label: 'Associate Dean', category: 'Direct', pointsGroup: 'dean', allowedLevels: ['Central'] },
    { roleId: 'coe', label: 'Controller of Examinations (CoE)', category: 'Direct', pointsGroup: 'dean', allowedLevels: ['Central'] },
    { roleId: 'hod', label: 'Head of the Department', category: 'Direct', pointsGroup: 'hod', allowedLevels: ['Central', 'Department'] },
    { roleId: 'dy_coe', label: 'Deputy CoE', category: 'Direct', pointsGroup: 'hod', allowedLevels: ['Central', 'Department'] },
    { roleId: 'univ_office_coord', label: 'Coordinator (University Office)', category: 'Direct', pointsGroup: 'hod', allowedLevels: ['Central', 'Department'] },
    { roleId: 'dy_hod', label: 'Deputy HoD', category: 'Direct', pointsGroup: 'dyHod', allowedLevels: ['Department'] },
    { roleId: 'dept_exam_cell', label: 'Dept. Exam Cell Incharge', category: 'Direct', pointsGroup: 'dyHod', allowedLevels: ['Department'] },
    { roleId: 'timetable_coord', label: 'Time Table Coordinator', category: 'Coordinator', pointsGroup: 'timetable', allowedLevels: ['Department'] },
    { roleId: 'project_coord', label: 'Project Coordinator', category: 'Coordinator', pointsGroup: 'timetable', allowedLevels: ['Department'] },
    { roleId: 'curriculum_coord', label: 'Curriculum Coordinator', category: 'Coordinator', pointsGroup: 'timetable', allowedLevels: ['Department'] },
    { roleId: 'placement_coord', label: 'Placement Coordinator', category: 'Coordinator', pointsGroup: 'placement', allowedLevels: ['Central', 'Department'] },
    { roleId: 'internship_coord', label: 'Internship Coordinator', category: 'Coordinator', pointsGroup: 'placement', allowedLevels: ['Central', 'Department'] },
    { roleId: 'alumni_coord', label: 'Alumni Coordinator', category: 'Coordinator', pointsGroup: 'placement', allowedLevels: ['Central', 'Department'] },
    { roleId: 'coursera_coord', label: 'Coursera Coordinator', category: 'Coordinator', pointsGroup: 'coursera', allowedLevels: ['Central', 'Department'] },
    { roleId: 'linkedin_coord', label: 'LinkedIn Coordinator', category: 'Coordinator', pointsGroup: 'coursera', allowedLevels: ['Central', 'Department'] },
    { roleId: 'ala_coord', label: 'ALA Coordinator', category: 'Coordinator', pointsGroup: 'coursera', allowedLevels: ['Central', 'Department'] },
    { roleId: 'edc_coord', label: 'EDC Coordinator', category: 'Coordinator', pointsGroup: 'edc', allowedLevels: ['Central', 'Department'] },
    { roleId: 'iic_coord', label: 'IIC Coordinator', category: 'Coordinator', pointsGroup: 'edc', allowedLevels: ['Central', 'Department'] },
    { roleId: 'iqac_coord', label: 'IQAC Coordinator', category: 'Coordinator', pointsGroup: 'edc', allowedLevels: ['Central', 'Department'] },
    { roleId: 'course_coord', label: 'Course Coordinator', category: 'Coordinator', pointsGroup: 'course', allowedLevels: ['Department'] },
    { roleId: 'website_coord', label: 'Website Coordinator', category: 'Coordinator', pointsGroup: 'website', allowedLevels: ['Central'] },
    { roleId: 'nss_coord', label: 'NSS Coordinator', category: 'Coordinator', pointsGroup: 'nss', allowedLevels: ['Central', 'Department'] },
    { roleId: 'clubs_coord', label: 'Clubs Coordinator', category: 'Coordinator', pointsGroup: 'nss', allowedLevels: ['Central', 'Department'] },
    { roleId: 'prof_chapters_coord', label: 'Professional Chapters Coordinator', category: 'Coordinator', pointsGroup: 'nss', allowedLevels: ['Central', 'Department'] },
    { roleId: 'training_coord', label: 'Training Program Coordinator (Smart Interviews / GPP / etc.)', category: 'Coordinator', pointsGroup: 'training', allowedLevels: ['Central', 'Department'] },
    { roleId: 'drc_coord', label: 'DRC Coordinator', category: 'Coordinator', pointsGroup: 'drc', allowedLevels: ['Department'] },
    { roleId: 'research_coord', label: 'Research Coordinator', category: 'Coordinator', pointsGroup: 'drc', allowedLevels: ['Department'] },
    { roleId: 'antiragging_coord', label: 'Anti-Ragging Committee Coordinator', category: 'Coordinator', pointsGroup: 'antiRagging', allowedLevels: ['Central', 'Department'] },
    { roleId: 'other_coord', label: 'Other Coordinator', category: 'Coordinator', pointsGroup: 'other', allowedLevels: ['Central', 'Department'] },
    { roleId: 'other', label: 'Any other remarkable event / activity coordinator', category: 'Other', pointsGroup: 'other', allowedLevels: ['Central', 'Department'] }
];

const POINTS_TABLE = {
    dean: { Central: 20 },
    hod: { Central: 15, Dept: 15 },
    dyHod: { Dept: 10 },
    timetable: { Dept: 10 },
    placement: { Central: 10, Dept: 10 },
    coursera: { Central: 10, Dept: 5 },
    edc: { Central: 10, Dept: 5 },
    course: { Dept: 5 },
    website: { Central: 10 },
    nss: { Central: 10, Dept: 5 },
    training: { Central: 10, Dept: 5 },
    drc: { Dept: 5 },
    antiRagging: { Central: 5, Dept: 3 },
    other: { Central: 10, Dept: 5 }
};

const ASSIGNED_BY_OPTIONS = ["Registrar", "HOD", "Others"];

module.exports = {
    ADMIN_ROLE_CATALOG,
    POINTS_TABLE,
    ASSIGNED_BY_OPTIONS
};
