# create-owt

Create an [OWT](../../README.md) app:

```sh
npm create owt@latest my-app
pnpm create owt my-app --template minimal
```

Options: `--template minimal|todo` (default: asks, `todo` when not interactive), `--yes` (no questions). The generated project has Vite, the OWT plugin, strict TypeScript settings (null-safe), `owt-tsc` type checking of `.owt` markup in `npm run build`, and a VS Code extension recommendation.
