import { Resend } from 'resend';
import { logger } from './logger';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function validateConfig(): void {
  if (!RESEND_API_KEY) {
    throw new Error(
      'Missing RESEND_API_KEY environment variable.\n' +
      'Set it in .env.local or your Vercel project environment variables.',
    );
  }
  if (!EMAIL_FROM) {
    throw new Error(
      'Missing EMAIL_FROM environment variable.\n' +
      'Set it to the verified sender email in your Resend account.',
    );
  }
}

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    validateConfig();
    _resend = new Resend(RESEND_API_KEY);
  }
  return _resend;
}

function buildResetEmailHtml(name: string, resetUrl: string, lang: string): string {
  const isAr = lang === 'ar';
  const greeting = isAr ? `مرحباً ${name}` : `Hello ${name}`;
  const title = isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password';
  const body = isAr
    ? 'لقد طلبت إعادة تعيين كلمة مرور حسابك في SmartClinic. اضغط على الزر أدناه لإعادة تعيينها.'
    : 'You requested a password reset for your SmartClinic account. Click the button below to reset it.';
  const buttonText = isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password';
  const expireNotice = isAr
    ? 'رابط إعادة التعيين صالح لمدة ساعة واحدة فقط.'
    : 'This reset link is valid for 1 hour only.';
  const ignoreNotice = isAr
    ? 'إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد الإلكتروني.'
    : 'If you did not request a password reset, please ignore this email.';
  const securityTitle = isAr ? '🔒 أمان' : '🔒 Security';
  const securityText = isAr
    ? 'لن نطلب منك أبداً كلمة المرور عبر البريد الإلكتروني.'
    : 'We will never ask for your password by email.';
  const footerText = isAr
    ? '© 2026 SmartClinic. جميع الحقوق محفوظة.'
    : '© 2026 SmartClinic. All rights reserved.';

  return `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F8;padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,0.09)">
          <tr>
            <td style="background:linear-gradient(135deg,#0A6EBD 0%,#064A8B 100%);padding:32px 40px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.02em">SmartClinic</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px">${isAr ? 'نظام إدارة العيادة الذكية' : 'Intelligent Clinic Management'}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px">
              <p style="margin:0 0 16px;font-size:16px;color:#1E293B;font-weight:600">${greeting}${isAr ? '،' : ','}</p>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">${body}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
                <tr>
                  <td align="center" style="background-color:#0A6EBD;border-radius:8px;padding:14px 32px">
                    <a href="${resetUrl}" target="_blank" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;display:inline-block">${buttonText}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;text-align:center">${expireNotice}</p>
              <p style="margin:0 0 24px;font-size:12px;color:#94A3B8;text-align:center">${ignoreNotice}</p>
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
              <p style="margin:0 0 4px;font-size:13px;color:#1E293B;font-weight:600">${securityTitle}</p>
              <p style="margin:0 0 24px;font-size:12px;color:#64748B">${securityText}</p>
              <p style="margin:0;font-size:11px;color:#94A3B8">${footerText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildReminderEmailHtml(
  patientName: string,
  doctorName: string,
  service: string,
  date: string,
  time: string,
  lang: string,
): string {
  const isAr = lang === 'ar';
  const greeting = isAr ? `مرحباً ${patientName}` : `Hello ${patientName}`;
  const title = isAr ? 'تذكير بالموعد — SmartClinic' : 'Appointment Reminder — SmartClinic';
  const headerTitle = isAr ? 'تذكير بالموعد' : 'Appointment Reminder';
  const subHeader = isAr
    ? 'هذا تذكير بموعدك القادم في العيادة'
    : 'This is a reminder for your upcoming clinic appointment';
  const doctorLabel = isAr ? 'الطبيب' : 'Doctor';
  const serviceLabel = isAr ? 'الخدمة' : 'Service';
  const dateLabel = isAr ? 'التاريخ' : 'Date';
  const timeLabel = isAr ? 'الوقت' : 'Time';
  const arriveEarly = isAr
    ? 'يرجى الحضور قبل الموعد بـ 10 دقائق'
    : 'Please arrive 10 minutes before your appointment';
  const contactInfo = isAr
    ? 'للاستفسار أو التعديل، يرجى الاتصال بالعيادة'
    : 'For inquiries or changes, please contact the clinic';
  const footerText = isAr
    ? '© 2026 SmartClinic. جميع الحقوق محفوظة.'
    : '© 2026 SmartClinic. All rights reserved.';

  return `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F8;padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,0.09)">
          <tr>
            <td style="background:linear-gradient(135deg,#0A6EBD 0%,#064A8B 100%);padding:32px 40px;text-align:center">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.02em">SmartClinic</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px">${headerTitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px">
              <p style="margin:0 0 16px;font-size:16px;color:#1E293B;font-weight:600">${greeting}${isAr ? '،' : ','}</p>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6">${subHeader}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:#F8FAFC;border-radius:8px;padding:16px">
                <tr><td style="padding:6px 0;font-size:13px;color:#64748B">${doctorLabel}:</td><td style="padding:6px 0;font-size:14px;color:#1E293B;font-weight:600">${doctorName}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#64748B">${serviceLabel}:</td><td style="padding:6px 0;font-size:14px;color:#1E293B;font-weight:600">${service}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#64748B">${dateLabel}:</td><td style="padding:6px 0;font-size:14px;color:#1E293B;font-weight:600">${date}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#64748B">${timeLabel}:</td><td style="padding:6px 0;font-size:14px;color:#1E293B;font-weight:600">${time}</td></tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#0A6EBD;font-weight:600">${arriveEarly}</p>
              <p style="margin:0 0 24px;font-size:12px;color:#64748B">${contactInfo}</p>
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">
              <p style="margin:0;font-size:11px;color:#94A3B8">${footerText}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendAppointmentReminderEmail(
  email: string,
  patientName: string,
  doctorName: string,
  date: string,
  time: string,
  service: string,
  lang: string,
): Promise<void> {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    logger.error('[Email] Invalid configuration — RESEND_API_KEY or EMAIL_FROM not set');
    throw new Error('Email service is not configured');
  }

  const resend = getResend();
  const subject = lang === 'ar'
    ? `تذكير بالموعد — ${date} ${time} — SmartClinic`
    : `Appointment Reminder — ${date} ${time} — SmartClinic`;

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject,
      html: buildReminderEmailHtml(patientName, doctorName, service, date, time, lang),
    });

    if (error) {
      logger.error('[Email] Resend provider rejected the appointment reminder', {
        email,
        providerError: error.message,
      });
      throw new Error(`Failed to send appointment reminder email: ${error.message}`);
    }

    logger.info('[Email] Appointment reminder email sent', { email, patientName });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to send appointment reminder email')) {
      throw err;
    }
    logger.error('[Email] Failed to send appointment reminder email', {
      email,
      patientName,
      error: String(err),
    });
    throw new Error('Failed to send appointment reminder email. Please try again later.');
  }
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
  lang: string,
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password/${token}`;

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    logger.error('[Email] Invalid configuration — RESEND_API_KEY or EMAIL_FROM not set');
    throw new Error('Email service is not configured');
  }

  const resend = getResend();

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: lang === 'ar' ? 'إعادة تعيين كلمة المرور — SmartClinic' : 'Reset Your Password — SmartClinic',
      html: buildResetEmailHtml(name, resetUrl, lang),
    });

    if (error) {
      logger.error('[Email] Resend provider rejected the send', {
        email,
        providerError: error.message,
      });
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    logger.info('[Email] Password reset email sent', { email });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to send password reset email')) {
      throw err;
    }
    logger.error('[Email] Failed to send password reset email', {
      email,
      error: String(err),
    });
    throw new Error('Failed to send password reset email. Please try again later.');
  }
}
