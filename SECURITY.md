# Security Policy

## Supported Versions

Only the current major version receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.x (latest) | ✅ |
| older | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email security reports to: **thanhdo92it@gmail.com**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

### What to expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days (confirmed / not a vulnerability / needs more info)
- **Fix timeline** communicated once confirmed
- **Credit** in release notes if you wish (opt-in)

We ask that you give us a reasonable window to address the issue before any public disclosure.

## Scope

In scope:
- Authentication/authorization bypasses
- Injection vulnerabilities in provided modules
- Secrets or credentials exposure via library behavior
- Dependency vulnerabilities with a clear exploit path

Out of scope:
- Issues in end-user application code that misuses the library
- Dependencies with no known exploit (theoretical CVEs)
- Denial of service via resource exhaustion in application code
