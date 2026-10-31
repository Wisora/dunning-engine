import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { Database } from '@/types/database.types';

// 1. Initialize Supabase Service Role client (bypasses RLS for secure background tasks)
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// 2. Paystack Payload Interfaces
interface PaystackCustomer {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  customer_code?: string;
}

interface PaystackData {
  reference?: string;
  amount: number; // Paystack sends amounts in subunit (e.g., kobo/cents)
  currency: string;
  customer: PaystackCustomer;
  invoice_code?: string;
  subscription_code?: string;
  metadata?: Record<string, unknown>;
  gateway_response?: string;
}

interface PaystackWebhookEvent {
  event: 'charge.failed' | 'invoice.payment_failed' | string;
  data: PaystackData;
}

// 3. Helper: Timing-safe HMAC SHA-512 Signature Verification
function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const signatureBuffer = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

// 4. Helper: HTML Dunning Email Builder
function generateRecoveryEmailHtml({
  businessName,
  customerName,
  formattedAmount,
  recoveryUrl,
  supportEmail,
}: {
  businessName: string;
  customerName: string;
  formattedAmount: string;
  recoveryUrl: string;
  supportEmail: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Action Required</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px 20px; color: #111827;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #f3f4f6;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">${businessName}</h2>
    </div>
    <div style="padding: 32px;">
      <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #dc2626;">We were unable to process your payment</h1>
      <p style="margin: 0 0 20px; font-size: 15px; line-height: 24px; color: #4b5563;">
        Hi ${customerName},<br><br>
        Your recent subscription payment of <strong>${formattedAmount}</strong> failed to process. To avoid any service interruptions, please review and update your payment method below.
      </p>
      
      <div style="margin: 32px 0;">
        <a href="${recoveryUrl}" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; text-align: center;">
          Update Payment Method & Pay →
        </a>
      </div>

      <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; line-height: 20px;">
        This secure link expires in 7 days. If you've already resolved this, you can safely ignore this email.
      </p>
      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 20px;">
        Need help? Contact our billing support directly at <a href="mailto:${supportEmail}" style="color: #2563eb; text-decoration: underline;">${supportEmail}</a>.
      </p>
    </div>
    <div style="padding: 20px 32px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center;">
      <span style="font-size: 12px; color: #9ca3af;">Secured by DunningEngine & Paystack</span>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// 5. Webhook POST Route Handler
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature');
    const { searchParams } = new URL(req.url);
    const tenantIdParam = searchParams.get('tenantId');

    // 5.1 Determine Tenant Context
    let tenantQuery = supabaseAdmin.from('tenants').select('*');
    
    if (tenantIdParam) {
      tenantQuery = tenantQuery.eq('id', tenantIdParam);
    }

    const { data: tenant, error: tenantError } = await tenantQuery.single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or invalid tenantId parameter' },
        { status: 404 }
      );
    }

    // Tenant-configured secret key takes priority; fall back to platform secret key if not set
    const paystackSecretKey =
      tenant.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY;

    if (!paystackSecretKey) {
      return NextResponse.json(
        { error: 'Paystack secret key is missing for this tenant' },
        { status: 500 }
      );
    }

    // 5.2 Validate Webhook Signature
    const isSignatureValid = verifyPaystackSignature(
      rawBody,
      signature,
      paystackSecretKey
    );

    if (!isSignatureValid) {
      return NextResponse.json(
        { error: 'Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // 5.3 Parse Payload & Filter Target Events
    const eventPayload: PaystackWebhookEvent = JSON.parse(rawBody);
    const { event, data } = eventPayload;

    if (event !== 'charge.failed' && event !== 'invoice.payment_failed') {
      // Gracefully acknowledge unsupported events
      return NextResponse.json(
        { received: true, ignored: true, reason: `Ignored event: ${event}` },
        { status: 200 }
      );
    }

    // 5.4 Extract Normalized Event Data
    const customerEmail = data.customer?.email?.trim().toLowerCase();
    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Event payload missing customer email' },
        { status: 400 }
      );
    }

    const customerName =
      [data.customer.first_name, data.customer.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Valued Customer';

    // Paystack amounts are received in subunits (e.g., 50000 kobo/cents = 500.00 ZAR/NGN)
    const normalizedAmount = Number((data.amount / 100).toFixed(2));
    const currency = (data.currency || tenant.currency || 'ZAR').toUpperCase();
    const invoiceCode = data.invoice_code || null;
    const subscriptionCode = data.subscription_code || null;
    const customerCode = data.customer.customer_code || null;
    const reference = data.reference || null;

    // 5.5 Check for Existing Failed Invoice Record (Idempotency & Retry Counter)
    let query = supabaseAdmin
      .from('failed_invoices')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (invoiceCode) {
      query = query.eq('paystack_invoice_code', invoiceCode);
    } else if (reference) {
      query = query.eq('paystack_transaction_reference', reference);
    } else {
      query = query
        .eq('customer_email', customerEmail)
        .in('status', ['pending', 'retrying']);
    }

    const { data: existingInvoices, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to query existing invoice: ${fetchError.message}`);
    }

    let invoiceRecord = existingInvoices?.[0] || null;
    let recoveryToken: string;

    if (invoiceRecord) {
      // Record exists: update attempt count, last attempt timestamp, and reset status to 'retrying'
      recoveryToken = invoiceRecord.recovery_token;

      const { data: updatedRecord, error: updateError } = await supabaseAdmin
        .from('failed_invoices')
        .update({
          attempt_count: invoiceRecord.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
          status: 'retrying',
          paystack_transaction_reference: reference ?? invoiceRecord.paystack_transaction_reference,
          metadata: {
            ...((invoiceRecord.metadata as Record<string, unknown>) || {}),
            last_failure_gateway_response: data.gateway_response || 'Declined',
          },
        })
        .eq('id', invoiceRecord.id)
        .select()
        .single();

      if (updateError || !updatedRecord) {
        throw new Error(`Failed to update invoice: ${updateError?.message}`);
      }
      invoiceRecord = updatedRecord;
    } else {
      // New failed invoice: generate a secure 64-character token and insert
      recoveryToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: insertedRecord, error: insertError } = await supabaseAdmin
        .from('failed_invoices')
        .insert({
          tenant_id: tenant.id,
          customer_email: customerEmail,
          customer_name: customerName,
          amount: normalizedAmount,
          currency: currency,
          paystack_customer_code: customerCode,
          paystack_subscription_code: subscriptionCode,
          paystack_invoice_code: invoiceCode,
          paystack_transaction_reference: reference,
          attempt_count: 1,
          status: 'pending',
          recovery_token: recoveryToken,
          token_expires_at: tokenExpiresAt,
          metadata: {
            initial_gateway_response: data.gateway_response || 'Declined',
          },
        })
        .select()
        .single();

      if (insertError || !insertedRecord) {
        throw new Error(`Failed to insert invoice: ${insertError?.message}`);
      }
      invoiceRecord = insertedRecord;
    }

    // 5.6 Trigger Resend API Email Sequence
    const resendApiKey = tenant.resend_api_key || process.env.RESEND_API_KEY;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';
    const recoveryUrl = `${appBaseUrl}/recover/${recoveryToken}`;

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(normalizedAmount);

    let emailDispatchSuccess = false;
    let emailErrorMessage: string | null = null;
    let resendMessageId: string | null = null;

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const emailFrom = `${tenant.business_name} Billing <billing@${new URL(appBaseUrl).hostname}>`;

      try {
        const emailResponse = await resend.emails.send({
          from: emailFrom,
          to: [customerEmail],
          subject: `Action Required: Payment failed for ${tenant.business_name}`,
          html: generateRecoveryEmailHtml({
            businessName: tenant.business_name,
            customerName,
            formattedAmount,
            recoveryUrl,
            supportEmail: tenant.support_email,
          }),
        });

        if (emailResponse.error) {
          emailErrorMessage = emailResponse.error.message;
        } else {
          emailDispatchSuccess = true;
          resendMessageId = emailResponse.data?.id || null;
        }
      } catch (err: unknown) {
        emailErrorMessage = err instanceof Error ? err.message : 'Unknown email dispatch error';
      }
    } else {
      emailErrorMessage = 'No Resend API Key configured for tenant or system';
    }

    // 5.7 Audit Log: recovery_logs
    await supabaseAdmin.from('recovery_logs').insert({
      tenant_id: tenant.id,
      failed_invoice_id: invoiceRecord.id,
      event_type: 'email_sent',
      status: emailDispatchSuccess ? 'success' : 'failed',
      message: emailDispatchSuccess
        ? `Recovery email sent successfully (ID: ${resendMessageId})`
        : `Email delivery failed: ${emailErrorMessage}`,
      payload: {
        paystack_event: event,
        attempt_count: invoiceRecord.attempt_count,
        resend_message_id: resendMessageId,
        error: emailErrorMessage,
        recovery_url: recoveryUrl,
      },
    });

    return NextResponse.json(
      {
        received: true,
        invoice_id: invoiceRecord.id,
        attempt_count: invoiceRecord.attempt_count,
        email_sent: emailDispatchSuccess,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}