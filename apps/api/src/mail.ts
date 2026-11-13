import { ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    throw new ServiceUnavailableException(
      "Email delivery is currently unavailable. Contact the O4O operator.",
    );
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USER
      ? {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } catch {
    throw new ServiceUnavailableException(
      "Email delivery is temporarily unavailable",
    );
  }
}
