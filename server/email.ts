import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@egixia.com";

// Inicializar SendGrid
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Envía un correo con el magic link de autenticación
 * @param email Dirección de correo del destinatario
 * @param token Token único del magic link
 * @param callbackUrl URL completa del callback (ej: https://app.manus.space/admin/callback?token=xxx)
 * @returns Promise<boolean> true si el envío fue exitoso, false en caso contrario
 */
export async function sendMagicLinkEmail(
  email: string,
  token: string,
  callbackUrl: string
): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.error("[SendGrid] API Key no configurada. Configure SENDGRID_API_KEY en las variables de entorno.");
    return false;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso Administrador - Egixia OC Sync</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Egixia OC Sync</h1>
              <p style="margin: 8px 0 0; color: #d1fae5; font-size: 14px;">Portal de Administración</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1f2937; font-size: 20px; font-weight: 600;">Acceso Solicitado</h2>
              <p style="margin: 0 0 24px; color: #6b7280; font-size: 16px; line-height: 1.6;">
                Has solicitado acceso al panel de administración de Egixia OC Sync. Haz clic en el botón de abajo para iniciar sesión de forma segura.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${callbackUrl}" style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);">
                      Acceder al Panel
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; color: #9ca3af; font-size: 14px; line-height: 1.6;">
                <strong>Nota de seguridad:</strong> Este enlace es válido por 15 minutos y solo puede usarse una vez. Si no solicitaste este acceso, puedes ignorar este correo de forma segura.
              </p>
              
              <!-- Alternative Link -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin: 0; word-break: break-all;">
                  <a href="${callbackUrl}" style="color: #10b981; font-size: 13px; text-decoration: none;">${callbackUrl}</a>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} Egixia. Todos los derechos reservados.
              </p>
              <p style="margin: 8px 0 0; color: #9ca3af; font-size: 12px;">
                Sistema de Verificación y Sincronización de Órdenes de Compra
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `
Acceso Administrador - Egixia OC Sync

Has solicitado acceso al panel de administración de Egixia OC Sync.

Para iniciar sesión de forma segura, visita el siguiente enlace:
${callbackUrl}

Este enlace es válido por 15 minutos y solo puede usarse una vez.

Si no solicitaste este acceso, puedes ignorar este correo de forma segura.

---
© ${new Date().getFullYear()} Egixia. Todos los derechos reservados.
Sistema de Verificación y Sincronización de Órdenes de Compra
  `;

  const msg = {
    to: email,
    from: SENDGRID_FROM_EMAIL,
    subject: "Acceso Administrador - Egixia OC Sync",
    text: textContent,
    html: htmlContent,
  };

  try {
    await sgMail.send(msg);
    console.log(`[SendGrid] Magic link enviado exitosamente a ${email}`);
    return true;
  } catch (error: any) {
    console.error("[SendGrid] Error al enviar correo:", error);
    if (error.response) {
      console.error("[SendGrid] Response body:", error.response.body);
    }
    return false;
  }
}

/**
 * Verifica que SendGrid esté correctamente configurado
 * @returns boolean true si SendGrid está configurado, false en caso contrario
 */
export function isSendGridConfigured(): boolean {
  return !!SENDGRID_API_KEY && !!SENDGRID_FROM_EMAIL;
}
