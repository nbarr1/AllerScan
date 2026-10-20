# Security Policy

The AllerScan maintainers take the security of our application and user privacy seriously. We appreciate the proactive contributions of security researchers and community developers.

---

## Supported Versions

Security updates and patches are actively maintained for the latest release and the main branch.

| Version / Branch | Supported          |
| :--------------- | :----------------- |
| `main`           | :white_check_mark: |
| Native Android   | :white_check_mark: |
| Legacy Releases  | :x:                |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a potential security flaw or data privacy issue within AllerScan:

1. Email the maintainers directly at `security@allerscan.app` or submit a private report via GitHub's **Security** tab under **Draft Security Advisory**.
2. Provide a detailed report including:
   - Description of the vulnerability and potential impact.
   - Exact steps or proof-of-concept code to reproduce the issue.
   - Affected platforms (Web, Android Native, iOS/Capacitor).

### Response SLA
- **Initial Acknowledgment**: Within 48 hours of receipt.
- **Triage & Risk Assessment**: Within 5 business days.
- **Remediation & Disclosure**: Patches will be developed in private security branches and deployed prior to public disclosure.

---

## Security Practices & Protection Mechanisms

### Automated Secret Scanning
- Local commits run `scripts/check-secrets.mjs` via Husky pre-commit hooks to block embedded credentials, private tokens, or sensitive string patterns.
- Continuous Integration pipelines inspect incoming pull requests for accidental secret exposure.

### Data Privacy & Storage
- User profiles, sensitive allergen lists, and scan histories are stored on-device via local storage or native encrypted shared preferences (`SettingsRepository.kt`).
- Product scan lookups and OCR evaluations are designed to operate with minimal remote data retention.
