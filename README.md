# Jevort

A Pi extension that uses TypeSafe AI's Jev (`jev-latest`) to recommend a reasoning-effort tier for each user prompt. By default it only shows a notification; it never adds slash commands or changes the thinking level unless automatic application is explicitly enabled.

## Requirements

- Node.js 22.19 or newer (required by Pi)
- Pi with extension support
- A TypeSafe API key (`TYPESAFE_API_KEY`)

## Install

Install the published npm package for your user:

```sh
pi install npm:jevort
```

Or install the private/public GitHub repository directly:

```sh
pi install git:github.com/aklsh/jevort
```

Then set `TYPESAFE_API_KEY` in the environment that launches Pi. To try the extension from a local checkout:

```sh
npm install
export TYPESAFE_API_KEY="your-key"
pi --extension ./jevort.ts
```

## Behavior

On Pi's `before_agent_start` event, the extension sends each non-empty prompt to TypeSafe and asks Jev to choose among:

- **low** — short, scoped task or tiny reversible edit
- **medium** — routine work with little architectural uncertainty
- **high** — complex debugging/design or meaningful integration risk
- **xhigh** — broad architecture, subtle correctness, or high stakes

A recommendation is accepted only when its selected-choice probability is at least `0.5`; otherwise the classifier uses `medium`. The suggestion is adapted to Pi's common thinking levels using the active model's `reasoning` capability and `thinkingLevelMap`: unsupported levels are mapped to the nearest available tier. A model without reasoning support is left unchanged. If the TypeSafe request fails, the extension leaves the current level unchanged and reports a warning.

By default Jevort only notifies you of its suggestion; it does not change the active thinking level. Use Pi's built-in `/thinking` control to apply a suggestion manually. To control automatic application during a Pi session, use `/jevort` (equivalent to `/jevort toggle`), `/jevort on`, `/jevort off`, or `/jevort status`. This runtime setting resets when Pi restarts. To enable auto-application at startup, set `JEVORT_AUTO_APPLY=1` (accepted values are `1`, `true`, `yes`, and `on`) in Pi's environment. The extension checks the active model's reasoning support and `thinkingLevelMap`, maps unavailable recommendations to the nearest supported tier, and leaves the current setting unchanged when reasoning is unavailable.

## Privacy and network behavior

The prompt text is sent to TypeSafe for classification. The API key is read from `TYPESAFE_API_KEY`. Requests use `jev-latest`, a 2.5-second timeout, and no retries. Do not use the extension for prompts you are not permitted to send to TypeSafe.

## Development

The tracked `.envrc` uses [direnv's Node layout](https://github.com/direnv/direnv/wiki/Node) and [nvm](https://github.com/nvm-sh/nvm) to select the Node version pinned in `.nvmrc` and add `node_modules/.bin` to `PATH`. Install nvm and direnv, enable direnv's shell hook, then from this checkout run:

```sh
nvm install
direnv allow
npm ci
npm run typecheck
```

The npm version comes with the selected nvm Node installation; it is not pinned separately. `.envrc` also loads an optional, ignored `.envrc.local` for local secrets (such as `TYPESAFE_API_KEY`). If nvm is installed outside `~/.nvm`, set `NVM_DIR` before entering the checkout. Without direnv, run `nvm use` manually.

The typecheck requires the dependencies from `package.json` to be installed. The extension relies on Pi's `before_agent_start` event and the model metadata exposed on its extension context. The package manifest declares `jevort.ts` as its Pi extension entrypoint and includes the TypeSafe SDK as a runtime dependency.
