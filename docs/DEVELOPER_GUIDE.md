# WebAmp Developer Documentation

---

## 1. How to Obtain the Source Code

All WebAmp code is hosted in a single public GitHub repository:  
[https://github.com/ejohn80/WebAmpers](https://github.com/ejohn80/WebAmpers)

Clone the repo:

```bash
git clone https://github.com/ejohn80/WebAmpers.git
cd WebAmpers
```

## 2. Repository layout

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

## 3. How to build/run

Run the commands in your terminal:

First ensure you are in the WebAmper directory:

```bash
cd WebAmpers
```

Then...

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

```

3. Open localhost
   Navigate and open http://localhost:5173/

4. Setup Python Backend:

### Backend Prerequisites:

- **Python 3.12**
- **FFmpeg**

### FFmpeg Installation

FFmpeg can be installed directly from the terminal on macOS, Linux, and Windows.

**macOS (Homebrew)**

```bash
brew install ffmpeg
```

**Linux (Ubuntu / Debian)**

```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows (Terminal)**

Using winget

```bash
winget install Gyan.FFmpeg
```

**Verify Installation**

```bash
ffmpeg -version
```

**Install Directly From Website**

If you are having issues with these commands, please follow the instructions on the FFmpeg page.  
Download FFmpeg from: [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

### Create a Virtual Environment

If `python` doesn’t work, try `py` (Windows) or `python3` (macOS/Linux).

| Operating System         | Command               |
| ------------------------ | --------------------- |
| Windows (Command Prompt) | python -m venv .venv  |
| Windows (PowerShell)     | python -m venv .venv  |
| macOS / Linux            | python3 -m venv .venv |

### Activate the Virtual Environment

| Operating System         | Activation Command           |
| ------------------------ | ---------------------------- |
| Windows (Command Prompt) | .\.venv\Scripts\activate.bat |
| Windows (PowerShell)     | .\.venv\Scripts\Activate.ps1 |
| macOS / Linux (Bash/Zsh) | source .venv/bin/activate    |

When activated, your terminal should show the environment name like

```
(.venv)
```

### Install Backend Dependencies

```bash
pip install -r src/backend/requirements.txt
```

### Optional: Run Backend Tools

**Run tests (Pytest):**

```bash
pytest
```

**Run linter (Pylint):**

```bash
pylint example.py
```

### Start the Backend Server

```bash
cd src/backend
flask run
```

## 3. How to test

We have default tests available to test expected functions

```bash
npm run test
```

## 4. How to add tests

Name the file in this format:

```bash
FILENAME.test.jsx
```

### Example Test

```jsx
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, test} from "vitest";
import Login from "./Login.jsx";

test("shows error on invalid login", async () => {
  render(<Login />);
  await userEvent.type(screen.getByLabelText(/Email/i), "bademail");
  await userEvent.click(screen.getByText(/Submit/i));
  expect(screen.getByText(/Invalid email/i)).toBeInTheDocument();
});
```

Then run:

```bash
npm run test
```

## 6. Contributing

When preparing for a release:

1. Update the version number in package.json.
2. Verify that `npm run lint` and `npm run test` pass.
3. All code is formatted with `npm run format`.
4. Run the production build `npm run build`
5. Navigate and open http://localhost:5173/
6. Test expected functionality
7. Create and push to seperate branch
8. Ensure it passes all CI tests
9. Create a pull request
