// server.js - Deploy this on Railway, Render, Heroku, or Vercel
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();

// Initialize Stripe - add validation
if (!process.env.PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY environment variable is not set!');
  process.exit(1);
}

const stripe = Stripe(process.env.PRIVATE_KEY);

// Enhanced CORS configuration
app.use(cors({
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Health check endpoint (very important!)
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Stripe Payment Server is running',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /create-checkout-session',
      'GET /verify-session/:sessionId',
      'GET /payment-success',
      'GET /payment-cancel',
      'GET /health'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    stripe: 'configured',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Create Stripe Checkout Session (works for both web and mobile)
app.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('🔵 Create checkout session request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { amount, currency = 'usd', userId, planId, planName, successUrl, cancelUrl } = req.body;

    // Validate input
    if (!amount || !userId || !planId || !planName) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['amount', 'userId', 'planId', 'planName'],
        received: { amount, userId, planId, planName }
      });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      console.log('❌ Invalid amount:', amount);
      return res.status(400).json({ 
        error: 'Invalid amount',
        received: amount
      });
    }

    console.log('✅ Validation passed');
    console.log('Creating Stripe session with:');
    console.log('- Amount:', numAmount);
    console.log('- Currency:', currency);
    console.log('- Plan:', planName);
    console.log('- User ID:', userId);

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
            unit_amount: Math.round(numAmount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment (not subscription)
      success_url: successUrl || `${process.env.FRONTEND_URL || req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || req.headers.origin}/payment-cancel`,
      metadata: {
        userId,
        planId,
        planName,
        subscriptionType: 'monthly',
      },
      // Don't include payment_intent_data at all for one-time payments
    });

    console.log('✅ Stripe session created successfully');
    console.log('Session ID:', session.id);
    console.log('Session URL:', session.url);

    res.json({
      id: session.id,
      url: session.url, // Hosted Stripe Checkout URL
      success: true
    });
  } catch (error) {
    console.error('❌ Checkout Session Error:', error);
    res.status(500).json({ 
      error: error.message,
      type: error.type || 'unknown',
      details: error.raw?.message || 'No additional details'
    });
  }
});

// Verify checkout session status
app.get('/verify-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log('🔍 Verifying session:', sessionId);

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log('✅ Session retrieved:', {
      status: session.payment_status,
      amount: session.amount_total / 100
    });

    res.json({
      status: session.payment_status,
      amount: session.amount_total / 100,
      metadata: session.metadata,
      success: true
    });
  } catch (error) {
    console.error('❌ Verify Session Error:', error);
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

// Simple success/cancel pages for testing
app.get('/payment-success', (req, res) => {
  const { session_id } = req.query;
  console.log('✅ Payment success page accessed, session:', session_id);
  
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
        .countdown {
          color: #999;
          font-size: 14px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Your premium subscription is now active.</p>
        <p class="countdown">Redirecting in <span id="timer">3</span> seconds...</p>
        ${session_id ? `<div class="session-id">Session: ${session_id}</div>` : ''}
      </div>
      <script>
        let count = 3;
        const timer = document.getElementById('timer');
        
        const countdown = setInterval(() => {
          count--;
          timer.textContent = count;
          if (count === 0) {
            clearInterval(countdown);
            // Try to redirect to app
            window.location.href = 'app://payment-success?session_id=${session_id}';
          }
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

app.get('/payment-cancel', (req, res) => {
  console.log('❌ Payment cancel page accessed');
  
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
        .countdown {
          color: #999;
          font-size: 14px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p>No charges were made.</p>
        <p class="countdown">Redirecting in <span id="timer">3</span> seconds...</p>
      </div>
      <script>
        let count = 3;
        const timer = document.getElementById('timer');
        
        const countdown = setInterval(() => {
          count--;
          timer.textContent = count;
          if (count === 0) {
            clearInterval(countdown);
            window.location.href = 'app://payment-cancel';
          }
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// Test endpoint to verify server is working
app.get('/test', (req, res) => {
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    stripe_configured: !!process.env.PRIVATE_KEY,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT
    }
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.path);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /test',
      'POST /create-checkout-session',
      'GET /verify-session/:sessionId',
      'GET /payment-success',
      'GET /payment-cancel'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ================================');
  console.log(`🚀 Stripe backend running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Test endpoint: http://localhost:${PORT}/test`);
  console.log('🚀 ================================');
  console.log('Environment:');
  console.log('- Stripe Key:', process.env.PRIVATE_KEY ? '✅ Configured' : '❌ Missing');
  console.log('- Frontend URL:', process.env.FRONTEND_URL || '❌ Not set (will use request origin)');
  console.log('- Node ENV:', process.env.NODE_ENV || 'development');
  console.log('🚀 ================================');
});

module.exports = app;
