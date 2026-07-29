import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import {
  emailConfigured,
  invitationEmail,
  passwordResetEmail,
  sendEmail,
  setTransportForTests,
  verifyEmailConnection,
} from "@/server/email";

function mockTransport(overrides: Partial<Record<"sendMail" | "verify", unknown>> = {}) {
  return {
    sendMail: vi.fn().mockResolvedValue({ messageId: "test" }),
    verify: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as Transporter;
}

afterEach(() => {
  setTransportForTests(null);
  delete process.env.EMAIL_MODE;
  delete process.env.SMTP_HOST;
  delete process.env.APP_URL;
});

describe("send paths (mock transport — no real SMTP in tests)", () => {
  it("reports real success and passes the message through", async () => {
    const t = mockTransport();
    setTransportForTests(t);
    const result = await sendEmail({
      to: "worker@example.com",
      subject: "Test",
      text: "hello",
      html: "<p>hello</p>",
    });
    expect(result).toEqual({ ok: true });
    expect(t.sendMail).toHaveBeenCalledOnce();
    const arg = (t.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.to).toBe("worker@example.com");
    expect(arg.text).toBe("hello");
  });

  it("reports failure as a result, never a throw, and scrubs AUTH echoes", async () => {
    setTransportForTests(
      mockTransport({
        sendMail: vi.fn().mockRejectedValue(new Error("535 AUTH user hunter2 rejected")),
      }),
    );
    const result = await sendEmail({
      to: "worker@example.com",
      subject: "Test",
      text: "x",
      html: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("hunter2");
      expect(result.error).toContain("535");
    }
  });

  it("unconfigured (dev) mode is honest: not sent, caller told to copy the link", async () => {
    const result = await sendEmail({ to: "a@b.co", subject: "S", text: "t", html: "h" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured/i);
    expect(emailConfigured()).toBe(false);
  });

  it("EMAIL_MODE=dev forces dev behavior even with SMTP_HOST set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(emailConfigured()).toBe(true);
    process.env.EMAIL_MODE = "dev";
    expect(emailConfigured()).toBe(false);
  });

  it("verifyEmailConnection reflects the transport verdict", async () => {
    setTransportForTests(mockTransport());
    expect((await verifyEmailConnection()).ok).toBe(true);
    setTransportForTests(null);
    expect((await verifyEmailConnection()).ok).toBe(false);
  });
});

describe("message content", () => {
  it("invitation email carries the APP_URL link, expiry, role, and message — text and HTML", () => {
    process.env.APP_URL = "https://cmms.example.com";
    const expiresAt = new Date("2026-08-05T12:00:00Z");
    const msg = invitationEmail({
      orgName: "Acme Industrial",
      displayName: "Chris",
      invitedByName: "Alice Admin",
      role: "technician",
      personalMessage: "Welcome aboard <keep tools clean>",
      token: "RAW_TOKEN_VALUE",
      expiresAt,
    });
    for (const body of [msg.text, msg.html]) {
      expect(body).toContain("https://cmms.example.com/invite/RAW_TOKEN_VALUE");
      expect(body).toContain("Acme Industrial");
      expect(body).toContain("technician");
      expect(body).toContain("Wed, 05 Aug 2026");
    }
    // HTML-escapes the personal message.
    expect(msg.html).toContain("&lt;keep tools clean&gt;");
    expect(msg.html).not.toContain("<keep tools clean>");
  });

  it("reset email carries the reset link and an ignore-if-not-you note", () => {
    process.env.APP_URL = "https://cmms.example.com";
    const msg = passwordResetEmail({
      orgName: "Acme",
      displayName: "Chris",
      token: "RESET_TOKEN",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect(msg.text).toContain("https://cmms.example.com/reset/RESET_TOKEN");
    expect(msg.text).toMatch(/ignore this message/i);
  });
});
