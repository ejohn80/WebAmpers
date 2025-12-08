# Table of Contents

1. [Overview](#overview)
2. [Description](#description)
3. [Quick Start Guide](#quick-start-guide)
4. [Functional Use Cases](#functional-use-cases)
5. [How to Contribute](#how-to-contribute)
6. [Repository Structure](#repository-structure)

# Webamp

WebAmp is a web-based application that lets users process audio files or live recordings instantly by applying and stacking customizable sound effects such as noise gates, overdrive, delay, phaser, and chorus. It supports importing and exporting audio in formats like WAV, MP3, and MIDI, includes user accounts with cloud saving, and allows real-time recording and playback with effects. Users can edit audio through trimming, merging, and copying, while version control ensures continuous saving and easy rollback of changes. Dynamic waveform and spectrum visualizations provide intuitive feedback as users shape their sound.

## Quick Start Guide

Instructions are available in the **User Guide**:  
 [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

## Functional Use Cases

Currently supported operational use cases include:

- **Recording audio**
- **Playing imported audio files**
- **Applying live audio effects**
- **Exporting audio**
- **Creating an account and logging in**
- **Saving projects through cloud storage**
- **Live Track Recording**
- **Audio Playback with Time Control**
- **Volume Control**
- **Live Waveform View**

## How to Contribute

Instructions are available in the **Developer Guide**:  
 [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)

The developer guide covers topics including:

- Component structure
- Testing setup
- Coding standards
- Build instructions

## Repository Structure

```bash
WebAmpers/
  README.md                       # Project overview + setup
  coding-guidelines.md            # Team code standards
  team-resources.md               # Internal references

  package.json                    # Frontend dependencies + scripts
  package-lock.json               # NPM lockfile
  index.html                      # Vite entry HTML
  vite.config.js                  # Vite config
  vitest.config.mjs               # Vitest config
  babel.config.js                 # Babel config

  .gitignore                      # Git ignores
  .eslintrc.json                  # ESLint config
  eslint.config.js                # ESLint flat config (JS)
  .prettierrc.json                # Prettier config
  .prettierignore                 # Prettier ignore rules
  .pylintrc                       # Python backend linting

  .github/
    workflows/
      ci.yml                      # GitHub Actions CI pipeline

  docs/
    USER_GUIDE.md
    DEVELOPER_GUIDE.md

  public/                         # Static assets
    soundwave.jpg

  reports/                        # Weekly reports / logs

  node_modules/                   # Installed Node dependencies
  uploads/                        # Root-level uploaded files (if used)
  .venv/                          # Root Python virtual env (if used)
  .pytest_cache/                  # Root Pytest cache (if used)

  src/
    main.jsx                      # React entry
    App.jsx                       # Main app component
    Application.jsx               # Alternate/root app wrapper
    index.css                     # Global styles
    App.css                       # App-specific styles

    assets/                       # Icons, images, UI assets
      footer/                     # Footer-specific assets

    backend/                      # Flask / pydub backend
      app.py                      # Flask entrypoint
      AudioProcessor.py           # Audio processing logic
      requirements.txt            # Backend Python deps
      uploads/                    # Backend-uploaded files
      __pycache__/                # Python bytecode cache
      .venv/                      # Backend-specific venv (if used)
      .pytest_cache/              # Backend Pytest cache (if used)

    CloudSaving/                  # Cloud save logic

    components/                   # All React components
      AudioExport/
      AudioImport/
      Auth/
      Generic/
      Layout/
      Recording/
      Tools/
      TrackLane/
      Waveform/

    context/                      # React context / global state
    firebase/                     # Firebase setup
    hooks/                        # Custom React hooks
    managers/                     # App managers (audio, DB, clipboard, etc.)
    mocks/                        # Test mocks
    models/                       # Data models
    pages/                        # Page-level components (e.g., AudioPage)
    playback/                     # Playback engine + UI
    tests/                        # Vitest tests (JS) + Pytest tests
      __pycache__/                # Test cache

    utils/                        # Shared utilities

```
