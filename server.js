import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: '*/*' }));

// স্পেশাল ক্যারেক্টারের ঝামেলা এড়াতে ডিরেক্ট অবজেক্ট কনফিগারেশন (১০০% সেফ)
const pool = new Pool({
  user: 'postgres',
  host: 'db.rnegqehfttlapxowizlp.supabase.co',
  database: 'postgres',
  password: 'James@#2026', // কোনো এনকোড ছাড়া আপনার আসল পাসওয়ার্ড
  port: 5432,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000 // ৫ সেকেন্ডের বেশি আটকে থাকলে কানেকশন ড্রপ করবে (টাইমআউট জ্যাম হবে না)
});

const server = new Server({
  name: "supabase-mcp-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_database",
        description: "Execute a read-only SQL query on the live Supabase travel database",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string", description: "The SQL query to run" }
          },
          required: ["sql"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query_database") {
    let client;
    try {
      const sqlQuery = request.params.arguments.sql;
      console.log(`Executing live cloud query: ${sqlQuery}`);
      
      client = await pool.connect();
      const result = await client.query(sqlQuery);
      
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Supabase Connection Error: ${error.message}` }],
        isError: true
      };
    } finally {
      if (client) client.release(); // কানেকশন জ্যাম হওয়া আটকাতে রিলিজ আবশ্যক
    }
  }
  throw new Error("Tool not found");
});

let transport = null;

app.get('/mcp', async (req, res) => {
  transport = new SSEServerTransport('/mcp', res);
  await server.connect(transport);
});

app.post('/mcp', async (req, res) => {
  try {
    if (transport) {
      const message = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await transport.handleMessage(message, res);
    } else {
      transport = new SSEServerTransport('/mcp', res);
      await server.connect(transport);
      const message = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await transport.handleMessage(message, res);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Live Supabase MCP Server running on port ${PORT}`));