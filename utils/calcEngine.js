/**
 * Calc Engine - Form registry formula evaluator
 * Supported formulas:
 *   +a,b     -> sum of field a and b
 *   -a,b     -> a minus b
 *   *a,b     -> product of a and b
 *   %a,b     -> (a / b) * 100 rounded to 1 decimal place
 *   #rows,col-> sum of column `col` across array `rows`
 */

function getValue(doc, path) {
  if (!doc || !path) return 0;
  const parts = path.split('.');
  let val = doc;
  for (const p of parts) {
    if (val === undefined || val === null) return 0;
    val = val[p];
  }
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function evaluateCalc(formula, doc) {
  if (!formula || typeof formula !== 'string' || !doc) return '';

  const str = formula.trim();
  const op = str[0];
  const rest = str.slice(1);

  if (op === '#') {
    // #rows,col -> sum of column across rows array
    const commaIdx = rest.indexOf(',');
    if (commaIdx === -1) return 0;
    const rowKey = rest.slice(0, commaIdx).trim();
    const colKey = rest.slice(commaIdx + 1).trim();

    const rowsArr = doc[rowKey];
    if (!Array.isArray(rowsArr)) return 0;

    const total = rowsArr.reduce((sum, row) => {
      const val = Number(row?.[colKey]);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    return total;
  }

  const [fieldA, fieldB] = rest.split(',').map((s) => s.trim());
  const valA = getValue(doc, fieldA);
  const valB = getValue(doc, fieldB);

  switch (op) {
    case '+':
      return valA + valB;

    case '-':
      return valA - valB;

    case '*':
      return valA * valB;

    case '%': {
      if (valB === 0) return 0;
      const pct = (valA / valB) * 100;
      return Math.round(pct * 10) / 10;
    }

    default:
      return 0;
  }
}

/**
 * Re-computes all calculated fields in a document based on form registry field definitions.
 * Mutates or returns a copy of document with calculated values assigned.
 */
function computeFormCalculations(fields, doc) {
  const result = { ...doc };
  if (!fields || !Array.isArray(fields)) return result;

  for (const field of fields) {
    if (field.calc) {
      const computed = evaluateCalc(field.calc, result);
      result[field.key] = computed;
    }

    // Handle nested rows fields if they have nested calc fields
    if (field.type === 'rows' && Array.isArray(result[field.key]) && Array.isArray(field.fields)) {
      result[field.key] = result[field.key].map((row) => {
        const rowCopy = { ...row };
        for (const subField of field.fields) {
          if (subField.calc) {
            rowCopy[subField.key] = evaluateCalc(subField.calc, rowCopy);
          }
        }
        return rowCopy;
      });
    }
  }

  // Second pass: compute any top-level calc fields that depend on #rows sum
  for (const field of fields) {
    if (field.calc && field.calc.startsWith('#')) {
      result[field.key] = evaluateCalc(field.calc, result);
    }
  }

  return result;
}

module.exports = {
  evaluateCalc,
  computeFormCalculations,
};
