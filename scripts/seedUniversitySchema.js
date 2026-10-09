const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const YEAR = { bsonType: "string", pattern: "^\\d{4}-\\d{2}$", description: "e.g. 2025-26" };
const STR = { bsonType: "string" };
const NUM = (min, max) => ({ bsonType: "number", minimum: min, maximum: max });
const PCT = NUM(0, 100);
const SEM = { enum: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] };
const AUDIT = {
  created_by: STR,
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};

async function ensureCollection(db, name, schema, indexes) {
  const opts = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
  const collections = await db.listCollections({ name }).toArray();
  
  if (collections.length > 0) {
    try {
      await db.command({ collMod: name, ...opts });
    } catch (err) {
      console.warn(`Warning updating collMod for ${name}: ${err.message}`);
    }
  } else {
    await db.createCollection(name, opts);
  }

  const coll = db.collection(name);
  for (const [keys, o] of indexes) {
    try {
      await coll.createIndex(keys, o || {});
    } catch (err) {
      // ignore index already exists with different options error in dev
      if (err.code !== 85 && err.code !== 86) {
        console.warn(`Index note for ${name}: ${err.message}`);
      }
    }
  }
  console.log(`[Schema Init] Ensured collection & indexes for: ${name}`);
}

async function seedDatabase() {
  try {
    const mongoUri = process.env.UnifiedDb || 'mongodb://127.0.0.1:27017/unifieddb';
    console.log(`Connecting to MongoDB...`);
    const conn = await mongoose.connect(mongoUri);
    const db = conn.connection.db;

    // 1. form_types
    await ensureCollection(db, "form_types", {
      bsonType: "object",
      required: ["code", "name", "kind"],
      properties: {
        code: STR, name: STR,
        kind: { enum: ["activity", "separate"] },
        collection: STR,
        group: STR,
        is_active: { bsonType: "bool" },
      },
    }, [
      [{ code: 1 }, { unique: true, name: "uq_code" }],
    ]);

    // 2. academic_activities
    await ensureCollection(db, "academic_activities", {
      bsonType: "object",
      required: ["form_type", "academic_year", "department", "dedupe_key", "created_at"],
      properties: {
        form_type: { enum: ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.13", "2.14", "2.15", "2.16", "2.17", "2.18", "2.19", "2.20", "2.21"] },
        form_name: STR,
        academic_year: YEAR,
        department: STR,
        title: STR,
        resource_person: STR,
        faculty_name: STR, faculty_emp_id: STR,
        recipient_type: { enum: ["Faculty", "Student"] },
        recipient_name: STR, designation_or_roll: STR,
        level: { enum: ["Institution", "District", "State", "National", "International"] },
        awarding_body: STR,
        start_date: { bsonType: "date" },
        end_date: { bsonType: "date" },
        participants: NUM(0, 100000),
        remarks: STR,
        extra: { bsonType: "object" },
        dedupe_key: { bsonType: "string" },
        ...AUDIT,
      },
    }, [
      [{ dedupe_key: 1 }, { unique: true, name: "uq_dedupe" }],
      [{ form_type: 1, academic_year: 1, department: 1, start_date: -1 }, { name: "ix_list" }],
      [{ academic_year: 1, department: 1 }, { name: "ix_year_dept" }],
      [{ faculty_emp_id: 1, academic_year: 1 }, { name: "ix_faculty", partialFilterExpression: { faculty_emp_id: { $exists: true } } }],
      [{ recipient_type: 1, recipient_name: 1 }, { name: "ix_awards", partialFilterExpression: { recipient_type: { $exists: true } } }],
    ]);

    // 3. students (2.1)
    await ensureCollection(db, "students", {
      bsonType: "object",
      required: ["academic_year", "student_name", "roll_number", "department", "created_at"],
      properties: {
        academic_year: YEAR, student_name: STR, roll_number: STR,
        program: STR, department: STR,
        gender: { enum: ["Male", "Female", "Other"] },
        social_category: { enum: ["General", "SC", "ST", "OBC"] },
        country: STR, state: STR, district: STR,
        degree: { enum: ["UG", "PG", "Ph.D."] },
        enrolment_type: { enum: ["Regular", "Part-time"] },
        ...AUDIT,
      },
    }, [
      [{ academic_year: 1, roll_number: 1 }, { unique: true, name: "uq_year_roll" }],
      [{ roll_number: 1 }, { name: "ix_roll" }],
      [{ academic_year: 1, department: 1, program: 1 }, { name: "ix_dept_program" }],
      [{ academic_year: 1, social_category: 1, gender: 1 }, { name: "ix_demographics" }],
    ]);

    // 4. mentor_allocations (2.2)
    await ensureCollection(db, "mentor_allocations", {
      bsonType: "object",
      required: ["academic_year", "department", "mentor_name", "mentee_name", "created_at"],
      properties: {
        academic_year: YEAR, department: STR, program: STR,
        year: { enum: ["1", "2", "3", "4"] }, semester: SEM,
        mentor_name: STR, mentor_emp_id: STR,
        mentee_name: STR, roll_number: STR,
        remarks: STR,
        ...AUDIT,
      },
    }, [
      [{ academic_year: 1, program: 1, semester: 1, roll_number: 1 }, { unique: true, name: "uq_mentee_sem", partialFilterExpression: { roll_number: { $exists: true } } }],
      [{ mentor_name: 1, academic_year: 1 }, { name: "ix_mentor" }],
      [{ academic_year: 1, department: 1 }, { name: "ix_year_dept" }],
    ]);

    // 5. tlp_feedback (2.3)
    await ensureCollection(db, "tlp_feedback", {
      bsonType: "object",
      required: ["academic_year", "department", "faculty_name", "course_name", "created_at"],
      properties: {
        academic_year: YEAR, department: STR, program: STR,
        faculty_name: STR, faculty_emp_id: STR,
        course_name: STR, semester: SEM, class_section: STR,
        feedback_percent: PCT,
        ...AUDIT,
      },
    }, [
      [{ academic_year: 1, department: 1, program: 1, semester: 1, class_section: 1, course_name: 1, faculty_name: 1 }, { unique: true, name: "uq_feedback" }],
      [{ faculty_name: 1, academic_year: 1 }, { name: "ix_faculty" }],
    ]);

    // 6. result_analysis (2.4)
    await ensureCollection(db, "result_analysis", {
      bsonType: "object",
      required: ["academic_year", "department", "level", "year_of_study", "batch", "created_at"],
      properties: {
        academic_year: YEAR, department: STR,
        level: { enum: ["UG", "PG"] },
        year_of_study: { enum: ["1st year", "2nd year", "3rd year", "Final year"] },
        batch: YEAR,
        pass_sem1: PCT, pass_sem2: PCT, pass_sem3: PCT, pass_sem4: PCT,
        pass_sem5: PCT, pass_sem6: PCT, pass_sem7: PCT, pass_sem8: PCT,
        ...AUDIT,
      },
    }, [
      [{ academic_year: 1, department: 1, level: 1, year_of_study: 1, batch: 1 }, { unique: true, name: "uq_result" }],
      [{ batch: 1, level: 1 }, { name: "ix_batch" }],
    ]);

    // 7. student_publications (2.12)
    await ensureCollection(db, "student_publications", {
      bsonType: "object",
      required: ["academic_year", "department", "students", "paper_title", "created_at"],
      properties: {
        academic_year: YEAR, department: STR,
        students: {
          bsonType: "array", minItems: 1,
          items: { bsonType: "object", required: ["name"], properties: { name: STR, roll_number: STR } },
        },
        semester: SEM,
        paper_title: STR, journal_conference: STR,
        publication_year: NUM(1990, 2100),
        vol_issue_page: STR,
        doi: STR,
        ...AUDIT,
      },
    }, [
      [{ doi: 1 }, { unique: true, name: "uq_doi", partialFilterExpression: { doi: { $type: "string" } } }],
      [{ academic_year: 1, department: 1 }, { name: "ix_year_dept" }],
      [{ "students.roll_number": 1 }, { name: "ix_student_roll" }],
    ]);

    // 8. research_supervisors (2.22)
    await ensureCollection(db, "research_supervisors", {
      bsonType: "object",
      required: ["emp_id", "supervisor_name", "created_at"],
      properties: {
        emp_id: STR, supervisor_name: STR, designation: STR, department: STR,
        scholars: {
          bsonType: "array",
          items: {
            bsonType: "object", required: ["name"],
            properties: { name: STR, year: NUM(1990, 2100), university: STR, title: STR },
          },
        },
        ...AUDIT,
      },
    }, [
      [{ emp_id: 1 }, { unique: true, name: "uq_emp" }],
      [{ department: 1, supervisor_name: 1 }, { name: "ix_dept_name" }],
    ]);

    // Helper for forms 1, 3-6
    const DATE = { bsonType: "date" };
    const YN = { enum: ["Yes", "No"] };
    const MON = { bsonType: "string", pattern: "^\\d{4}-\\d{2}$" };
    const YOS = { enum: ["1st year", "2nd year", "3rd year", "Final year"] };
    const LEVEL = { enum: ["UG", "PG", "PhD"] };
    const mk = (name, required, props, indexes) =>
      ensureCollection(db, name, { bsonType: "object", required: [...required, "created_at"], properties: { ...props, ...AUDIT } }, indexes);
    const U = (keys, name) => [keys, { unique: true, name }];
    const I = (keys, name) => [keys, { name }];
    const UP = (field, name) => [{ [field]: 1 }, { unique: true, name, partialFilterExpression: { [field]: { $type: "string" } } }];

    // Admissions
    await mk("admission_intake", ["academic_year", "program", "branch", "level"], {
      academic_year: YEAR, program: STR, branch: STR, level: LEVEL, duration: STR,
      intake: NUM(0, 100000), male: NUM(0, 100000), female: NUM(0, 100000),
      total: NUM(0, 200000), enroll_pct: NUM(0, 1000), remarks: STR,
    }, [U({ academic_year: 1, program: 1, branch: 1, level: 1 }, "uq_intake"), I({ academic_year: 1, level: 1 }, "ix_year_level")]);

    await mk("seat_earmarked", ["program", "branch"], {
      program: STR, branch: STR,
      general: NUM(0, 100000), sc: NUM(0, 100000), st: NUM(0, 100000), obc: NUM(0, 100000),
      total: NUM(0, 400000), ews: NUM(0, 100000),
    }, [U({ program: 1, branch: 1 }, "uq_program_branch")]);

    const CATK = ["oc", "bca", "bcb", "bcc", "bcd", "bce", "sc", "st"];
    const seatProps = {};
    [...CATK.flatMap(k => [k + "_m", k + "_f"]), "total_m", "total_f"].forEach(k => (seatProps[k] = NUM(0, 100000)));
    await mk("seat_admitted", ["academic_year", "program", "branch"],
      { academic_year: YEAR, program: STR, branch: STR, ...seatProps },
      [U({ academic_year: 1, program: 1, branch: 1 }, "uq_seat_admitted")]);

    await mk("rank_analysis", ["program", "branch"], {
      program: STR, branch: STR, opening_rank: NUM(1, 10000000), closing_rank: NUM(1, 10000000),
    }, [U({ program: 1, branch: 1 }, "uq_program_branch")]);

    // Research & Consultancy
    await mk("seed_money", ["academic_year", "title"], {
      academic_year: YEAR, department: STR, pi_copi: STR, title: STR, interdisciplinary: YN,
      major_equipment: STR, equipment_cost: NUM(0, 1e10), project_cost: NUM(0, 1e10),
    }, [U({ academic_year: 1, department: 1, title: 1 }, "uq_seed"), I({ academic_year: 1, department: 1 }, "ix_year_dept")]);

    await mk("research_facilities", ["academic_year", "lab", "equipment"], {
      academic_year: YEAR, lab: STR, equipment: STR, features: STR, cost: NUM(0, 1e10),
    }, [U({ academic_year: 1, lab: 1, equipment: 1 }, "uq_facility"), I({ lab: 1 }, "ix_lab")]);

    await mk("research_grants", ["academic_year", "pi", "title"], {
      academic_year: YEAR, pi: STR, co_pi: STR, title: STR, funding_agency: STR,
      status: { enum: ["Applied", "Granted"] }, submission_date: DATE, ack_no: STR,
    }, [UP("ack_no", "uq_ack_no"), I({ academic_year: 1, status: 1 }, "ix_year_status"), I({ pi: 1, academic_year: 1 }, "ix_pi")]);

    await mk("research_guides", ["academic_year", "emp_id", "guide_name"], {
      academic_year: YEAR, department: STR, emp_id: STR, guide_name: STR, designation: STR,
      scholars: { bsonType: "array", items: { bsonType: "object", required: ["name"], properties: { name: STR, year: NUM(1990, 2100), university: STR, title: STR } } },
    }, [U({ academic_year: 1, emp_id: 1 }, "uq_year_emp"), I({ department: 1 }, "ix_dept")]);

    await mk("research_workshops", ["academic_year", "title"], {
      academic_year: YEAR, title: STR, start_date: DATE, end_date: DATE, resource_person: STR, participants: NUM(0, 100000),
    }, [U({ academic_year: 1, title: 1, start_date: 1 }, "uq_workshop")]);

    await mk("research_publications", ["form_type", "academic_year", "faculty_name", "article"], {
      form_type: { enum: ["3.6", "3.7"] }, form_name: STR, academic_year: YEAR, faculty_name: STR, article: STR,
    }, [I({ academic_year: 1, form_type: 1, faculty_name: 1 }, "ix_list"), I({ faculty_name: 1 }, "ix_faculty"), I({ article: "text" }, "tx_article")]);

    await mk("books_chapters", ["academic_year", "faculty_name", "title"], {
      academic_year: YEAR, faculty_name: STR, authors: STR, title: STR, publisher: STR, isbn: STR, scopus_indexed: YN,
    }, [UP("isbn", "uq_isbn"), I({ academic_year: 1, faculty_name: 1 }, "ix_year_faculty")]);

    await mk("consultancy_facilities", ["academic_year", "facility"], {
      academic_year: YEAR, facility: STR, details: STR,
    }, [U({ academic_year: 1, facility: 1 }, "uq_facility")]);

    await mk("consultancy_projects", ["academic_year", "faculty_name", "title"], {
      academic_year: YEAR, faculty_name: STR, title: STR, organization: STR, amount: NUM(0, 1e10),
    }, [U({ academic_year: 1, faculty_name: 1, title: 1 }, "uq_project"), I({ organization: 1 }, "ix_org")]);

    await mk("consultancy_training", ["academic_year", "faculty_name", "title"], {
      academic_year: YEAR, faculty_name: STR, title: STR, outcomes: STR,
    }, [U({ academic_year: 1, faculty_name: 1, title: 1 }, "uq_training")]);

    // Examinations
    await mk("exam_appearances", ["academic_year", "month_year", "student_name", "roll_number"], {
      academic_year: YEAR, month_year: MON, student_name: STR, roll_number: STR, exam_date: DATE,
    }, [U({ roll_number: 1, month_year: 1, exam_date: 1 }, "uq_appearance"), I({ academic_year: 1, month_year: 1 }, "ix_year_month")]);

    await mk("graduates", ["academic_year", "month_year", "student_name", "roll_number"], {
      academic_year: YEAR, month_year: MON, student_name: STR, roll_number: STR,
    }, [U({ roll_number: 1, month_year: 1 }, "uq_graduate"), I({ academic_year: 1 }, "ix_year")]);

    // Student Affairs
    await mk("student_event_participation", ["form_type", "academic_year", "event_name", "student_name", "roll_number"], {
      form_type: { enum: ["5.1", "5.2", "5.3"] }, form_name: STR, academic_year: YEAR, event_name: STR,
      nature: { enum: ["Conference", "Hackathon", "Workshop", "Other"] }, within_state: YN,
      start_date: DATE, end_date: DATE, host_institution: STR, student_name: STR, roll_number: STR, recognition: STR,
    }, [U({ form_type: 1, academic_year: 1, event_name: 1, roll_number: 1, start_date: 1 }, "uq_participation"),
        I({ roll_number: 1, academic_year: 1 }, "ix_student"), I({ form_type: 1, academic_year: 1, start_date: -1 }, "ix_list")]);

    await mk("extension_activities", ["academic_year", "activity", "student_name", "roll_number"], {
      academic_year: YEAR, date: DATE, activity: STR,
      unit: { enum: ["NSS", "NCC", "Eco-Club", "YRCU", "Leo Club", "Other"] },
      venue: STR, description: STR, student_name: STR, department: STR, roll_number: STR, remarks: STR,
    }, [U({ academic_year: 1, activity: 1, date: 1, roll_number: 1 }, "uq_extension"), I({ unit: 1, academic_year: 1 }, "ix_unit"), I({ roll_number: 1 }, "ix_student")]);

    await mk("club_activities", ["academic_year", "club", "activity", "student_name", "roll_number"], {
      academic_year: YEAR, club: STR, activity: STR, start_date: DATE, end_date: DATE, description: STR,
      student_name: STR, department: STR, roll_number: STR, remarks: STR,
    }, [U({ academic_year: 1, club: 1, activity: 1, start_date: 1, roll_number: 1 }, "uq_club_activity"), I({ club: 1, academic_year: 1 }, "ix_club")]);

    await mk("student_grievances", ["academic_year", "complaint_date", "student_name", "roll_number", "nature", "status"], {
      academic_year: YEAR, complaint_date: DATE, student_name: STR, roll_number: STR, program: STR, branch: STR,
      year_of_study: YOS,
      nature: { enum: ["Academic", "Administrative", "Disciplinary", "Harassment", "Other"] },
      details: STR, action_taken: STR, resolution_date: DATE,
      status: { enum: ["Resolved", "Pending"] }, remarks: STR,
    }, [I({ status: 1, complaint_date: -1 }, "ix_status_date"), I({ roll_number: 1 }, "ix_student"), I({ academic_year: 1, nature: 1 }, "ix_year_nature")]);

    // Career Development
    await mk("internships", ["academic_year", "student_name", "roll_number", "organization"], {
      academic_year: YEAR, student_name: STR, roll_number: STR, program: STR, branch: STR, year_of_study: YOS, semester: SEM,
      organization: STR, from_month: MON, to_month: MON, preplacement_offer: YN, stipend: NUM(0, 1e7), mentor: STR, remarks: STR,
    }, [U({ academic_year: 1, roll_number: 1, organization: 1, from_month: 1 }, "uq_internship"), I({ organization: 1 }, "ix_org")]);

    await mk("entrepreneurship_events", ["academic_year", "event_name", "student_name", "roll_number"], {
      academic_year: YEAR, event_name: STR, event_type: { enum: ["Workshop", "Bootcamp", "Other"] },
      organized_by: { enum: ["EDC", "IIC", "Department"] }, resource_persons: STR, outcome: STR,
      start_date: DATE, end_date: DATE, student_name: STR, roll_number: STR, program: STR, branch: STR, semester: SEM, remarks: STR,
    }, [U({ academic_year: 1, event_name: 1, start_date: 1, roll_number: 1 }, "uq_participation"), I({ roll_number: 1 }, "ix_student")]);

    await mk("placements", ["academic_year", "student_name", "roll_number", "company"], {
      academic_year: YEAR, program: STR, student_name: STR, roll_number: STR, year_of_study: YOS, semester: SEM,
      company: STR, core_company: YN, international: YN, country: STR, job_role: STR,
      package_lpa: NUM(0, 1000), offer_date: DATE, remarks: STR,
    }, [U({ academic_year: 1, roll_number: 1, company: 1 }, "uq_offer"), I({ company: 1 }, "ix_company"),
        I({ academic_year: 1, program: 1 }, "ix_year_program"), I({ academic_year: 1, core_company: 1 }, "ix_core"), I({ package_lpa: -1 }, "ix_package")]);

    await mk("higher_studies", ["academic_year", "student_name", "roll_number", "hs_program", "university"], {
      academic_year: YEAR, program: STR, student_name: STR, roll_number: STR, hs_program: STR, university: STR,
      country: STR, admission_year: NUM(1990, 2100), remarks: STR,
    }, [U({ academic_year: 1, roll_number: 1, university: 1 }, "uq_admission"), I({ country: 1 }, "ix_country")]);

    await mk("competitive_exams", ["academic_year", "student_name", "roll_number", "exam_name"], {
      academic_year: YEAR, program: STR, student_name: STR, roll_number: STR, year_of_study: YOS, semester: SEM,
      exam_name: { enum: ["GATE", "GRE", "TOEFL", "Other"] }, score_rank: STR, year_qualified: NUM(1990, 2100), remarks: STR,
    }, [U({ roll_number: 1, exam_name: 1, year_qualified: 1 }, "uq_exam"), I({ exam_name: 1, year_qualified: 1 }, "ix_exam_year")]);

    await mk("skill_programs", ["academic_year", "program_name", "student_name", "roll_number"], {
      academic_year: YEAR, program_name: STR, organized_by: { enum: ["APSSDC", "APITA", "APSCHE", "Other"] },
      resource_persons: STR, outcome: STR, start_date: DATE, end_date: DATE,
      student_name: STR, roll_number: STR, program: STR, branch: STR, semester: SEM, remarks: STR,
    }, [U({ academic_year: 1, program_name: 1, start_date: 1, roll_number: 1 }, "uq_participation"), I({ roll_number: 1 }, "ix_student")]);

    await mk("alumni_activities", ["academic_year", "activity"], {
      academic_year: YEAR, date: DATE, activity: STR, organized_by: STR, place: STR, venue: STR,
      alumni_participated: NUM(0, 100000), purpose: STR, remarks: STR,
    }, [U({ academic_year: 1, activity: 1, date: 1 }, "uq_activity")]);

    await mk("alumni_fund", ["financial_year", "amount", "alumni_name"], {
      financial_year: YEAR, amount: NUM(0, 1e10), mode: { enum: ["Online", "Offline"] },
      alumni_name: STR, regn_no: STR, batch: STR, purpose: STR, remarks: STR,
    }, [UP("regn_no", "uq_regn"), I({ financial_year: 1 }, "ix_fy"), I({ batch: 1 }, "ix_batch")]);

    // 9. Seed form_types from registry
    const registry = require('../config/form-registry.json');
    const formTypesColl = db.collection('form_types');

    for (const form of registry.forms) {
      const isActivity = form.storage === "academic_activities" || form.collection === "academic_activities";
      await formTypesColl.updateOne(
        { code: form.code },
        {
          $set: {
            code: form.code,
            name: form.name,
            group: form.group,
            collection: form.collection,
            kind: isActivity ? "activity" : "separate",
            is_active: true,
          }
        },
        { upsert: true }
      );
    }

    const count = await formTypesColl.countDocuments();
    console.log(`✅ DATABASE MIGRATION & FORM TYPES SEEDED SUCCESSFULLY! (Total form_types: ${count})`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Migration failed:`, error);
    process.exit(1);
  }
}

seedDatabase();
