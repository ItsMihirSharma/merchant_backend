export interface WebhookPayload {
    eventType: 'payment.pending' | 'payment.confirmed' | 'payment.failed';
    orderId: string;
    transactionHash: string;
    amount: string;
    token: string;
    chain: string;
    blockNumber: number;
    confirmations: number;
    merchantAddress: string;
    customerAddress: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface CreateOrderDTO {
    orderId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    shippingAddress: {
        street: string;
        city: string;
        state: string;
        zip: string;
    };
    items: Array<{
        id: string;
        name: string;
        price: number;
        quantity: number;
    }>;
    totalAmount: number;
}
