export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RecoveryStatus = 'pending' | 'retrying' | 'recovered' | 'failed' | 'cancelled';

export type RecoveryEventType =
  | 'email_sent'
  | 'email_opened'
  | 'recovery_page_viewed'
  | 'card_update_attempted'
  | 'payment_recovered'
  | 'recovery_abandoned';

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          support_email: string;
          currency: string;
          paystack_public_key: string | null;
          paystack_secret_key: string | null;
          resend_api_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          support_email: string;
          currency?: string;
          paystack_public_key?: string | null;
          paystack_secret_key?: string | null;
          resend_api_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          business_name?: string;
          support_email?: string;
          currency?: string;
          paystack_public_key?: string | null;
          paystack_secret_key?: string | null;
          resend_api_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      failed_invoices: {
        Row: {
          id: string;
          tenant_id: string;
          customer_email: string;
          customer_name: string | null;
          amount: number;
          currency: string;
          paystack_customer_code: string | null;
          paystack_subscription_code: string | null;
          paystack_invoice_code: string | null;
          paystack_transaction_reference: string | null;
          attempt_count: number;
          status: RecoveryStatus;
          recovery_token: string;
          token_expires_at: string;
          recovered_at: string | null;
          last_attempt_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          customer_email: string;
          customer_name?: string | null;
          amount: number;
          currency?: string;
          paystack_customer_code?: string | null;
          paystack_subscription_code?: string | null;
          paystack_invoice_code?: string | null;
          paystack_transaction_reference?: string | null;
          attempt_count?: number;
          status?: RecoveryStatus;
          recovery_token?: string;
          token_expires_at?: string;
          recovered_at?: string | null;
          last_attempt_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          customer_email?: string;
          customer_name?: string | null;
          amount?: number;
          currency?: string;
          paystack_customer_code?: string | null;
          paystack_subscription_code?: string | null;
          paystack_invoice_code?: string | null;
          paystack_transaction_reference?: string | null;
          attempt_count?: number;
          status?: RecoveryStatus;
          recovery_token?: string;
          token_expires_at?: string;
          recovered_at?: string | null;
          last_attempt_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'failed_invoices_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
      recovery_logs: {
        Row: {
          id: string;
          tenant_id: string;
          failed_invoice_id: string;
          event_type: RecoveryEventType;
          status: string;
          message: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          failed_invoice_id: string;
          event_type: RecoveryEventType;
          status?: string;
          message?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          failed_invoice_id?: string;
          event_type?: RecoveryEventType;
          status?: string;
          message?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recovery_logs_failed_invoice_id_fkey';
            columns: ['failed_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'failed_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recovery_logs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_recovery_invoice: {
        Args: {
          token_input: string;
        };
        Returns: {
          invoice_id: string;
          business_name: string;
          support_email: string;
          customer_email: string;
          customer_name: string | null;
          amount: number;
          currency: string;
          status: RecoveryStatus;
          is_expired: boolean;
          paystack_public_key: string | null;
        }[];
      };
    };
    Enums: {
      recovery_status: RecoveryStatus;
      recovery_event_type: RecoveryEventType;
    };
  };
}
