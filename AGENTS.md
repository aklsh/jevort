# Agent instructions

## Project

This repository contains the Pi extension `jevort.ts` that asks TypeSafe AI's Jev to classify the current prompt's desired reasoning effort.

## Key behavior

- Use the official `@typesafe-ai/sdk` (`TypeSafeClient`, `choice`, `systemOne`) for Jev requests.
- Run classification from `before_agent_start` for non-empty prompts.
- Keep effort rubric options and descriptions in `EFFORTS` in the extension.
- Only accept Jev's selected effort when its choice probability is at least `0.5`; otherwise use `medium`.
- Check `ctx.model.reasoning` and `ctx.model.thinkingLevelMap` before applying effort. Pi's level names are common abstractions mapped by provider/model metadata; never assume every active model supports `xhigh` or even reasoning.
- Map an unsupported recommendation to the nearest supported tier. If reasoning is unavailable, leave the current level unchanged and notify the user.
- Default to notification-only. `JEVORT_AUTO_APPLY` enables auto-application for values `1`, `true`, `yes`, or `on`; the `/jevort` command supports `on`, `off`, `toggle`, and `status` for a runtime-only override. Users can also apply suggestions manually with Pi's built-in `/thinking` control.
- On TypeSafe errors, preserve the current effort and notify the user; do not make the extension fail the turn.

## Safety and privacy

Each non-empty prompt is transmitted to TypeSafe for classification. Read credentials only from `TYPESAFE_API_KEY`. Do not log or persist prompt contents or secrets. Requests currently use `jev-latest`, a 2500 ms timeout, and retries disabled.

## Validation

Run `npm run typecheck` after TypeScript changes when dependencies are installed. Update `README.md` when user-facing behavior or setup changes. Pi extensions are loaded directly as TypeScript; retain `jevort.ts` as the public extension entrypoint.
