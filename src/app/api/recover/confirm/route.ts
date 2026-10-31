import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

export async function POST(req: NextRequest) {
  try {
    const { token, reference } = await req.json();

    if (!token || !reference) {
      return NextResponse.json(
        { error: 'Missing token or payment reference' },
        { status: 400 }
      );
    }

    // 1. Fetch the failed invoice matching the secure token
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('failed_invoices')
      .select('*, tenants!inner(paystack_secret_key, business_name)')
      .eq('recovery_token', token)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invalid or non-existent recovery token' },
        { status: 404 }
      );
    }

    if (invoice.status === 'recovered') {
      return NextResponse.json(
        { success: true, message: 'Invoice already recovered' },
        { status: 200 }
      );
    }

    // 2. Verify payment directly with Paystack API
    const paystackSecretKey =
      (invoice.tenants as { paystack_secret_key?: string } | null)?.paystack_secret_key || process.env.PAYSTACK_SECRET_KEY;

    if (paystackSecretKey) {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || verifyData.data?.status !== 'success') {
        return NextResponse.json(
          { error: 'Payment verification failed at Paystack gateway' },
          { status: 402 }
        );
      }
    }

    // 3. Update invoice status to 'recovered'
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('failed_invoices')
      .update({
        status: 'recovered',
        recovered_at: nowIso,
        paystack_transaction_reference: reference,
      })
      .eq('id', invoice.id);

    if (updateError) {
      throw new Error(`Failed to update invoice: ${updateError.message}`);
    }

    // 4. Log audit record
    await supabaseAdmin.from('recovery_logs').insert({
      tenant_id: invoice.tenant_id,
      failed_invoice_id: invoice.id,
      event_type: 'payment_recovered',
      status: 'success',
      message: `Invoice recovered via customer recovery page (Ref: ${reference})`,
      payload: { reference, token, timestamp: nowIso },
    });

    return NextResponse.json({ success: true, recovered_at: nowIso });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}