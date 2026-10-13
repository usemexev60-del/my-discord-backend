// Discord Activity OAuth Backend - Express Server
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { connectDB, getDB } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// CORS - allow frontend Activity to access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== Core route: exchange code for access_token =====
app.post('/api/token', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const tokenData = await response.json();

    if (!response.ok) {
      console.error('Token exchange failed:', tokenData);
      return res.status(response.status).json(tokenData);
    }

    // Save user token to MongoDB
    if (tokenData.access_token) {
      try {
        const db = getDB();
        await db.collection('user_tokens').updateOne(
          { codeUsed: code },
          {
            $set: {
              codeUsed: code,
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresIn: tokenData.expires_in,
              scope: tokenData.scope,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
        console.log('✅ Token saved to MongoDB');
      } catch (dbErr) {
        console.error('DB save failed:', dbErr.message);
      }
    }

    res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

// ===== Health check =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ===== Start server =====
async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('⚠️ MongoDB connection failed:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

start();
