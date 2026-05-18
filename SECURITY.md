# Security policy

## Supported versions

WatchDog is in active development. Security fixes will be backported only
to the latest `main` branch.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Use one of the following private channels instead:

- **GitHub Security Advisories** — preferred. Open a draft advisory at
  https://github.com/NewCoder3294/watchdog/security/advisories/new
- **Email** — `nickpenton07@gmail.com` with subject `[SECURITY] WatchDog: ...`

Please include:

1. A clear description of the issue
2. Steps to reproduce
3. The version / commit you tested against
4. The impact (data exposure, privilege escalation, denial of service, etc.)
5. Any suggested mitigation, if you have one

## Response time

You can expect:

- An acknowledgement within **3 business days**
- An initial assessment within **7 business days**
- A coordinated disclosure timeline once severity is confirmed

We aim to ship fixes within **30 days** of confirmed reports, faster for
critical issues. Please give us a reasonable embargo before public
disclosure.

## Scope

In scope:

- Authentication and authorization bypasses in `apps/web`
- Data-exposure issues in Supabase RPCs, RLS policies, or HTTP routes
- Server-side request forgery, injection, or deserialization issues
- Logic bugs in the ingestion / fusion pipeline that affect data integrity
- Secret leakage in builds, logs, or repository history

Out of scope:

- Findings from automated scanners without proof of exploitability
- Self-XSS without privilege escalation
- Missing security headers without a concrete impact
- Issues that require a compromised local machine or a privileged
  Supabase role to exploit

## Credit

We're happy to credit researchers in release notes and the
`SECURITY-ACKNOWLEDGEMENTS` file once a fix ships. Let us know in your
report if you'd like to be credited and how.
