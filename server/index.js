import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import sequelize from './config/database.js';
import './models/index.js';
import seedStyles from './seeders/styleSeeder.js';
import { startScheduler } from './services/scheduler.js';
import { loadSettings } from './services/settingsService.js';
import { seedAdminPassword } from './services/authService.js';
import postRoutes from './routes/posts.js';
import styleRoutes from './routes/styles.js';
import aiRoutes from './routes/ai.js';
import facebookRoutes from './routes/facebook.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import fbPagesRoutes from './routes/fbPages.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fb-pages', fbPagesRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/styles', styleRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/facebook', facebookRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Production: serve frontend build
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — mọi route không match API sẽ trả về index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log('Serving frontend from /dist');
}

// Initialize
async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: true });
    console.log('Database synced');

    // Load settings from DB into cache
    await loadSettings();

    // Seed defaults
    await seedStyles();
    await seedAdminPassword();

    startScheduler();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
