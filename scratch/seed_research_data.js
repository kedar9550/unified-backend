const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Journal = require('../modules/Journal/Journal.model');
const Textbook = require('../modules/Textbook/Textbook.model');
const BookChapter = require('../modules/BookChapter/BookChapter.model');

dotenv.config();

const seed = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log("Connected to database.");

        const facultyId = "69edced62cc2ad1355d29131"; // AMALAPURAPU KEDARNADH
        const academicYear = "69fbda90202b005f04e89e34"; // 2025-2026

        // 1. Seed Journal
        const journal = new Journal({
            facultyId,
            academicYear,
            college: "Aditya Engineering College",
            panNumber: "ABCDE1234F",
            doi: "10.1109/TSG.2025.1234567",
            publicationScope: "International",
            totalAuthors: 3,
            userAuthorPosition: 1,
            journalQuartile: "Q1",
            journalType: "SCOPUS",
            paperTitle: "Advancements in Smart Grid AI Control Systems",
            journalName: "IEEE Transactions on Smart Grid",
            vol: "16",
            issue: "3",
            publishedMonth: "June",
            publishedYear: "2025",
            applyingSeedGrant: "No",
            applyIncentive: "Yes",
            publishedPaper: "uploads/journals/paper.pdf",
            referencePages: "uploads/journals/ref.pdf",
            status: "Approved",
            approvedAmount: 15000
        });
        await journal.save();
        console.log("Seeded Journal successfully.");

        // 2. Seed Textbook
        const textbook = new Textbook({
            facultyId,
            academicYear,
            college: "Aditya Engineering College",
            title: "Fundamentals of Smart Power Systems",
            publisher: "Pearson Education",
            isbn: "978-0134058498",
            yearOfPublication: "2025",
            publicationType: "National",
            totalAuthors: 1,
            userAuthorPosition: 1,
            edition: "2nd",
            month: "March",
            year: "2025",
            applyIncentive: "Yes",
            coverPage: "uploads/textbooks/cover.pdf",
            authorAffiliation: "uploads/textbooks/aff.pdf",
            index: "uploads/textbooks/index.pdf",
            status: "Approved",
            approvedAmount: 8000
        });
        await textbook.save();
        console.log("Seeded Textbook successfully.");

        // 3. Seed Book Chapter
        const bookChapter = new BookChapter({
            facultyId,
            academicYear,
            college: "Aditya Engineering College",
            panNumber: "ABCDE1234F",
            textBookName: "Handbook of Intelligent Electrical Systems",
            chapterTitle: "Chapter 4: Microgrid Optimization using GA",
            isbnNumber: "978-3-16-148410-0",
            yearOfPublication: "2025",
            firstAuthor: "Yes",
            publisher: "Springer",
            month: "March",
            year: "2025",
            applyIncentive: "Yes",
            applyingSeedGrant: "No",
            authorAffiliation: "uploads/chapters/aff.pdf",
            coverPage: "uploads/chapters/cover.pdf",
            index: "uploads/chapters/index.pdf",
            status: "Approved",
            approvedAmount: 4000
        });
        await bookChapter.save();
        console.log("Seeded Book Chapter successfully.");

    } catch (err) {
        console.error("Seeding error:", err);
    }
    process.exit(0);
};

seed();
