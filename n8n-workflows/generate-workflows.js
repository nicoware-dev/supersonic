import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Template for N8N workflow configuration
const workflowTemplate = (agentName, agentId) => ({
  name: `${agentName} Eliza Agent`,
  nodes: [
    {
      parameters: {
        method: "POST",
        url: "https://establish-thank-investigate-ut.trycloudflare.com/4f8d7cc0-cd02-09bf-b8cf-93bc61a51d96/message",
        sendBody: true,
        bodyParameters: {
          parameters: [
            {
              name: "text",
              value: "={{ $json.query }}"
            },
            {
              name: "userId",
              value: "n8n-user"
            },
            {
              name: "userName",
              value: "N8N Assistant"
            }
          ]
        },
        options: {}
      },
      id: "2c6df27d-b2c1-44a5-adce-34aa6d66f4a8",
      name: "Send to Eliza Agent",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position: [340, -140]
    },
    {
      parameters: {
        assignments: {
          assignments: [
            {
              id: "42335239-2425-4274-8223-20ae2ca6111e",
              name: "output",
              value: "={{ $json.text }}",
              type: "string"
            }
          ]
        },
        options: {}
      },
      id: "73668fc3-4078-4813-aae7-9a0f5185234e",
      name: "Success",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [620, -140]
    },
    {
      parameters: {
        inputSource: "passthrough"
      },
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [20, 20],
      id: "1cf404f4-f4da-42df-b5ce-c48aca3e44a5",
      name: "When Executed by Another Workflow"
    }
  ],
  pinData: {},
  connections: {
    "Send to Eliza Agent": {
      main: [
        [
          {
            node: "Success",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "When Executed by Another Workflow": {
      main: [
        [
          {
            node: "Send to Eliza Agent",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  },
  active: false,
  settings: {
    executionOrder: "v1"
  },
  versionId: "60c0589a-4861-42a7-a102-56b4297f3247",
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: "abf8971dfdbf55555155acdb4227d6ad43878667d46fbdff58c0161258f8c79b"
  },
  id: agentId,
  tags: []
});

// List of agents to generate workflows for
const agents = [
  { name: 'Advisor', id: 'advisor-agent' },
  { name: 'Alpha', id: 'alpha-agent' },
  { name: 'Analyst', id: 'analyst-agent' },
  { name: 'DAO', id: 'dao-agent' },
  { name: 'DeFi', id: 'defi-agent' },
  { name: 'KOL', id: 'kol-agent' },
  { name: 'Meme', id: 'meme-agent' },
  { name: 'Metrics', id: 'metrics-agent' },
  { name: 'NFT Deployer', id: 'nft-deployer-agent' },
  { name: 'NFTs', id: 'nfts-agent' },
  { name: 'Predictions', id: 'predictions-agent' },
  { name: 'Sales', id: 'sales-agent' },
  { name: 'Sonic Expert', id: 'sonic-expert-agent' },
  { name: 'Token Deployer', id: 'token-deployer-agent' },
  { name: 'Trading', id: 'trading-agent' },
  { name: 'Wallet', id: 'wallet-agent' }
];

// Generate workflow files
for (const agent of agents) {
  const workflow = workflowTemplate(agent.name, agent.id);
  const filePath = path.join(__dirname, `${agent.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  console.log(`Generated workflow for ${agent.name} at ${filePath}`);
}
