# N8N Workflows for Eliza Agents

This directory contains N8N workflow configurations for all Eliza agents coordination using an n8n based coordinator agent. Each workflow is designed to be imported into N8N and connected to the Coordinator Agent.

## Available Workflows

- `coordinator-agent.json` - Main coordinator workflow
- `advisor-agent.json` - Financial advisor agent workflow
- `alpha-agent.json` - Alpha insights agent workflow
- `analyst-agent.json` - Market analysis agent workflow
- `dao-agent.json` - DAO operations agent workflow
- `defi-agent.json` - DeFi operations agent workflow
- `kol-agent.json` - Key opinion leader agent workflow
- `meme-agent.json` - Meme creation agent workflow
- `metrics-agent.json` - Metrics tracking agent workflow
- `nft-deployer-agent.json` - NFT deployment agent workflow
- `nfts-agent.json` - NFT operations agent workflow
- `predictions-agent.json` - Market predictions agent workflow
- `sales-agent.json` - Sales operations agent workflow
- `sonic-expert-agent.json` - Sonic blockchain expert agent workflow
- `token-deployer-agent.json` - Token deployment agent workflow
- `trading-agent.json` - Trading operations agent workflow
- `wallet-agent.json` - Wallet management agent workflow

## Usage

1. Import the desired workflow JSON file into your N8N instance
2. Configure the required credentials (OpenAI API key, etc.)
3. Update the HTTP Request node with your Eliza agent's API endpoint
4. Add the workflow as a tool in the coordinator workflow

## Configuration

Each workflow follows the same basic structure as the Starknet Expert Agent workflow:

- HTTP Endpoint for receiving requests
- Message processing logic
- Response formatting
- Error handling

The only configuration needed is updating the API endpoint URL in the HTTP Request node to point to your specific agent's API endpoint. 
