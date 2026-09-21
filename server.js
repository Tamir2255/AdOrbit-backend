const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Render injects its own port — never hardcode 5000/10000 in app.listen.
const PORT = process.env.PORT || 10000;

// Vercel gives each deployment a dynamic *.vercel.app domain, so the
// origin allowlist matches the whole domain rather than one fixed URL.
app.use(cors({
    origin: [
        /vercel\.app$/,
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static('/tmp/uploads'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/earner', require('./routes/earnerProfile'));

app.get('/health', (req, res) => res.json({ status: 'ok', platform: 'AdOrbit / OrbitEarn' }));

// Centralized error boundary — anything an async route forgets to catch lands here.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
    console.log(`AdOrbit backend listening on port ${PORT}`);
});
