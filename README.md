# Circulation Lab

Browser-based cardiovascular physiology teaching prototype for hemorrhage and cardiac tamponade. Open the published website; no installation or GitHub account is required.

## Status

Experimental and quantitatively uncalibrated. This independent implementation is not a validated replacement for SimBioSys and is not for patient care. The current version supports volume interventions, independent sympathetic/vagal freezing, live pressure traces, PV loops, illustrative Guyton curves, and CSV export.

Planned work includes EDPVR/ESPVR overlays, improved cardiac/vascular function curves, numerical-display consistency, and aortic-valve closure/dicrotic-notch dynamics. These are not represented as completed features.

## Development

Requires Node.js for tests and Python 3 for the local server.

```sh
npm test
npm start
```

Open http://localhost:4173. Application files are in `dist/`. GitHub Pages serves the `gh-pages` branch, containing only these static files.

Publish updates after tests pass:

```sh
git push origin main
git subtree push --prefix dist origin gh-pages
```

## Design

Phoenix Maroon (#800000), white, and greys follow the UChicago primary color palette referenced by Pritzker's identity guidance. Graph traces use additional contrasting colors. No university logo assets are included.

- https://creative.uchicago.edu/color-system/
- https://pritzker.uchicago.edu/resources/pritzker-identity-guidelines

## Source scope

This repository contains only the independent web application and its tests. Original SimBioSys binaries, reverse-engineering artifacts, lab answer keys, and private teaching files are excluded. No reuse license has yet been selected.
