const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const app = express();
app.use(cors());
app.use(express.text({ type: '*/*' }));

// Supabase Connection Setup
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false } // Supabase Cloud এর জন্য SSL আবশ্যক
});

console.log('Live Supabase MCP Server Initializing...');

const server = new Server({
  name: "supabase-mcp-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// Register Tool
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

// Execute Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query_database") {
    try {
      const sqlQuery = request.params.arguments.sql;
      console.log(`Executing query on Supabase: ${sqlQuery}`);
      const result = await pool.query(sqlQuery);
      return { content: [{ type: "text", text: JSON.stringify(result.rows) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }], isError: true };
    }
  }
  throw new Error("Tool not found");
});

let transport = null;

// HTTP SSE Endpoints
app.get('/mcp', async (req, res) => {
  transport = new SSEServerTransport('/mcp', res);
  await server.connect(transport);
});

app.post('/mcp', async (req, res) => {
  if (transport) {
    const message = JSON.parse(req.body);
    await transport.handleMessage(message, res);
  } else {
    res.sendStatus(400);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Live Supabase MCP Server running on port ${PORT}`));