const fs = require('fs');

const primaryEvaluatorRolesStr = `
const primaryEvaluatorRoles = [
    "DEPARTMENT_HOD", "HOD", "SCHOOL_DEAN", 
    "VICE CHANCELLOR", "VICE_CHANCELLOR", 
    "DY. PRO CHANCELLOR", "DY_PRO_CHANCELLOR", 
    "REGISTRAR",
    "PRO VICE-CHANCELLOR (E & S)", "PRO_VICE_CHANCELLOR_E_S",
    "PRO VICE-CHANCELLOR (A)", "PRO_VICE_CHANCELLOR_A",
    "PRO VICE-CHANCELLOR (S & P)", "PRO_VICE_CHANCELLOR_S_P",
    "DEAN - (IQAC)", "DEAN_IQAC",
    "DEAN - (ADMISSIONS)", "DEAN_ADMISSIONS",
    "CONTROLLER OF EXAMINATIONS", "CONTROLLER_OF_EXAMINATIONS"
];
`;

const paths = [
    'modules/Journal/Journal.router.js',
    'modules/Conference/Conference.router.js',
    'modules/BookChapter/BookChapter.router.js',
    'modules/Textbook/Textbook.router.js',
    'modules/Patent/Patent.router.js',
    'modules/FundedProject/FundedProject.router.js',
    'modules/Consultancy/Consultancy.router.js',
    'modules/NovelProduct/NovelProduct.router.js',
    'modules/PhdScholar/PhdScholar.router.js'
];

for(const p of paths) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        
        // Add primaryEvaluatorRoles if not present
        if (!content.includes('primaryEvaluatorRoles')) {
            // Find the last require or const at the top and insert after
            const lastRequire = content.lastIndexOf('const ');
            const insertPos = content.indexOf('\n', lastRequire) + 1;
            content = content.slice(0, insertPos) + primaryEvaluatorRolesStr + content.slice(insertPos);
        }

        // Replace authorize('HOD') with authorize(...primaryEvaluatorRoles)
        content = content.replace(/authorize\('HOD'\)/g, "authorize(...primaryEvaluatorRoles)");

        fs.writeFileSync(p, content);
        console.log('Updated', p);
    } else {
        console.log('Not found:', p);
    }
}
