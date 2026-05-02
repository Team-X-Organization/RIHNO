import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import * as crypto from "node:crypto";
import { Kafka } from 'kafkajs';

// 1. CRITICAL: Initialize dotenv at the VERY TOP
dotenv.config();

const app = express();

// 2. Assign variables AFTER dotenv.config()
const PORT = process.env.PORT || 5050;

// ------------- CLI CONST
const AWS_API_CLI_AUTH_URL = process.env.AWS_API_CLI_AUTH_URL;

// ------------- FRONT END CONST
const AWS_API_URL = process.env.AWS_DEVICE_API_URL;

// ------------- AI THREAT + NOTIFICATION CONST
// Defaults assume rihno-network (container-to-container DNS via service name).
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://my_rihno_ai_engine:4050';
const NOTIFY_ENGINE_URL = process.env.NOTIFY_ENGINE_URL || 'http://my_rihno_notify:5060';

// CORS — allow specific origins via FRONTEND_URL (comma-separated). In dev,
// fall back to permissive so the Vite dev server still works.
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow same-origin / curl / server-to-server (no Origin header)
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true); // dev fallback
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Root route
app.get('/', (req, res) => {
    res.send('RIHNO Backend is running! Go to /api/list_all_devices for data.');
});

// Health check route
app.get('/api/backend_check', (req, res) => {
    res.json({
        status: 'success',
        message: 'Hello World !',
        app: 'RIHNO Backend OK',
        port: PORT
    });
});

// ---------------------------------------------------------------------------------- CLI PART
app.get('/api/cli_auth', async (req, res) => {
    try {
        const { email, device_name, device_type, api_key } = req.query;
        if (!AWS_API_CLI_AUTH_URL) {
            return res.status(500).json({ error: "Backend configuration missing: AWS URL" });
        }

        if (!email || !device_name || !device_type || !api_key) {
            return res.status(400).json({ status: 'error', message: 'Email and device is required' });
        }

        const response = await axios.get(AWS_API_CLI_AUTH_URL, {
            params: { email: email, device_name: device_name, device_type: device_type, api_key: api_key },
        });

        res.status(200).json(response.data);

    } catch (error) {
        // Log detailed error for you, send clean error to frontend
        console.error("Axios Error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            message: 'Failed to fetch from AWS',
            details: error.message
        });
    }
})

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const kafka = new Kafka({
    clientId: 'my-app',
    brokers: [kafkaBroker]
});

// Single shared producer — connect once, reuse for every request.
// kafkajs is idempotent on connect() but new connections per request leak sockets.
const producer = kafka.producer();
let producerReady = false;
let producerConnecting = null;

async function ensureProducerConnected() {
    if (producerReady) return;
    if (!producerConnecting) {
        producerConnecting = producer.connect()
            .then(() => { producerReady = true; })
            .catch(err => { producerConnecting = null; throw err; });
    }
    return producerConnecting;
}

// Disconnect producer cleanly on shutdown so the broker frees its session
async function shutdown(signal) {
    console.log(`Received ${signal}, closing producer...`);
    try { if (producerReady) await producer.disconnect(); } catch (e) { console.error('producer disconnect failed:', e.message); }
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// kafka producer cli
app.post('/api/cli/produce_data', async (req, res) => {
    try {
        const data = req.body;
        if (!data || typeof data !== 'object') {
            return res.status(400).json({ status: 'error', message: 'JSON body required' });
        }
        const isAuth = data?.CONFIG?.isAuth ?? "false";
        if (String(isAuth) === "false") {
            return res.status(400).json({
                status: 'error',
                message: 'Authentication Error',
                details: isAuth,
            });
        }

        await ensureProducerConnected();
        await producer.send({
            topic: 'rihno_logs',
            messages: [{ value: JSON.stringify(data) }],
        });

        res.status(200).json({
            status: "Success",
            message: "Data sent to Kafka",
            sentData: data,
        });
    } catch (error) {
        console.error("Kafka Producer Error:", error.message);
        res.status(500).json({
            message: 'Failed to produce to Kafka',
            details: error.message
        });
    }
});



// ---------------------------------------------------------------------------------- FRONTEND PART
// Device List route
app.get('/api/list_all_devices', async (req, res) => {
    try {
        const { email } = req.query;

        // Double-check URL existence to prevent axios crash
        if (!AWS_API_URL) {
            return res.status(500).json({ error: "Backend configuration missing: AWS URL" });
        }

        if (!email) {
            return res.status(400).json({ status: 'error', message: 'Email required' });
        }

        const response = await axios.get(AWS_API_URL, {
            params: { email: email }
        });

        res.status(200).json(response.data);

    } catch (error) {
        // Log detailed error for you, send clean error to frontend
        console.error("Axios Error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            message: 'Failed to fetch from AWS',
            details: error.message
        });
    }
});

