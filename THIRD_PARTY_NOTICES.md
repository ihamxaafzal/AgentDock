# Third-party software

AgentDock's original code and documentation are covered by the AgentDock
Source-Available License in `LICENSE`. Third-party components keep their own
licenses; the AgentDock license does not replace or restrict those terms.

## Three.js

AgentDock uses **Three.js** (MIT), pinned by `package-lock.json`.

- Project: https://github.com/mrdoob/three.js
- License: https://github.com/mrdoob/three.js/blob/dev/LICENSE

The dependency's original license is retained in `node_modules/three/LICENSE` after installation. When distributing `dist/` or any bundled copy of Three.js, include that license alongside the bundle. The room background, robot sprite sheet, and brain artwork are bundled PNG assets in `public/assets/` and are used by the interface. No separate character-model package or paid-font dependency is required. The AgentDock license applies to these assets only to the extent the copyright holder owns the corresponding rights.

## pypdf

The document-extraction plugin under `agents/aether-documents` bundles pypdf
6.10.0 (BSD 3-Clause). Its copyright and full license are retained in
`agents/aether-documents/PYPDF-LICENSE.txt`. Project: [pypdf](https://github.com/py-pdf/pypdf).

## External integrations

Hermes Agent, Hermes plugins, Google Chrome, and Google Flow are external
projects or services. Their names identify integrations only; AgentDock does
not include or relicense their software and is not endorsed by them.
