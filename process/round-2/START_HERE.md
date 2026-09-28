# Start here

**Read [`SUMMARY.md`](SUMMARY.md) first.** It records the stop condition, evidence, unresolved gaps and the actual build version. The unchanged requested brief is [`BRIEF-v0.2.md`](BRIEF-v0.2.md).

## Try this build in under two minutes

1. In the repository root, run `npm ci && npm run build`. The isolated unpacked build is `.output/round-2-chrome-mv3` (manifest version **0.4.0**, because the existing installed main branch was already v0.3.0 when this v0.2 brief arrived).
2. Launch a **new disposable Chromium profile**, visit `chrome://extensions`, enable Developer mode and Load unpacked from `.output/round-2-chrome-mv3`. **Do not install this review branch in the user's live Chrome profile.** Branch builds do not overwrite the default `.output/chrome-mv3` directory.
3. Open a normal site in that disposable profile. The Tab Hub toolbar popup can save a single tab or its entire group; it closes source tabs only after a verified save. From the hub, select a card, view its individual saves in the panel, try Search/Filter, and delete/undo a disposable reference. Use **More** to export or import a private `.tabhub` backup.

The [screenshot matrix](screenshots/) and [interaction clips](recordings/) use throwaway profiles and synthetic/local fixture content. The named v0.1.2 demo archive, Siri images and round-one recordings were not supplied, so these do not make a same-content before/after comparison.

**Review order after this summary:** [`ACCEPTANCE.json`](ACCEPTANCE.json), [`EVALUATION.md`](EVALUATION.md), [`DECISIONS.md`](DECISIONS.md), [`BLOCKERS.md`](BLOCKERS.md), then [`CHANGELOG.md`](CHANGELOG.md).
