const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
// পাথ দুটি ইউনিভার্সাল ও সেফ করা হলো
const { Server } = require('@modelcontextprotocol/sdk/server/index');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types');

const app = express();
app.use(cors());

app.use(express.json());
app.use(express.text({ type: '*/*' }));

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
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
    try {
      const sqlQuery = request.params.arguments.sql;
      const result = await pool.query(sqlQuery);
      return { content: [{ type: "text", text: JSON.stringify(result.rows) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Supabase Error: ${error.message}` }], isError: true };
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