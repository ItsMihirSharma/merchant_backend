import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

export async function sendPaymentReceivedEmail(
    to: string,
    orderId: string,
    amount: string,
    txHash: string
) {
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to,
        subject: `Payment Received - Order ${orderId}`,
        html: `
      <h2>Payment Received!</h2>
      <p>We've received your payment for order <strong>${orderId}</strong>.</p>
      <p><strong>Amount:</strong> ${amount}</p>
      <p><strong>Transaction Hash:</strong> <code>${txHash}</code></p>
      <p>Your order will be processed once the transaction is confirmed on the blockchain.</p>
      <p>Thank you for your purchase!</p>
    `
    };

    await transporter.sendMail(mailOptions);
}

export async function sendPaymentConfirmedEmail(
    to: string,
    orderId: string,
    amount: string,
    txHash: string
) {
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to,
        subject: `Payment Confirmed - Order ${orderId}`,
        html: `
      <h2>Payment Confirmed!</h2>
      <p>Your payment for order <strong>${orderId}</strong> has been confirmed on the blockchain.</p>
      <p><strong>Amount:</strong> ${amount}</p>
      <p><strong>Transaction Hash:</strong> <code>${txHash}</code></p>
      <p>We're now processing your order and will send you a shipping confirmation soon.</p>
      <p>Thank you for your purchase!</p>
    `
    };

    await transporter.sendMail(mailOptions);
}

export async function sendOrderFulfilledEmail(
    to: string,
    orderId: string,
    trackingNumber?: string
) {
    const mailOptions = {
        from: process.env.FROM_EMAIL,
        to,
        subject: `Order Shipped - ${orderId}`,
        html: `
      <h2>Your Order Has Been Shipped!</h2>
      <p>Order <strong>${orderId}</strong> has been fulfilled and shipped.</p>
      ${trackingNumber ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>` : ''}
      <p>Thank you for shopping with us!</p>
    `
    };

    await transporter.sendMail(mailOptions);
}
