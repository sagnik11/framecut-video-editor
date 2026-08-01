# Contributing

Thanks for helping improve Framecut. The core product is intentionally focused, so start with an item in `ROADMAP.md` or open an issue before beginning a larger change.

## Development workflow

1. Fork the repository and create a narrowly named branch.
2. Follow the local setup in `README.md`.
3. Keep Worker authorization checks and browser rendering concerns separate.
4. Add or update tests for behavior changes.
5. Run the complete check before opening a pull request.

```bash
npm run check
npm run deploy:dry
```

## Pull request checklist

- The change solves one documented problem.
- No secrets, `.dev.vars`, generated builds, R2 media, or Wrangler state are committed.
- New project or media routes verify the active user's ownership.
- D1 schema changes use a new forward migration.
- Visible controls have labels, focus states, keyboard behavior, and useful errors.
- Rendering changes include command-builder tests and a real short-video export check.
- Documentation is updated when setup, configuration, or user behavior changes.
- Autter sponsorship credit remains visible and unobtrusive.

## Technical guidelines

- Use TypeScript throughout the application and Worker.
- Validate API input at the Worker boundary.
- Keep R2 buckets private and serve media only through authenticated routes.
- Preserve byte-range responses for source and export playback.
- Do not introduce native FFmpeg assumptions into the Worker runtime.
- Avoid adding general editing features outside the agreed core scope without discussion.
- Prefer small, reversible changes and forward-only D1 migrations.

## Reporting security issues

Do not publish credentials, personal data, or a reproducible exploit in a public issue. Contact the repository owner privately with the affected route, impact, and a minimal reproduction. Rotate any exposed Cloudflare or authentication secret immediately.
