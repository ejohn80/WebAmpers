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

---

## 2. Repository layout

```bash
WebAmpers/
  README.md                       # Project overview + setup
  coding-guidelines.md            # Team code standards
  team-resources.md               # Internal references

  package.json                    # Frontend dependencies + scripts
  package-lock.json
  vite.config.js                  # Vite config
  vitest.config.mjs               # Vitest config
  jest.config.js                  # (optional) Jest config
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

---

## 3. How to build/run

Run the commands in your terminal:

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open localhost
Navigate and open http://localhost:5173/ 
```

---

## 3. How to test

We have default tests available to test expected functions

```bash
npm run test
```

---

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

---

## 6. Release Preparation

When preparing for a release:

1. Update the version number in package.json.
2. Verify that `npm run lint` and `npm run test` pass.
3. All code is formatted with `npm run format`.
4. Run the production build `npm run build`
5. Navigate and open http://localhost:5173/ 
6. Test expected functionality
