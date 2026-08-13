const ExcelJS = require('exceljs');

async function createTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template');
    const listsSheet = workbook.addWorksheet('Lists', { state: 'hidden' });

    // Populate lists sheet
    listsSheet.getColumn('A').values = ['UG', 'PG', 'Doctoral'];
    listsSheet.getColumn('B').values = ['B.Tech.', 'B.Sc.', 'B.A.'];
    listsSheet.getColumn('C').values = ['M.Tech.', 'M.Sc.', 'MBA'];
    listsSheet.getColumn('D').values = ['Ph.D.', 'M.Phil.'];

    // ExcelJS doesn't expose a direct way to add named ranges to the workbook easily in all versions, 
    // but we can try using standard excel INDIRECT if we define named ranges. 
    // Actually, workbook.definedNames.add('UG', 'Lists!$B$1:$B$3') works in exceljs.
    workbook.definedNames.add('Lists!$B$1:$B$3', 'UG');
    workbook.definedNames.add('Lists!$C$1:$C$3', 'PG');
    workbook.definedNames.add('Lists!$D$1:$D$2', 'Doctoral');

    // Headers
    sheet.columns = [
        { header: 'Qual 1 Level', key: 'level' },
        { header: 'Qual 1 Degree', key: 'degree' }
    ];

    // Data validation for Level
    for(let i=2; i<=50; i++) {
        sheet.getCell(`A${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['Lists!$A$1:$A$3']
        };

        // Data validation for Degree (dependent on Level)
        sheet.getCell(`B${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`INDIRECT(A${i})`]
        };
    }

    await workbook.xlsx.writeFile('test_template.xlsx');
    console.log("Created test_template.xlsx");
}

createTemplate().catch(console.error);
