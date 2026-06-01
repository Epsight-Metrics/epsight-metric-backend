// Test script untuk verifikasi refresh token dan cookie
// Run dengan: node test-auth.js

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function testAuth() {
  console.log('🧪 Testing Authentication Flow...\n');

  try {
    // 1. Login
    console.log('1️⃣ Testing Login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      credentials: 'include',
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    const cookies = loginRes.headers.get('set-cookie');
    
    console.log('✅ Login successful');
    console.log('   Access Token:', loginData.accessToken.substring(0, 20) + '...');
    console.log('   User:', loginData.user.username);
    console.log('   Cookies:', cookies ? 'Set' : 'Not Set');
    console.log('');

    // Extract refresh token from cookie
    const refreshTokenMatch = cookies?.match(/refreshToken=([^;]+)/);
    const refreshToken = refreshTokenMatch ? refreshTokenMatch[1] : null;

    if (!refreshToken) {
      throw new Error('Refresh token not found in cookies');
    }

    // 2. Test Refresh
    console.log('2️⃣ Testing Token Refresh...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `refreshToken=${refreshToken}`
      },
      credentials: 'include',
    });

    if (!refreshRes.ok) {
      throw new Error(`Refresh failed: ${refreshRes.status}`);
    }

    const refreshData = await refreshRes.json();
    const newCookies = refreshRes.headers.get('set-cookie');

    console.log('✅ Token refresh successful');
    console.log('   New Access Token:', refreshData.accessToken.substring(0, 20) + '...');
    console.log('   New Cookies:', newCookies ? 'Set' : 'Not Set');
    console.log('');

    // 3. Test Protected Endpoint
    console.log('3️⃣ Testing Protected Endpoint...');
    const protectedRes = await fetch(`${API_URL}/operator/parts`, {
      headers: { 
        'Authorization': `Bearer ${refreshData.accessToken}`
      },
    });

    if (!protectedRes.ok) {
      throw new Error(`Protected endpoint failed: ${protectedRes.status}`);
    }

    console.log('✅ Protected endpoint accessible');
    console.log('');

    // 4. Test Logout
    console.log('4️⃣ Testing Logout...');
    const newRefreshTokenMatch = newCookies?.match(/refreshToken=([^;]+)/);
    const newRefreshToken = newRefreshTokenMatch ? newRefreshTokenMatch[1] : refreshToken;

    const logoutRes = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${refreshData.accessToken}`,
        'Cookie': `refreshToken=${newRefreshToken}`
      },
      credentials: 'include',
    });

    if (!logoutRes.ok) {
      throw new Error(`Logout failed: ${logoutRes.status}`);
    }

    console.log('✅ Logout successful');
    console.log('');

    console.log('🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAuth();
