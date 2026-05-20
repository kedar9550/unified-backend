const axios = require('axios');

async function testMe() {
  try {
    // We need a valid token to test /me
    // Since we don't have one, this will fail with 401.
    // But we are interested in the backend logs when a 404 occurs.
    console.log('Testing /me endpoint (this will likely 401, but check backend logs)');
    const res = await axios.get('http://localhost:9000/api/employees/me');
    console.log('Response:', res.status);
  } catch (err) {
    console.log('Error:', err.response?.status, err.response?.data);
  }
}

testMe();
