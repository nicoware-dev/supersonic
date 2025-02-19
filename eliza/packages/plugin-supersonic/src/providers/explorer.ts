import {
    IAgentRuntime,
    Memory,
    Provider,
    State,
    elizaLogger,
} from "@elizaos/core";

const SONIC_EXPLORER_API = "https://api.sonicscan.org/api";

// Cache configuration
const CACHE_DURATION = 30 * 1000; // 30 seconds for blockchain data
const RATE_LIMIT_DURATION = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 30;

// Interfaces for API responses
interface AccountInfo {
    address: string;
    balance: string;
    token_transfers_count: number;
    transactions_count: number;
    implementation_name?: string;
    implementation_address?: string;
    token?: {
        name: string;
        symbol: string;
        total_supply: string;
        decimals: number;
    };
}

interface BlockInfo {
    height: number;
    hash: string;
    timestamp: string;
    transactions_count: number;
    miner: {
        hash: string;
    };
    size: number;
    gas_used: string;
    gas_limit: string;
}

interface NetworkStats {
    total_blocks: number;
    total_addresses: number;
    total_transactions: number;
    average_block_time: number;
    market_cap: string;
    total_supply: string;
    circulating_supply: string;
}

interface TokenInfo {
    address: string;
    name: string;
    symbol: string;
    total_supply: string;
    decimals: number;
    holders_count: number;
    transfers_count: number;
    type: string;
}

// Cache state
interface CacheData {
    [key: string]: {
        data: any;
        timestamp: number;
    };
}

let cache: CacheData = {};
let requestTimestamps: number[] = [];

function isRateLimited(): boolean {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(time => now - time < RATE_LIMIT_DURATION);
    return requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE;
}

function getCachedData(key: string): any {
    const cached = cache[key];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

function setCachedData(key: string, data: any): void {
    cache[key] = {
        data,
        timestamp: Date.now(),
    };
}

async function fetchFromAPI(endpoint: string): Promise<any> {
    if (isRateLimited()) {
        throw new Error("Rate limit reached");
    }

    requestTimestamps.push(Date.now());
    const response = await fetch(`${SONIC_EXPLORER_API}${endpoint}`);
    
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function getAccountInfo(address: string): Promise<string> {
    const cacheKey = `account_${address}`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const data = await fetchFromAPI(`/addresses/${address}`);
        const accountInfo: AccountInfo = data.result;

        const formattedInfo = `# Account Information
- Address: \`${accountInfo.address}\`
- Balance: ${parseFloat(accountInfo.balance).toLocaleString()} S
- Transactions Count: ${accountInfo.transactions_count.toLocaleString()}
- Token Transfers: ${accountInfo.token_transfers_count.toLocaleString()}
${accountInfo.implementation_name ? `- Contract Type: ${accountInfo.implementation_name}` : ''}
${accountInfo.token ? `\n## Token Information
- Name: ${accountInfo.token.name}
- Symbol: ${accountInfo.token.symbol}
- Total Supply: ${parseFloat(accountInfo.token.total_supply).toLocaleString()}
- Decimals: ${accountInfo.token.decimals}` : ''}

View on Explorer: https://sonicscan.org/address/${accountInfo.address}`;

        setCachedData(cacheKey, formattedInfo);
        return formattedInfo;
    } catch (error) {
        throw new Error(`Failed to fetch account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getLatestBlocks(): Promise<string> {
    const cacheKey = 'latest_blocks';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const data = await fetchFromAPI('/blocks');
        const blocks: BlockInfo[] = data.result.slice(0, 5);

        const formattedBlocks = blocks.map(block => `## Block #${block.height}
- Hash: \`${block.hash}\`
- Timestamp: ${new Date(block.timestamp).toLocaleString()}
- Transactions: ${block.transactions_count}
- Miner: \`${block.miner.hash}\`
- Size: ${block.size.toLocaleString()} bytes
- Gas Used: ${parseFloat(block.gas_used).toLocaleString()}
- Gas Limit: ${parseFloat(block.gas_limit).toLocaleString()}

View on Explorer: https://sonicscan.org/block/${block.height}`).join('\n\n');

        const result = `# Latest Blocks\n\n${formattedBlocks}`;
        setCachedData(cacheKey, result);
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch latest blocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getNetworkStats(): Promise<string> {
    const cacheKey = 'network_stats';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const data = await fetchFromAPI('/stats');
        const stats: NetworkStats = data.result;

        const result = `# Sonic Network Statistics
- Total Blocks: ${stats.total_blocks.toLocaleString()}
- Total Addresses: ${stats.total_addresses.toLocaleString()}
- Total Transactions: ${stats.total_transactions.toLocaleString()}
- Average Block Time: ${stats.average_block_time.toFixed(2)} seconds
- Market Cap: $${parseFloat(stats.market_cap).toLocaleString()}
- Total Supply: ${parseFloat(stats.total_supply).toLocaleString()} S
- Circulating Supply: ${parseFloat(stats.circulating_supply).toLocaleString()} S

_Last Updated: ${new Date().toLocaleString()}_`;

        setCachedData(cacheKey, result);
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch network stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getTopTokens(): Promise<string> {
    const cacheKey = 'top_tokens';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        const data = await fetchFromAPI('/tokens');
        const tokens: TokenInfo[] = data.result.slice(0, 5);

        const formattedTokens = tokens.map(token => `## ${token.name} (${token.symbol})
- Address: \`${token.address}\`
- Total Supply: ${parseFloat(token.total_supply).toLocaleString()}
- Decimals: ${token.decimals}
- Holders: ${token.holders_count.toLocaleString()}
- Transfers: ${token.transfers_count.toLocaleString()}
- Type: ${token.type}

View on Explorer: https://sonicscan.org/token/${token.address}`).join('\n\n');

        const result = `# Top Tokens on Sonic\n\n${formattedTokens}`;
        setCachedData(cacheKey, result);
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch top tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export const explorerProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<string | null> => {
        elizaLogger.debug("explorerProvider::get");
        
        const messageText = message.content?.text?.toLowerCase() || '';

        try {
            // Check for address lookup
            const addressMatch = messageText.match(/(?:address|account|wallet)\s+(0x[a-fA-F0-9]{40})/i);
            if (addressMatch) {
                return await getAccountInfo(addressMatch[1]);
            }

            // Check for latest blocks
            if (messageText.includes('latest blocks') || messageText.includes('recent blocks')) {
                return await getLatestBlocks();
            }

            // Check for network stats
            if (messageText.includes('network stats') || messageText.includes('chain stats')) {
                return await getNetworkStats();
            }

            // Check for top tokens
            if (messageText.includes('top tokens') || messageText.includes('token list')) {
                return await getTopTokens();
            }

            return null;
        } catch (error) {
            elizaLogger.error("Explorer provider error:", error);
            
            if (error instanceof Error) {
                if (error.message.includes("Rate limit")) {
                    return "Rate limit reached. Please try again in a minute.";
                }
                return `Error: ${error.message}`;
            }
            
            return "An unexpected error occurred while fetching blockchain data.";
        }
    }
};
