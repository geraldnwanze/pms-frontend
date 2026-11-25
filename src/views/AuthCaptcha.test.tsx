import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';
import { Register } from './Register';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { Providers } from '@/app/providers';
import { store } from '@/store';
import { dismissToast, setTheme } from '@/store/uiSlice';
import { resetCaptchaConfig } from '@/lib/captcha';

let searchParams = new URLSearchParams();
const navigate = vi.fn();
vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams, useRouter: () => ({ push: vi.fn() }), usePathname: () => '/login' }));
vi.mock('@/lib/router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>, useNavigate: () => navigate }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), demoUsers: vi.fn(), captchaConfig: vi.fn() },
  setAuthToken: vi.fn(),
}));
import { api, ApiError } from '@/lib/api';

/** A stand-in for Cloudflare's widget: records what was drawn and lets the test play the visitor ticking (or timing out of) the box. */
function fakeWidget() {
  const widgets: { el: HTMLElement; opts: { sitekey: string; theme?: string; callback: (t: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void } }[] = [];
  const g = {
    render: vi.fn((el: HTMLElement, opts: (typeof widgets)[number]['opts']) => { widgets.push({ el, opts }); return String(widgets.length - 1); }),
    reset: vi.fn(),
  };
  window.turnstile = g;
  const current = () => widgets[widgets.length - 1];
  return {
    g,
    widgets,
    tick: (token = 'good-token') => act(() => current().opts.callback(token)),
    expire: () => act(() => current().opts['expired-callback']?.()),
    fail: () => act(() => current().opts['error-callback']?.()),
  };
}

const challengeOn = () => vi.mocked(api.captchaConfig).mockResolvedValue({ enabled: true, siteKey: 'site-key-public' });
const challengeOff = () => vi.mocked(api.captchaConfig).mockResolvedValue({ enabled: false, siteKey: null });
const mount = (ui: React.ReactElement) => render(<Providers>{ui}</Providers>);

async function fillLogin() {
  await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'someone@x.test');
  await userEvent.type(screen.getByPlaceholderText('••••••••'), 'a-password');
}
const signInButton = () => screen.getByRole('button', { name: /Sign in|Signing in/ });

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  resetCaptchaConfig();
  delete window.turnstile;
  store.dispatch(setTheme('light'));
  store.getState().ui.toasts.forEach((t) => store.dispatch(dismissToast(t.id)));
  vi.mocked(api.demoUsers).mockResolvedValue([]);
});

