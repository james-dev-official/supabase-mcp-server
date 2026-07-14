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

// Render ক্লাউডের IPv4 সাপোর্টের জন্য Supabase IPv4 Pooler কনফিগারেশন
const pool = new Pool({
  user: 'postgres',
  host: 'aws-0-ap-northeast-1.pooler.supabase.com', // IPv4 সমর্থিত পুলার হোস্ট
  database: 'postgres',
  password: 'James@#2026', 
  port: 6543, // Supabase পুলারের জন্য পোর্ট অবশ্যই ৬৫৪৩ হবে
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000 
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
      if (client) client.release(); 
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