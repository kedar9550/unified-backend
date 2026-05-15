const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function test() {
  try {
    console.log('XLSX loaded');
    // Just testing if the module can be loaded and has the expected functions
    if (typeof XLSX.readFile === 'function') {
      console.log('XLSX.readFile is a function');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
