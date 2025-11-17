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
  package-lock.json
  vite.config.js                  # Vite config
  vitest.config.mjs               # Vitest config
  .gitignore
  .eslintrc.json
  .prettierrc.json
  .pylintrc                       # Python backend linting

  .github/
    workflows/
      ci.yml                      # GitHub Actions CI pipeline

  docs/
    USER_GUIDE.md
    DEVELOPER_GUIDE.md

  public/                         # Static assets
    soundwave.jpg

  reports/                        # Weekly reports

  src/
    main.jsx                      
    App.jsx                       
    index.css                     # Global styles

    assets/                       # Icons, images, UI assets
      footer/

    backend/                      # Python backend + JS API wrapper
      app.py
      AudioProcessor.py
      requirements.txt

    components/                   # All React components
      AudioImport/
      AudioExport/
      Layout/
      Auth/
      Waveform/
      TrackLane/
      Recording/
      Generic/

    context/                      
    firebase/                     # Firebase 
    hooks/                        # Custom hooks
    managers/                     # Application logic 
    models/                       
    pages/                        
    playback/                     # Playback logic + UI
    tests/                        # Vitest tests (JS) + Pytest tests


```