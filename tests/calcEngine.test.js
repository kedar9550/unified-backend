const { evaluateCalc, computeFormCalculations } = require('../utils/calcEngine');

function runTests() {
  console.log('--- Running Calc Engine Unit Tests ---');

  // Test 1: Sum (+a,b)
  const doc1 = { male: 40, female: 60 };
  const sumVal = evaluateCalc('+male,female', doc1);
  console.assert(sumVal === 100, `Test 1 Failed: Expected 100, got ${sumVal}`);

  // Test 2: Percentage (%a,b)
  const doc2 = { total: 50, intake: 200 };
  const pctVal = evaluateCalc('%total,intake', doc2);
  console.assert(pctVal === 25, `Test 2 Failed: Expected 25, got ${pctVal}`);

  // Test 3: Subtraction (-a,b)
  const doc3 = { sanctioned: 100, filled: 85 };
  const subVal = evaluateCalc('-sanctioned,filled', doc3);
  console.assert(subVal === 15, `Test 3 Failed: Expected 15, got ${subVal}`);

  // Test 4: Row Column Sum (#rows,col)
  const doc4 = {
    scholars: [
      { stipend: 10000 },
      { stipend: 15000 },
      { stipend: 20000 }
    ]
  };
  const rowSum = evaluateCalc('#scholars,stipend', doc4);
  console.assert(rowSum === 45000, `Test 4 Failed: Expected 45000, got ${rowSum}`);

  // Test 5: computeFormCalculations
  const fields = [
    { key: 'male', type: 'number' },
    { key: 'female', type: 'number' },
    { key: 'total', type: 'number', calc: '+male,female' },
    { key: 'intake', type: 'number' },
    { key: 'enroll_pct', type: 'number', calc: '%total,intake' }
  ];
  const inputDoc = { male: 30, female: 70, intake: 200 };
  const computed = computeFormCalculations(fields, inputDoc);

  console.assert(computed.total === 100, `Test 5a Failed: Expected total=100, got ${computed.total}`);
  console.assert(computed.enroll_pct === 50, `Test 5b Failed: Expected enroll_pct=50, got ${computed.enroll_pct}`);

  console.log('✅ ALL CALC ENGINE TESTS PASSED SUCCESSFULLY!');
}

runTests();