// Delete device route
app.delete('/api/delete', async (req, res) => {
    try {
        const { email, device } = req.query;

        // Double-check URL existence to prevent axios crash
        if (!AWS_API_URL) {
            return res.status(500).json({ error: "Backend configuration missing: AWS URL" });
        }

        if (!email) {
            return res.status(400).json({ status: 'error', message: 'Email required' });
        }

        const response = await axios.delete(AWS_API_URL, {
            params: { email: email, device: device },
        });

        const awsData = response.data;

        // Best-effort: clean Redis streams, ML models, alerts, and AI engine pipeline.
        // Non-fatal — if AI engine is down, AWS delete still succeeds.
        if (device) {
            axios.delete(
                `${AI_ENGINE_URL}/agents/${encodeURIComponent(email)}/${encodeURIComponent(device)}`,
                { timeout: 5000 }
            ).catch(aiErr => {
                console.warn('AI engine cleanup failed (non-fatal):', aiErr.message);
            });
        }

        res.status(200).json(awsData);

    } catch (error) {
        // Log detailed error for you, send clean error to frontend
        console.error("Axios Error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            message: 'Failed to fetch from AWS',
            details: error.message
        });
    }
})

// Add new device
app.post('/api/create', async (req, res) => {
    function generateAPIKey(email, deviceName) {
        const timestamp = Date.now().toString();
        const secret = process.env.API_SECRET || 'fallback-secret-key';
        const seed = `${email}-${deviceName}-${timestamp}`;
        return crypto
            .createHmac('sha256', secret)
            .update(seed)
            .digest('hex');
    }

    try {
        const { email, deviceName, deviceLocation, deviceStatus, dateCreated, deviceType } = req.query;

        // 1. Basic Validation
        if (!email || !deviceName || !deviceLocation || !deviceStatus || !dateCreated || !deviceType) {
            return res.status(400).json({ status: 'error', message: 'All Information Required' });
        }

        if (!AWS_API_URL) {
            return res.status(500).json({ error: "Backend configuration missing: AWS URL" });
        }

        const deviceAPI = generateAPIKey(email, deviceName);

        // 2. Forward request to AWS
        const response = await axios.post(AWS_API_URL, {
            UserEmail: email,
            DeviceName: deviceName,
            Status: deviceStatus,
            Location: deviceLocation,
            DateCreated: dateCreated,
            DeviceAPI: deviceAPI,
            DeviceType: deviceType
        });

        // 3. Handle "Already Taken" logic based on AWS response content
        // Adjust "Device already exists" to match exactly what your AWS Lambda/API returns
        if (response.data && (response.data.message === "Device already exists" || response.data.error === "Conflict")) {
            return res.status(409).json({
                status: 'error',
                message: 'NAME_TAKEN',
                details: 'This device name is already registered to your account.'
            });
        }

        res.status(200).json({
            status: 'success',
            generatedKey: deviceAPI,
            awsResponse: response.data
        });

    } catch (error) {
        // 4. Handle errors from Axios (e.g., AWS returns a 400 or 409 status code)
        const awsError = error.response?.data?.message || "";

        if (error.response?.status === 409 || awsError.includes("already exists")) {
            return res.status(409).json({
                status: 'error',
                message: 'NAME_TAKEN',
                details: 'This device name is already in use.'
            });
        }

        console.error("Axios Error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            message: 'Failed to fetch from AWS',
            details: error.response?.data || error.message
        });
    }
});

