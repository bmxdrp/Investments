# 🧪 Security Testing Scripts

This directory contains scripts to test and verify security configurations.

---

## 📝 Available Scripts

### 1. `test-security-headers.js`

Tests that all security headers are properly configured on the server.

#### Usage

```bash
# Start the dev server first
npm run dev

# In another terminal, run the test
node scripts/test-security-headers.js
```

#### Test Against Production

```bash
TEST_URL=https://your-production-domain.com node scripts/test-security-headers.js
```

#### What It Tests

- ✅ X-Frame-Options
- ✅ X-Content-Type-Options
- ✅ X-XSS-Protection
- ✅ Referrer-Policy
- ✅ Permissions-Policy
- ✅ Content-Security-Policy
- ✅ CORS headers (if applicable)

#### Expected Output

```
🔒 Testing Security Headers

Target: http://localhost:4321

📊 Response Status: 200 

🔍 Checking Headers:

✅ x-frame-options: OK
✅ x-content-type-options: OK
✅ x-xss-protection: OK
✅ referrer-policy: OK
✅ permissions-policy: OK
✅ content-security-policy: OK
   Value: default-src 'self'; script-src 'self' 'unsafe-inline'...

🌐 CORS Headers:

ℹ️  No CORS headers (expected if no Origin header sent)

==================================================
📈 Summary:

✅ Passed: 6
❌ Failed: 0
📊 Total: 6

🎉 All security headers are properly configured!
```

---

## 🔧 Adding New Tests

To add new security tests:

1. Create a new `.js` file in this directory
2. Follow the pattern from `test-security-headers.js`
3. Update this README with usage instructions
4. Add to `package.json` scripts if appropriate

---

## 📚 Related Documentation

- **Security Headers**: `../SECURITY_HEADERS.md`
- **Security Audit**: `../SECURITY_AUDIT.md`
- **Implementation Summary**: `../SECURITY_IMPLEMENTATION.md`

---

## 🚀 CI/CD Integration

You can integrate these tests into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Test Security Headers
  run: |
    npm run dev &
    sleep 5
    node scripts/test-security-headers.js
```

---

**Last Updated**: 2025-12-07
