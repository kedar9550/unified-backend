const fs = require('fs');

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

for (let p of paths) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        // Remove bad injections
        content = content.replace(/const primaryEvaluatorRoles = \[\s*"DEPARTMENT_HOD"[\s\S]*?\];\s*/g, '');
        
        // Put it safely after the first bunch of requires
        const requireEnd = content.lastIndexOf('require(');
        const nextLine = content.indexOf('\n', requireEnd) + 1;
        
        content = content.slice(0, nextLine) + primaryEvaluatorRolesStr + content.slice(nextLine);
        fs.writeFileSync(p, content);
        console.log('Fixed', p);
    }
}
