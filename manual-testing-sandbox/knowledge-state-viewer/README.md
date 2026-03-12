# Knowledge State Viewer

A lightweight local web viewer for CodeAware exported knowledge state files.

## What this shows

- All nodes from `codeaware-node-index.latest.json`
- All directed edges from `codeaware-cognitive-edges.latest.json`
- Node mastery score from `codeaware-node-mastery.latest.json`
- Different node type styles (shape + color)
- Hover tooltip with node details
- Click node to focus it as center and highlight neighbors

## Usage

1. Copy these three files into `manual-testing-sandbox/knowledge-state-viewer/data/`:
   - `codeaware-node-index.latest.json`
   - `codeaware-cognitive-edges.latest.json`
   - `codeaware-node-mastery.latest.json`
2. Start local server:

```bash
cd manual-testing-sandbox/knowledge-state-viewer
node server.js
```

3. Open the URL printed in terminal (default `http://localhost:4179`).
4. Click `Reload Data` after replacing files.

## Notes

- This tool is static and local only; no backend dependency.
- Node labels are shortened in the graph, full content is available in tooltip/details panel.
- If the data files are missing, the page shows an error in the status panel.
