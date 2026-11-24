import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class EmailVerificationService {
  constructor(private readonly config: ConfigService) {}

  async sendRegistrationCode(email: string, code: string): Promise<void> {
    const host = this.config.get<string>("MAIL_HOST")?.trim();
    const from = this.config.get<string>("MAIL_FROM")?.trim();
    if (!host || !from) {
      throw new ServiceUnavailableException(
        "Email registration is unavailable because SMTP is not configured.",
      );
    }

    const portValue = this.config.get<string>("MAIL_PORT") ?? "587";
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException("MAIL_PORT must be a valid TCP port.");
    }

    const secureValue = this.config.get<string>("MAIL_SECURE")?.toLowerCase();
    if (secureValue && secureValue !== "true" && secureValue !== "false") {
      throw new ServiceUnavailableException("MAIL_SECURE must be true or false.");
    }
    const secure = secureValue ? secureValue === "true" : port === 465;

    const username = this.config.get<string>("MAIL_USER")?.trim();
    const password = this.config.get<string>("MAIL_PASSWORD");
    if (Boolean(username) !== Boolean(password)) {
      throw new ServiceUnavailableException(
        "MAIL_USER and MAIL_PASSWORD must both be configured or both be empty.",
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: "IT Asset Platform email verification",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your IT Asset Platform verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    });
  }
}