// Edit existing device
app.patch('/api/update', async (req, res) => {
    try {
        // Extracting data from req.body based on your Postman screenshot
        const { UserEmail, DeviceName, Status, Location } = req.body;

        // 1. Basic Validation
        if (!UserEmail || !DeviceName) {
            return res.status(400).json({
                status: 'error',
                message: 'UserEmail and DeviceName are required to identify the device.'
            });
        }

        // 2. Check for AWS URL configuration
        if (!AWS_API_URL) {
            return res.status(500).json({ error: "Backend configuration missing: AWS URL" });
        }

        // 3. Forward the update to AWS
        // Note: We send the payload as the body in axios.patch
        const response = await axios.patch(AWS_API_URL, {
            UserEmail,
            DeviceName,
            Status,
            Location
        });

        // 4. Return success response
        res.status(200).json({
            status: 'success',
            message: 'Device updated successfully',
            awsResponse: response.data
        });

    } catch (error) {
        // Log detailed error for the developer
        console.error("Axios Error:", error.response?.data || error.message);

        // Send a clean error to the client
        res.status(error.response?.status || 500).json({
            message: 'Failed to update device on AWS',
            details: error.response?.data || error.message
        });
    }
});

// Get IP Threats route
app.get('/api/ip_threats', async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({ status: 'error', message: 'Email is required' });
        }

        // Default to the Flask app's local address, but allow override via .env
        const THREAT_API_URL = process.env.THREAT_API_URL || 'http://my_rihno_ip_threat:8888/api/scans';

        // 1. Fetch the global state from your Python Flask service
        const response = await axios.get(THREAT_API_URL);

        // 2. Safely extract the data array
        const allScans = response.data.data || [];

        // 3. Filter the results for the requested email
        const userScans = allScans.filter(scan => scan.email === email);

        // 4. Calculate the total threats specifically for this user
        const userThreatCount = userScans.reduce((sum, scan) => sum + scan.threat_count, 0);

        // 5. Return the filtered data
        res.status(200).json({
            status: 'success',
            user_email: email,
            total_user_threats: userThreatCount,
            data: userScans
        });

    } catch (error) {
        console.error("Threat API Fetch Error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            status: 'error',
            message: 'Failed to fetch threat data from the analysis service',
            details: error.message
        });
    }
});

// ---------------------------------------------------------------------------------- AI THREAT ENGINE PROXY

// Helper: forward axios errors with consistent shape
function forwardAxiosError(error, res, fallbackMessage) {
    const status = error.response?.status || 500;
    const details = error.response?.data || error.message;
    console.error(`${fallbackMessage}:`, details);
    return res.status(status).json({
        status: 'error',
        message: fallbackMessage,
        details,
    });
}

// RFC-5322-lite email regex. Reject anything before forwarding so an attacker
// cannot smuggle path/URL fragments into proxied paths.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function badEmail(email, res) {
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
        res.status(400).json({ status: 'error', message: 'invalid email' });
        return true;
    }
    return false;
}

// Global AI engine status (all agents + global stats)
app.get('/api/ai/status', async (req, res) => {
    try {
        const response = await axios.get(`${AI_ENGINE_URL}/status`, { timeout: 8000 });
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to reach AI engine');
    }
});

// Per-agent status
app.get('/api/ai/agents/:agentName/status', async (req, res) => {
    const { email } = req.query;
    const { agentName } = req.params;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(
            `${AI_ENGINE_URL}/agents/${encodeURIComponent(email)}/${encodeURIComponent(agentName)}/status`,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch AI agent status');
    }
});

