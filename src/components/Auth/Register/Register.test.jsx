import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, test, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Register from "./Register.jsx";

// ---- Hoisted shared mocks ----
const h = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  setDoc: vi.fn(),
  docCalls: [],
}));

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => h.mockNavigate,
    useLocation: () => ({ state: undefined }),
  };
});

// Mock the local firebase module
vi.mock("../../../firebase/firebase", () => ({
  auth: {},
  db: {},
}));

// Mock Firebase Auth SDK
vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: h.createUserWithEmailAndPassword,
  getAuth: vi.fn(() => ({})),
}));

// Mock Firestore SDK
vi.mock("firebase/firestore", () => ({
  setDoc: h.setDoc,
  doc: (...args) => {
    h.docCalls.push(args);
    return {};
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.createUserWithEmailAndPassword.mockResolvedValue({
    user: { uid: "abc123" },
  });
  h.setDoc.mockResolvedValue({});
});

function setup() {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
  const username = screen.getByPlaceholderText(/username/i);
  const email = screen.getByPlaceholderText(/email/i);
  const password = screen.getByPlaceholderText(/password/i);
  const submit = screen.getByRole("button", { name: /register/i });
  return { username, email, password, submit };
}

test("registers user and navigates home", async () => {
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "alice");
  await userEvent.type(email, "alice@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);

  expect(h.createUserWithEmailAndPassword).toHaveBeenCalledWith(
    expect.anything(),
    "alice@example.com",
    "secret123",
  );

  await waitFor(() => expect(h.setDoc).toHaveBeenCalled());

  // Confirm Firestore writes to users/{uid}
  expect(h.docCalls[0][1]).toBe("users");
  expect(h.docCalls[0][2]).toBe("abc123");

  await waitFor(() => expect(h.mockNavigate).toHaveBeenCalledWith("/"));
});

test("shows specific auth errors", async () => {
  h.createUserWithEmailAndPassword.mockRejectedValueOnce({
    code: "auth/email-already-in-use",
  });
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "bob");
  await userEvent.type(email, "bob@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);

  expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
});

test("navigates home after successful register", async () => {
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "alice");
  await userEvent.type(email, "alice@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);

  await waitFor(() => expect(h.mockNavigate).toHaveBeenCalledWith("/"));
});

test("shows spinner while registering then hides", async () => {
  // delay auth to see spinner
  h.createUserWithEmailAndPassword.mockImplementation(
    () =>
      new Promise((res) => setTimeout(() => res({ user: { uid: "x" } }), 50)),
  );

  const { username, email, password, submit } = setup();
  await userEvent.type(username, "a");
  await userEvent.type(email, "a@b.com");
  await userEvent.type(password, "secret123");

  await userEvent.click(submit);
  // spinner visible
  expect(screen.getByRole("button", { name: "" })).toBeInTheDocument();
  expect(
    screen.getByText(
      (t, n) => n.tagName === "SPAN" && /BeatLoader/i.test(n.innerHTML),
    ),
  ).toBeTruthy();

  await waitFor(() => expect(h.mockNavigate).toHaveBeenCalledWith("/"));
  // spinner gone, button text back
  expect(screen.getByRole("button", { name: /register/i })).toBeInTheDocument();
});

test("invalid email blur shows message", async () => {
  const { email } = setup();
  await userEvent.type(email, "not-an-email");
  await userEvent.tab(); // triggers onBlur

  expect(
    await screen.findByText(/please enter a valid email address/i),
  ).toBeInTheDocument();
});

test("typing a valid email clears the error", async () => {
  const { email } = setup();
  await userEvent.type(email, "bad");
  await userEvent.tab();
  expect(
    await screen.findByText(/please enter a valid email address/i),
  ).toBeInTheDocument();

  await userEvent.clear(email);
  await userEvent.type(email, "good@example.com");
  // cleared as soon as valid
  await waitFor(() => {
    expect(
      screen.queryByText(/please enter a valid email address/i),
    ).toBeNull();
  });
});

test("shows invalid email error from Firebase", async () => {
  h.createUserWithEmailAndPassword.mockRejectedValueOnce({
    code: "auth/invalid-email",
  });
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "bob");
  await userEvent.type(email, "x@y");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);
  expect(await screen.findByText(/invalid email address/i)).toBeInTheDocument();
});

test("shows weak password error", async () => {
  h.createUserWithEmailAndPassword.mockRejectedValueOnce({
    code: "auth/weak-password",
  });
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "bob");
  await userEvent.type(email, "bob@example.com");
  await userEvent.type(password, "123");
  await userEvent.click(submit);
  expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument();
});

test("shows unknown error message string", async () => {
  h.createUserWithEmailAndPassword.mockRejectedValueOnce({ message: "kaboom" });
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "bob");
  await userEvent.type(email, "bob@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);
  expect(await screen.findByText(/kaboom/i)).toBeInTheDocument();
});

test("writes correct user profile to Firestore", async () => {
  const { username, email, password, submit } = setup();
  await userEvent.type(username, "carol");
  await userEvent.type(email, "carol@example.com");
  await userEvent.type(password, "secret123");
  await userEvent.click(submit);

  await waitFor(() => expect(h.setDoc).toHaveBeenCalled());
  const [, data] = h.setDoc.mock.calls[0]; // setDoc(docRef, data)
  expect(data).toEqual(
    expect.objectContaining({
      uid: "abc123",
      username: "carol",
      email: "carol@example.com",
      createdAt: expect.any(Date),
    }),
  );
});
