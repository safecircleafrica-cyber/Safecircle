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

// Payment Success Page - Updated to work with WebView
app.get('/payment-success', (req, res) => {
  const { session_id, userId } = req.query;
  console.log('✅ Payment success page accessed');
  console.log('- Session ID:', session_id);
  console.log('- User ID:', userId);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
          animation: slideUp 0.5s ease-out;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .checkmark {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: block;
          stroke-width: 3;
          stroke: #4CAF50;
          stroke-miterlimit: 10;
          margin: 0 auto 20px;
          animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
        }
        .checkmark-circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          stroke-width: 3;
          stroke-miterlimit: 10;
          stroke: #4CAF50;
          fill: none;
          animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .checkmark-check {
          transform-origin: 50% 50%;
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
        }
        @keyframes stroke {
          100% { stroke-dashoffset: 0; }
        }
        @keyframes scale {
          0%, 100% { transform: none; }
          50% { transform: scale3d(1.1, 1.1, 1); }
        }
        h1 {
          color: #333;
          margin: 0 0 10px;
          font-size: 28px;
        }
        p {
          color: #666;
          font-size: 16px;
          margin: 0 0 20px;
        }
        .loading {
          color: #999;
          font-size: 14px;
          margin-top: 20px;
        }
        .session-info {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 8px;
          margin-top: 20px;
          font-size: 12px;
          color: #666;
          font-family: monospace;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
          <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
          <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
        </svg>
        <h1>Payment Successful!</h1>
        <p>Your premium subscription has been activated.</p>
        <p class="loading">Processing your subscription...</p>
        ${session_id ? `<div class="session-info">Session: ${session_id}</div>` : ''}
      </div>
      <script>
        console.log('Payment success page loaded');
        console.log('Session ID: ${session_id}');
        
        // Wait 2 seconds to show the success animation
        setTimeout(() => {
          console.log('Redirecting to about:blank to trigger app handling');
          // Redirect to about:blank which the WebView will detect
          window.location.href = 'about:blank';
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// Payment Cancel Page - Updated to work with WebView
app.get('/payment-cancel', (req, res) => {
  const { userId } = req.query;
  console.log('❌ Payment cancel page accessed');
  console.log('- User ID:', userId);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Cancelled</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
          animation: slideUp 0.5s ease-out;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          border-radius: 50%;
          background: #ff9800;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          color: white;
          animation: scale 0.5s ease-out;
        }
        @keyframes scale {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }
        h1 {
          color: #333;
          margin: 0 0 10px;
          font-size: 28px;
        }
        p {
          color: #666;
          font-size: 16px;
          margin: 0 0 20px;
        }
        .loading {
          color: #999;
          font-size: 14px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">⚠️</div>
        <h1>Payment Cancelled</h1>
        <p>No charges were made to your account.</p>
        <p class="loading">Returning to app...</p>
      </div>
      <script>
        console.log('Payment cancel page loaded');
        
        // Wait 2 seconds to show the message
        setTimeout(() => {
          console.log('Redirecting to about:blank to trigger app handling');
          // Redirect to about:blank which the WebView will detect
          window.location.href = 'about:blank';
        }, 2000);
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
