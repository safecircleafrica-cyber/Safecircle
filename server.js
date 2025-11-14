// server.js - Deploy this on Railway, Render, Heroku, or Vercel
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.PRIVATE_KEY);

app.use(cors());
app.use(express.json());

// Create Stripe Checkout Session (works for both web and mobile)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, currency = 'usd', userId, planId, planName, successUrl, cancelUrl } = req.body;

    // Validate input
    if (!amount || !userId || !planId || !planName) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, userId, planId, planName' 
      });
    }

    // Create a Checkout Session with Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: planName,
              description: `30-day ${planName} subscription`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment (not subscription)
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment-cancel`,
      metadata: {
        userId,
        planId,
        subscriptionType: 'monthly',
      },
      // Don't save payment methods
      payment_intent_data: {
        setup_future_usage: null,
      },
    });

    res.json({
      id: session.id,
      url: session.url, // Hosted Stripe Checkout URL
    });
  } catch (error) {
    console.error('Checkout Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify checkout session status
app.get('/verify-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: session.payment_status,
      amount: session.amount_total / 100,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error('Verify Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple success/cancel pages for testing
app.get('/payment-success', (req, res) => {
  const { session_id } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
          max-width: 400px;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        h1 {
          color: #4CAF50;
          margin: 0 0 10px 0;
        }
        p {
          color: #666;
          margin: 10px 0;
        }
        .session-id {
          background: #f5f5f5;
          padding: 10px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 12px;
          word-break: break-all;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Your premium subscription is now active.</p>
        <p>You can close this window.</p>
        ${session_id ? `<div class="session-id">Session: ${session_id}</div>` : ''}
      </div>
      <script>
        // Auto-close after 3 seconds (works in mobile WebView)
        setTimeout(() => {
          window.location.href = 'app://payment-success?session_id=${session_id}';
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

app.get('/payment-cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
          max-width: 400px;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        h1 {
          color: #f5576c;
          margin: 0 0 10px 0;
        }
        p {
          color: #666;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p>No charges were made.</p>
        <p>You can close this window.</p>
      </div>
      <script>
        setTimeout(() => {
          window.location.href = 'app://payment-cancel';
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Stripe backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
