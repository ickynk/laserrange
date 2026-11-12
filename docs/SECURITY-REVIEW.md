# Repository and local-view credential review

Reviewed the main-branch source at `937b862f2cebcc46f4293fcf76333c742bd1fe7f` and applied the fixes described below. The local checkout matched the GitHub tree. Scope: 118 tracked files at that revision, 378 blobs in available local Git history, deployment build contexts, authentication/pairing paths and browser storage/display code. This is a source review and targeted pattern scan, not a penetration test or a complete scan of all remote branches, releases, Actions artifacts or installed servers.

## Results

- No production credentials, private-key PEM blocks, common GitHub/AWS/API token signatures, personal deployment hostname or personal LAN IP were found in the reviewed source/history. One credential-shaped URL is a deliberately invalid example in an input-validation test, not a live credential. Test-only keys and placeholder domains remain in tests/docs.
- Operator secrets, local deployment configuration, TLS keys and saved user data are excluded from Git and the application Docker build context. Ignore rules now also cover environment-file variants and PKCS#12 key containers. Git-ignore rules do not erase previously committed files; none of those sensitive filenames were tracked in this checkout.
- Server static routing exposes the public directory and selected dependencies, not the deployment configuration, data directory or private keys. Tests verify private-file URLs return 404 and phone credentials cannot unlock operator/library APIs.

## Fixed exposures

1. Normal server/container startup no longer prints the operator URL/key, configured public domain or data-directory path. The explicit `node scripts/host-link.js` command still returns the stable link. The interactive portable launcher deliberately invokes it for its operator.
2. QR generation now sends the pairing link in a bounded, authenticated POST body, rather than a GET query string that could be recorded in ordinary proxy access logs. The browser displays the resulting SVG through a revocable blob URL. Legacy GET requests are rejected; responses remain non-cacheable. This does not protect against a proxy deliberately configured to log request bodies or authorization headers.

## Deliberate runtime state

The current server hostname must be visible in the browser address/network information and camera connection settings. A QR and phone-link href necessarily contain a phone-only session credential. They do not contain the operator credential. Do not publish active pairing screenshots.

The operator key is kept in tab-scoped sessionStorage so reloads and authenticated saved-range access work. It is not stored in localStorage. Someone with access to that unlocked browser session/devtools, a privileged extension, or injected same-origin script can retrieve it. URL fragments containing initial credentials are cleared after reading; this is not a guarantee that bookmarks or externally captured browser history contain no credentials. Scenarios and hardware-test results use localStorage intentionally. Phone pairing credentials remain in page memory for reconnect, not localStorage.

This revision does not replace operator authentication with HttpOnly cookies, hide the real network origin, scrub browser/Portainer history, delete existing logs, or rotate existing operator keys. Existing server-side keys remain stable. If an actual key has been shared, rotate it deliberately and restart to revoke sessions. Updating source does not update an already-built Docker image: rebuild/recreate the range container while preserving its data volume, then refresh browser pages. The gateway image is unchanged.
