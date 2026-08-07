# nestjs-boot Web Generator

A single-page web app that lets you visually configure and generate a NestJS microservice project. Zero build step required.

## Run Locally

```bash
cd packages/web-generator
npx serve .
# or just open index.html in your browser
```

## Deploy to GitHub Pages

1. Push the `packages/web-generator/` directory to your repo
2. Go to Settings > Pages > Source: Deploy from a branch
3. Set the folder to `/packages/web-generator` (or copy contents to root)

Alternatively, use a GitHub Action:

```yaml
# .github/workflows/pages.yml
name: Deploy Web Generator
on:
  push:
    branches: [master]
    paths: ['packages/web-generator/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/web-generator
      - uses: actions/deploy-pages@v4
```

## Features

- **Real-time preview** — changing any option instantly updates the code preview + architecture diagram
- **Zero build step** — open `index.html` in browser, it works
- **ZIP download** — complete project with all files, ready to `npm install && npm run start:dev`
- **CLI command copy** — for users who prefer the terminal
- **Mobile friendly** — works on phone (for conference talks / demos)

## CDN Dependencies

No `npm install` needed. Everything loads from CDN:

- Tailwind CSS — utility-first CSS
- Prism.js — syntax highlighting
- Mermaid.js — architecture diagrams
- JSZip — in-browser ZIP generation
- FileSaver.js — download trigger

## File Structure

```
packages/web-generator/
  index.html          # Single-page app entry
  css/custom.css      # Custom styles (code preview, file tree, etc.)
  js/generator.js     # Core logic (config reader, file tree, ZIP, diagrams)
  js/templates.js     # All project templates as JS template literals
  README.md           # This file
```
