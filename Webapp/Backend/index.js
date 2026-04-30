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

app.use(cors());
app.use(express.json());

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
    brokers: [kafkaBroker] // Replaced with env variable
});

const producer = kafka.producer();

// kafka producer cli
app.post('/api/cli/produce_data', async (req, res) => {
    try {
        // 1. Change req.query to req.body to catch the JSON you provided
        const data = req.body;

        console.log("Received data:", data["CONFIG"]["isAuth"]);

        let isAuth = data["CONFIG"]["isAuth"] || "false";
        if (isAuth === "false") {
            res.status(400).json({
                status: 'error',
                message: 'Authentication Error',
                details: data["CONFIG"]["isAuth"]
            })
        } else {
            // 2. Connect and Send to Kafka
            await producer.connect();
            await producer.send({
                topic: 'rihno_logs',
                messages: [
                    { value: JSON.stringify(data) },
                ],
            });

            res.status(200).json({
                status: "Success",
                message: "Data sent to Kafka",
                sentData: data
            });
        }


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
        })

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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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

// Test send
app.post('/api/notify/test', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ status: 'error', message: 'email required' });
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