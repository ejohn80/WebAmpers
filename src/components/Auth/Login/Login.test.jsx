// Hoisted handle for assertions
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  // also export all names imported by Login.jsx
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(),
  deleteUser: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login.jsx";
import { signInWithEmailAndPassword } from "firebase/auth";

beforeEach(() => {
  mockNavigate.mockReset();
  signInWithEmailAndPassword.mockReset();
  signInWithEmailAndPassword.mockResolvedValue({ user: { uid: "u1" } });
});

function setup() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  return {
    email: screen.getByPlaceholderText("Email"),
    password: screen.getByPlaceholderText("Password"),
    submit: screen.getByRole("button", { name: /login/i }),
  };
}

test("logs in and navigates home", async () => {
  const { email, password, submit } = setup();
  await userEvent.type(email, "user@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);

  expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
    expect.any(Object),
    "user@example.com",
    "secret123",
  );
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
});

test("invalid email blur shows message", async () => {
  const { email } = setup();
  await userEvent.type(email, "not-an-email");
  await userEvent.tab();
  expect(
    await screen.findByText(/please enter a valid email address/i),
  ).toBeInTheDocument();
});

test("limit shows error", async () => {
  signInWithEmailAndPassword.mockRejectedValueOnce({
    code: "auth/too-many-requests",
  });
  const { email, password, submit } = setup();
  await userEvent.type(email, "a@b.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);
  expect(
    await screen.findByText(/too many login attempts/i),
  ).toBeInTheDocument();
});

test("shows generic invalid creds message on unknown error", async () => {
  signInWithEmailAndPassword.mockRejectedValueOnce({
    code: "auth/some-other-error",
  });
  const { email, password, submit } = setup();
  await userEvent.type(email, "a@b.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);
  expect(
    await screen.findByText(/invalid email or password/i),
  ).toBeInTheDocument();
});

test("email blur: no error when empty, clears when valid", async () => {
  const { email } = setup();
  email.blur();
  expect(
    screen.queryByText(/please enter a valid email/i),
  ).not.toBeInTheDocument();

  await userEvent.type(email, "bad");
  email.blur();
  expect(
    await screen.findByText(/please enter a valid email/i),
  ).toBeInTheDocument();

  await userEvent.clear(email);
  await userEvent.type(email, "user@example.com");
  email.blur();
  await waitFor(() => {
    expect(
      screen.queryByText(/please enter a valid email/i),
    ).not.toBeInTheDocument();
  });
});

test("submits on Enter in password field", async () => {
  const { email, password } = setup();
  await userEvent.type(email, "user@example.com");
  await userEvent.type(password, "secret123{enter}");
  await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalled());
});

test("toggles password visibility", async () => {
  setup();
  const pwd = screen.getByPlaceholderText("Password");
  expect(pwd).toHaveAttribute("type", "password");
  // Click the eye icon near the password field
  const toggle = document.querySelector('[class*="passwordToggleIcon"]');
  await userEvent.click(toggle);
  expect(pwd).toHaveAttribute("type", "text");
});
