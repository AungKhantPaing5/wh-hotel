// Contract only. No live provider is enabled in this starter.
export interface PaymentProvider {
  createSession(input: {
    paymentId: string; amountMinor: string; currency: string; idempotencyKey: string;
  }): Promise<{ reference: string; checkoutUrl?: string; qrPayload?: string }>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, unknown>): Promise<{
    eventId: string; reference: string; amountMinor: string; currency: string;
    status: 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  }>;
  refund(reference: string, amountMinor: string, idempotencyKey: string): Promise<string>;
}