describe('sign-in page', () => {
  it('shows no challenge and asks for nothing while it is off', async () => {
    challengeOff();
    const widget = fakeWidget();
    vi.mocked(api.login).mockRejectedValue(new ApiError('nope', 422, { email: ['These credentials do not match our records.'] }));
    mount(<Login />);
    await waitFor(() => expect(signInButton()).toBeEnabled());

    await fillLogin();
    await userEvent.click(signInButton());

    expect(screen.queryByTestId('captcha-box')).toBeNull();
    expect(widget.g.render).not.toHaveBeenCalled();
    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: 'someone@x.test', password: 'a-password', captchaToken: undefined }));
  });

  it('draws the checkbox with the server’s public key, and keeps Sign in disabled until it is ticked', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<Login />);

    await waitFor(() => expect(widget.g.render).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('captcha-box')).toBeInTheDocument();
    expect(widget.widgets[0].opts.sitekey).toBe('site-key-public');
    expect(signInButton()).toBeDisabled();
  });

  it('is disabled while the settings are still loading', async () => {
    vi.mocked(api.captchaConfig).mockReturnValue(new Promise(() => {}));        // never answers
    fakeWidget();
    mount(<Login />);

    expect(signInButton()).toBeDisabled();
  });

  it('sends the token with the sign-in once the box is ticked', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.login).mockRejectedValue(new ApiError('nope', 422, { email: ['These credentials do not match our records.'] }));
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillLogin();

    await widget.tick('good-token');
    expect(signInButton()).toBeEnabled();
    await userEvent.click(signInButton());

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: 'someone@x.test', password: 'a-password', captchaToken: 'good-token' }));
  });

  it('turns Sign in off again if the tick expires or Cloudflare errors', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());

    await widget.tick();
    expect(signInButton()).toBeEnabled();
    await widget.expire();
    expect(signInButton()).toBeDisabled();

    await widget.tick();
    expect(signInButton()).toBeEnabled();
    await widget.fail();
    expect(signInButton()).toBeDisabled();
  });

  it('asks for a fresh tick after a failed attempt, because a token works once', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.login).mockRejectedValue(new ApiError('nope', 422, { email: ['These credentials do not match our records.'] }));
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillLogin();
    await widget.tick();

    await userEvent.click(signInButton());

    await screen.findByText('These credentials do not match our records.');
    expect(widget.g.reset).toHaveBeenCalledWith('0');
    expect(signInButton()).toBeDisabled();
  });

  it('shows the server’s message when it refuses the challenge', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.login).mockRejectedValue(new ApiError('The given data was invalid.', 422, { captchaToken: ['We could not verify that you are not a robot. Please try again.'] }));
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillLogin();
    await widget.tick();

    await userEvent.click(signInButton());

    expect(await screen.findByText('We could not verify that you are not a robot. Please try again.')).toBeInTheDocument();
    expect(widget.g.reset).toHaveBeenCalled();
  });

  it('sends nothing if the form is submitted without a tick (Enter in a field, a script, a disabled button bypassed)', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillLogin();

    fireEvent.submit(screen.getByPlaceholderText('you@company.com').closest('form')!);

    expect(api.login).not.toHaveBeenCalled();
  });

  it('uses the dark widget in dark mode', async () => {
    challengeOn();
    store.dispatch(setTheme('dark'));                                  // (the app, not the test, owns the <html> class)
    const widget = fakeWidget();
    mount(<Login />);

    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());

    expect(widget.widgets[0].opts.theme).toBe('dark');
    store.dispatch(setTheme('light'));
  });

  it('does not ask a demo-account click to pass the challenge', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.demoUsers).mockResolvedValue([{ id: 'u1', name: 'Demo Manager', email: 'm@x.test', role: 'manager', title: 'Manager', avatarColor: '#0f172a' }]);
    vi.mocked(api.login).mockRejectedValue(new ApiError('x', 500, null));
    mount(<Login />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole('button', { name: /Demo Manager/ }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ userId: 'u1' }));
  });

  it('says so, and lets the visitor retry, if Cloudflare’s script cannot load', async () => {
    challengeOn();
    vi.resetModules();                                  // (the loader remembers its script; this test needs it to fail)
    const original = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('turnstile')) { queueMicrotask(() => node.onerror?.(new Event('error'))); return node; }
      return original(node);
    }) as typeof document.head.appendChild);
    mount(<Login />);

    expect(await screen.findByRole('alert')).toHaveTextContent('The check could not load');
    expect(signInButton()).toBeDisabled();
    spy.mockRestore();
  });

  it('draws the box after "try again" once the script can load', async () => {
    challengeOn();
    vi.resetModules();
    const original = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('turnstile')) { queueMicrotask(() => node.onerror?.(new Event('error'))); return node; }
      return original(node);
    }) as typeof document.head.appendChild);
    mount(<Login />);
    await screen.findByRole('alert');
    spy.mockRestore();
    const widget = fakeWidget();                                         // Cloudflare is reachable now

    await userEvent.click(screen.getByRole('button', { name: 'try again' }));

    await waitFor(() => expect(widget.g.render).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a challenge that is on but has no site key', () => {
  it('says so and keeps the form shut, instead of showing a box nobody can tick', async () => {
    vi.mocked(api.captchaConfig).mockResolvedValue({ enabled: true, siteKey: null });
    const widget = fakeWidget();
    mount(<Login />);

    expect(await screen.findByTestId('captcha-misconfigured')).toHaveTextContent('switched on but not set up');
    expect(screen.queryByTestId('captcha-box')).toBeNull();
    expect(widget.g.render).not.toHaveBeenCalled();
    expect(signInButton()).toBeDisabled();
  });

  it('does not say it when the challenge is simply off', async () => {
    challengeOff();
    fakeWidget();
    mount(<Login />);
    await waitFor(() => expect(signInButton()).toBeEnabled());

    expect(screen.queryByTestId('captcha-misconfigured')).toBeNull();
  });
});

