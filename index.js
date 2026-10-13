// Discord Self-bot Backend - Express Server
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { connectDB, getDB } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===== تخزين الـ Self-bot clients في الذاكرة =====
const activeClients = new Map();

function getClientKey(token) {
  return token.slice(-10);
}

// ===== مسار تفعيل حالة Self-bot =====
app.post('/api/selfbot/status', async (req, res) => {
  const { token, state, details, statusType } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'التوكن مطلوب' });
  }

  const clientKey = getClientKey(token);

  try {
    let client = activeClients.get(clientKey);

    if (!client || !client.user) {
      client = new Client({ checkUpdate: false });

      await client.login(token);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('انتهت المهلة - التوكن غلط أو الحساب محظور')),
          60000
        );
        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        client.once('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
      });

      activeClients.set(clientKey, client);
      console.log('✅ Self-bot شغال للحساب: ' + client.user.username);
    }

    const typeMap = {
      STREAMING: 'STREAMING',
      PLAYING: 'PLAYING',
      LISTENING: 'LISTENING',
      WATCHING: 'WATCHING',
    };
    const type = typeMap[statusType] || 'STREAMING';

    const presence = new RichPresence(client)
      .setApplicationId('817229550684471297')
      .setType(type)
      .setName('Tools Hub')
      .setDetails(details || 'يبث مباشر')
      .setState(state || 'على Tools Hub')
      .setStartTimestamp(Date.now());

    if (type === 'STREAMING') {
      presence.setURL('https://www.twitch.tv/toolshub');
    }

    await client.user.setPresence({
      activities: [presence],
      status: 'online',
    });

    try {
      const db = getDB();
      await db.collection('selfbot_users').updateOne(
        { discordId: client.user.id },
        {
          $set: {
            discordId: client.user.id,
            username: client.user.username,
            lastState: state,
            lastDetails: details,
            lastType: type,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (dbErr) {
      console.warn('DB save failed:', dbErr.message);
    }

    res.json({
      success: true,
      message: 'تم تفعيل الحالة',
      user: {
        id: client.user.id,
        username: client.user.username,
      },
    });

  } catch (err) {
    console.error('Self-bot error:', err.message);
    activeClients.delete(clientKey);

    let errorMsg = err.message;
    if (errorMsg.includes('TOKEN_INVALID')) {
      errorMsg = 'التوكن غلط أو منتهي الصلاحية';
    }

    res.status(500).json({ error: errorMsg });
  }
});

// ===== مسار إيقاف الحالة =====
app.post('/api/selfbot/stop', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'التوكن مطلوب' });
  }

  const clientKey = getClientKey(token);
  const client = activeClients.get(clientKey);

  if (client) {
    await client.destroy();
    activeClients.delete(clientKey);
    res.json({ success: true, message: 'تم إيقاف الحالة' });
  } else {
    res.json({ success: true, message: 'ما كان فيه حالة شغالة' });
  }
});

// ===== قائمة الـ bots الشغالة =====
app.get('/api/selfbot/list', (req, res) => {
  const list = [];
  activeClients.forEach((client, key) => {
    if (client.user) {
      list.push({
        key,
        username: client.user.username,
        id: client.user.id,
      });
    }
  });
  res.json({ count: list.length, clients: list });
});

// ===== Health check =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ===== Start =====
async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('⚠️ MongoDB connection failed:', err.message);
  }

  app.listen(PORT, () => {
    console.log('🚀 Server running on port ' + PORT);
  });
}

start();
