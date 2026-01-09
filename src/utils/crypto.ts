import crypto from 'crypto';

export function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
    );
}

export function generateWebhookSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    return hmac.update(payload).digest('hex');
}