describe('register page', () => {
  async function fillRegister() {
    await userEvent.type(screen.getByPlaceholderText('Amara Okafor'), 'New Person');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'new@x.test');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'a-long-secret');
    await userEvent.type(screen.getByPlaceholderText('Repeat password'), 'a-long-secret');
  }
  const createButton = () => screen.getByRole('button', { name: /Create account|Creating account/ });

  it('needs the box ticked before it will create an account, and sends the token', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.register).mockRejectedValue(new ApiError('no', 422, { email: ['The email has already been taken.'] }));
    mount(<Register />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillRegister();
    expect(createButton()).toBeDisabled();

    await widget.tick('good-token');
    await userEvent.click(createButton());

    await waitFor(() => expect(api.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.test', captchaToken: 'good-token' })));
    await screen.findByText('The email has already been taken.');
    expect(widget.g.reset).toHaveBeenCalled();                     // used up, so tick again
    expect(createButton()).toBeDisabled();
  });

  it('sends nothing if the form is submitted without a tick', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<Register />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await fillRegister();

    fireEvent.submit(screen.getByPlaceholderText('Amara Okafor').closest('form')!);

    expect(api.register).not.toHaveBeenCalled();
  });

  it('keeps the tick when only the passwords did not match (nothing was sent)', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<Register />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('Amara Okafor'), 'New Person');
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'new@x.test');
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'a-long-secret');
    await userEvent.type(screen.getByPlaceholderText('Repeat password'), 'something-else-1');
    await widget.tick();

    await userEvent.click(createButton());

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
    expect(widget.g.reset).not.toHaveBeenCalled();
    expect(createButton()).toBeEnabled();
  });

  it('shows no challenge while it is off', async () => {
    challengeOff();
    const widget = fakeWidget();
    mount(<Register />);

    await waitFor(() => expect(createButton()).toBeEnabled());

    expect(screen.queryByTestId('captcha-box')).toBeNull();
    expect(widget.g.render).not.toHaveBeenCalled();
  });
});

describe('forgot-password page', () => {
  const sendButton = () => screen.getByRole('button', { name: /Send reset link|Sending/ });

  it('needs the box ticked, then sends the token and shows the confirmation', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.forgotPassword).mockResolvedValue({ data: null, message: 'Sent.', meta: null });
    mount(<ForgotPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'someone@x.test');
    expect(sendButton()).toBeDisabled();

    await widget.tick('good-token');
    await userEvent.click(sendButton());

    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('someone@x.test', 'good-token'));
    expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
  });

  it('sends nothing if the form is submitted without a tick', async () => {
    challengeOn();
    const widget = fakeWidget();
    mount(<ForgotPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'someone@x.test');

    fireEvent.submit(screen.getByPlaceholderText('you@company.com').closest('form')!);

    expect(api.forgotPassword).not.toHaveBeenCalled();
  });

  it('asks for a fresh tick when the request is refused', async () => {
    challengeOn();
    const widget = fakeWidget();
    vi.mocked(api.forgotPassword).mockRejectedValue(new ApiError('x', 422, { captchaToken: ['We could not verify that you are not a robot. Please try again.'] }));
    mount(<ForgotPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'someone@x.test');
    await widget.tick();

    await userEvent.click(sendButton());

    expect(await screen.findByText('We could not verify that you are not a robot. Please try again.')).toBeInTheDocument();
    expect(widget.g.reset).toHaveBeenCalled();
    expect(sendButton()).toBeDisabled();
  });

  it('shows no challenge while it is off', async () => {
    challengeOff();
    fakeWidget();
    vi.mocked(api.forgotPassword).mockResolvedValue({ data: null, message: 'Sent.', meta: null });
    mount(<ForgotPassword />);
    await waitFor(() => expect(sendButton()).toBeEnabled());

    expect(screen.queryByTestId('captcha-box')).toBeNull();
    await userEvent.type(screen.getByPlaceholderText('you@company.com'), 'someone@x.test');
    await userEvent.click(sendButton());

    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('someone@x.test', undefined));
  });
});