// Per-agent recent alerts
app.get('/api/ai/agents/:agentName/alerts', async (req, res) => {
    const { email, count = 50 } = req.query;
    const { agentName } = req.params;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(
            `${AI_ENGINE_URL}/agents/${encodeURIComponent(email)}/${encodeURIComponent(agentName)}/alerts`,
            { params: { count }, timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch AI agent alerts');
    }
});

// Global alerts feed
app.get('/api/ai/alerts', async (req, res) => {
    try {
        const response = await axios.get(`${AI_ENGINE_URL}/alerts`, {
            params: { count: req.query.count || 100 },
            timeout: 8000,
        });
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch AI alerts');
    }
});

// Per-user threat summary (last assessment + alerts + status, all agents)
app.get('/api/ai/threat_summary', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(`${AI_ENGINE_URL}/threat_summary`, {
            params: { email },
            timeout: 10000,
        });
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch AI threat summary');
    }
});

// Auto-detector status
app.get('/api/ai/auto_detector/status', async (req, res) => {
    try {
        const response = await axios.get(`${AI_ENGINE_URL}/auto_detector/status`, { timeout: 5000 });
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch auto-detector status');
    }
});

// Trigger detection from latest stream metric
app.post('/api/ai/detect/:agentName', async (req, res) => {
    const { email } = req.query;
    const { agentName } = req.params;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.post(
            `${AI_ENGINE_URL}/detect/${encodeURIComponent(email)}/${encodeURIComponent(agentName)}`,
            {},
            { timeout: 12000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to run AI detection');
    }
});

// ---------------------------------------------------------------------------------- NOTIFICATION ENGINE PROXY

// Threat status summary (per-user, derived from AI engine)
app.get('/api/notify/threats', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(
            `${NOTIFY_ENGINE_URL}/threats/${encodeURIComponent(email)}`,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch threat status');
    }
});

// List recipients
app.get('/api/notify/recipients', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(
            `${NOTIFY_ENGINE_URL}/recipients/${encodeURIComponent(email)}`,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch recipients');
    }
});

// Add recipient
app.post('/api/notify/recipients', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.post(
            `${NOTIFY_ENGINE_URL}/recipients/${encodeURIComponent(email)}`,
            req.body,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to add recipient');
    }
});

// Update recipient
app.patch('/api/notify/recipients/:recId', async (req, res) => {
    const { email } = req.query;
    const { recId } = req.params;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.patch(
            `${NOTIFY_ENGINE_URL}/recipients/${encodeURIComponent(email)}/${encodeURIComponent(recId)}`,
            req.body,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to update recipient');
    }
});

// Delete recipient
app.delete('/api/notify/recipients/:recId', async (req, res) => {
    const { email } = req.query;
    const { recId } = req.params;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.delete(
            `${NOTIFY_ENGINE_URL}/recipients/${encodeURIComponent(email)}/${encodeURIComponent(recId)}`,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to delete recipient');
    }
});

// Settings
app.get('/api/notify/settings', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.get(
            `${NOTIFY_ENGINE_URL}/settings/${encodeURIComponent(email)}`,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to fetch settings');
    }
});

app.put('/api/notify/settings', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.put(
            `${NOTIFY_ENGINE_URL}/settings/${encodeURIComponent(email)}`,
            req.body,
            { timeout: 8000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to update settings');
    }
});

// Real-time threat stream (SSE proxy to AI engine)
app.get('/api/ai/threat_stream', (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering in prod
    res.flushHeaders();

    axios.get(`${AI_ENGINE_URL}/threat_stream`, {
        params: { email },
        responseType: 'stream',
        timeout: 0, // never timeout SSE connections
    }).then(upstream => {
        upstream.data.pipe(res);
        req.on('close', () => upstream.data.destroy());
    }).catch(err => {
        console.warn('SSE upstream error:', err.message);
        res.end();
    });
});

// Test send
app.post('/api/notify/test', async (req, res) => {
    const { email } = req.query;
    if (badEmail(email, res)) return;
    try {
        const response = await axios.post(
            `${NOTIFY_ENGINE_URL}/test/${encodeURIComponent(email)}`,
            req.body,
            { timeout: 15000 }
        );
        res.status(200).json(response.data);
    } catch (error) {
        forwardAxiosError(error, res, 'Failed to send test notification');
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`RIHNO backend started on http://localhost:${PORT}`));