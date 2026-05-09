/**
 * StudyFlow — test email HTML template.
 *
 * Built with inline styles throughout because email clients strip <style>
 * blocks and class names.  Tested look: dark card on near-black background,
 * brand-indigo accent bar, clean monospaced meta block.
 */

export interface TestEmailProps {
  triggeredBy: string; // user email that clicked the button
  timestamp:   string; // ISO string
}

export function buildTestEmailHtml({ triggeredBy, timestamp }: TestEmailProps): string {
  const date = new Date(timestamp).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>StudyFlow Email System Test</title>
</head>
<body style="margin:0;padding:0;background-color:#0c0c0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c0c0f;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table role="presentation" width="100%" style="max-width:560px;border-radius:16px;overflow:hidden;border:1px solid #1e1e2a;background-color:#111118;">

          <!-- Brand bar -->
          <tr>
            <td style="background:linear-gradient(90deg,#6366f1 0%,#818cf8 100%);height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #1e1e2a;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:14px;vertical-align:middle;">
                    <!-- Icon circle -->
                    <div style="width:42px;height:42px;border-radius:12px;background-color:#6366f1;display:inline-flex;align-items:center;justify-content:center;font-size:20px;line-height:42px;text-align:center;">📚</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#f4f4f5;letter-spacing:-0.3px;">StudyFlow</p>
                    <p style="margin:2px 0 0;font-size:12px;color:#71717a;letter-spacing:0.5px;">AI Study Dashboard</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">

              <!-- Status badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background-color:#14532d;border:1px solid #166534;border-radius:8px;padding:6px 12px;">
                    <p style="margin:0;font-size:12px;font-weight:600;color:#4ade80;letter-spacing:0.3px;">
                      ✓ &nbsp;System operational
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f4f4f5;letter-spacing:-0.5px;line-height:1.3;">
                Email Infrastructure Test
              </h1>

              <!-- Body copy -->
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#a1a1aa;">
                If you're reading this, StudyFlow email infrastructure is working. The Resend integration is configured correctly and ready for weekly study reports.
              </p>

              <!-- Meta box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0c0c0f;border:1px solid #1e1e2a;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="padding:4px 0;">

                    <!-- Row -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 16px;border-bottom:1px solid #1e1e2a;">
                          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#52525b;">Timestamp</p>
                          <p style="margin:3px 0 0;font-size:13px;color:#a1a1aa;font-family:'SF Mono',Monaco,'Cascadia Code',Consolas,monospace;">${date}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 16px;border-bottom:1px solid #1e1e2a;">
                          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#52525b;">Triggered by</p>
                          <p style="margin:3px 0 0;font-size:13px;color:#a1a1aa;font-family:'SF Mono',Monaco,'Cascadia Code',Consolas,monospace;">${triggeredBy}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 16px;">
                          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#52525b;">Delivery provider</p>
                          <p style="margin:3px 0 0;font-size:13px;color:#a1a1aa;font-family:'SF Mono',Monaco,'Cascadia Code',Consolas,monospace;">Resend</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px;border-top:1px solid #1e1e2a;">
              <p style="margin:0;font-size:12px;color:#3f3f46;text-align:center;line-height:1.6;">
                This is an automated test email from StudyFlow.<br/>
                No action is required — you can safely ignore this message.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Outer footer -->
        <table role="presentation" width="100%" style="max-width:560px;margin-top:20px;">
          <tr>
            <td style="text-align:center;">
              <p style="margin:0;font-size:11px;color:#27272a;">
                StudyFlow &nbsp;·&nbsp; AI-powered study analytics
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`.trim();
}