describe('reset-password page', () => {
  const updateButton = () => screen.getByRole('button', { name: /Update password|Updating/ });
  const linkFromEmail = () => { searchParams = new URLSearchParams({ token: 'emailed-token', email: 'someone@x.test' }); };
  const choosePassword = async () => {
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'a-long-secret');
    await userEvent.type(screen.getByPlaceholderText('Repeat password'), 'a-long-secret');
  };

  it('needs the box ticked, then sends the token with the emailed one and goes to sign-in', async () => {
    challengeOn();
    linkFromEmail();
    const widget = fakeWidget();
    vi.mocked(api.resetPassword).mockResolvedValue({ data: null, message: 'ok', meta: null });
    mount(<ResetPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await choosePassword();
    expect(updateButton()).toBeDisabled();

    await widget.tick('good-token');
    await userEvent.click(updateButton());

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith({ email: 'someone@x.test', token: 'emailed-token', password: 'a-long-secret', password_confirmation: 'a-long-secret', captchaToken: 'good-token' }));
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('sends nothing if the form is submitted without a tick', async () => {
    challengeOn();
    linkFromEmail();
    const widget = fakeWidget();
    mount(<ResetPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await choosePassword();

    fireEvent.submit(screen.getByPlaceholderText('Repeat password').closest('form')!);

    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it('keeps the tick when only the two passwords did not match (nothing was sent)', async () => {
    challengeOn();
    linkFromEmail();
    const widget = fakeWidget();
    mount(<ResetPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'a-long-secret');
    await userEvent.type(screen.getByPlaceholderText('Repeat password'), 'something-else');
    await widget.tick();

    await userEvent.click(updateButton());

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(widget.g.reset).not.toHaveBeenCalled();
    expect(updateButton()).toBeEnabled();
  });

  it('asks for a fresh tick when the request is refused, and stays on the page', async () => {
    challengeOn();
    linkFromEmail();
    const widget = fakeWidget();
    vi.mocked(api.resetPassword).mockRejectedValue(new ApiError('x', 422, { captchaToken: ['We could not verify that you are not a robot. Please try again.'] }));
    mount(<ResetPassword />);
    await waitFor(() => expect(widget.g.render).toHaveBeenCalled());
    await choosePassword();
    await widget.tick();

    await userEvent.click(updateButton());

    expect(await screen.findByText('We could not verify that you are not a robot. Please try again.')).toBeInTheDocument();
    expect(widget.g.reset).toHaveBeenCalled();
    expect(updateButton()).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows no challenge while it is off, and sends no token', async () => {
    challengeOff();
    linkFromEmail();
    fakeWidget();
    vi.mocked(api.resetPassword).mockResolvedValue({ data: null, message: 'ok', meta: null });
    mount(<ResetPassword />);
    await waitFor(() => expect(updateButton()).toBeEnabled());

    expect(screen.queryByTestId('captcha-box')).toBeNull();
    await choosePassword();
    await userEvent.click(updateButton());

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith({ email: 'someone@x.test', token: 'emailed-token', password: 'a-long-secret', password_confirmation: 'a-long-secret', captchaToken: undefined }));
  });

  it('shows no challenge on a link that is missing its token', async () => {
    challengeOn();
    fakeWidget();
    mount(<ResetPassword />);

    expect(await screen.findByText(/missing its token/)).toBeInTheDocument();
    expect(screen.queryByTestId('captcha-box')).toBeNull();
  });
});
