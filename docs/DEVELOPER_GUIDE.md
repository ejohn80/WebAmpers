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
  src/                       # React source code
    components/             # UI components
  public/                    # Static assets (icons, etc.)
  backend/                   # (planned) Python for export & format conversion
    tests/                   # Pytest tests for backend
  docs/
    USER_GUIDE.md            # User manual
    DEVELOPER_GUIDE.md       # This file
  .github/
    workflows/ci.yml         # GitHub Actions pipeline
  package.json               # Frontend deps and scripts
  package-lock.json          # Locked versions for reproducible installs
  eslint.config.js           # ESLint rules
  prettier config (...whatever you’re using)
  README.md                  # Project overview + links

```

---

## 3. How to build/run

Run the commands in your terminal:

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

```

---

## 4. How to test

We have default tests available to test expected functions

```bash
npm run test
```

---

## 5. How to add tests

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
5. Test expected functionality
