import type { Action, Memory } from "@elizaos/core";
import {
    parseUnits,
    type Address,
    createPublicClient,
    http,
    formatUnits
} from "viem";
import { sonicChain } from "../../config/chains";
import { initWalletProvider } from "../../providers/wallet";
import {
    TOKENS,
    getTokenBySymbol,
    isERC20Token,
    type TokenConfig,
    type TokenSymbol
} from "../../config/tokens";

// Shadow Exchange Router address (Uniswap V2 compatible)
const ROUTER_ADDRESS = "0x1D368773735ee1E678950B7A97bcA2CafB330CDc" as const;

// Router ABI for the specific functions we need
const ROUTER_ABI = [{
    "inputs": [
        { "name": "amountIn", "type": "uint256" },
        { "name": "tokenIn", "type": "address" },
        { "name": "tokenOut", "type": "address" }
    ],
    "name": "getAmountOut",
    "outputs": [
        { "name": "amount", "type": "uint256" },
        { "name": "stable", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [
        { "name": "amountIn", "type": "uint256" },
        { "name": "routes", "type": "tuple[]", "components": [
            { "name": "from", "type": "address" },
            { "name": "to", "type": "address" },
            { "name": "stable", "type": "bool" }
        ] }
    ],
    "name": "getAmountsOut",
    "outputs": [{ "name": "amounts", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [
        { "name": "amountIn", "type": "uint256" },
        { "name": "amountOutMin", "type": "uint256" },
        { "name": "routes", "type": "tuple[]", "components": [
            { "name": "from", "type": "address" },
            { "name": "to", "type": "address" },
            { "name": "stable", "type": "bool" }
        ] },
        { "name": "to", "type": "address" },
        { "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [
        { "name": "amountOutMin", "type": "uint256" },
        { "name": "routes", "type": "tuple[]", "components": [
            { "name": "from", "type": "address" },
            { "name": "to", "type": "address" },
            { "name": "stable", "type": "bool" }
        ] },
        { "name": "to", "type": "address" },
        { "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactNativeForTokensSupportingFeeOnTransferTokens",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
}, {
    "inputs": [
        { "name": "amountIn", "type": "uint256" },
        { "name": "amountOutMin", "type": "uint256" },
        { "name": "routes", "type": "tuple[]", "components": [
            { "name": "from", "type": "address" },
            { "name": "to", "type": "address" },
            { "name": "stable", "type": "bool" }
        ] },
        { "name": "to", "type": "address" },
        { "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactTokensForNativeSupportingFeeOnTransferTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}] as const;

// ERC20 ABI for approvals
const ERC20_ABI = [{
    "inputs": [
        { "name": "spender", "type": "address" },
        { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
}] as const;

type SwapFunctionName =
    | 'swapExactTokensForTokensSupportingFeeOnTransferTokens'
    | 'swapExactNativeForTokensSupportingFeeOnTransferTokens'
    | 'swapExactTokensForNativeSupportingFeeOnTransferTokens';

interface Route {
    from: `0x${string}`;
    to: `0x${string}`;
    stable: boolean;
}

type RouterRoute = Readonly<Route>;

class SwapAction {
    private publicClient;

    constructor(private walletProvider: ReturnType<typeof initWalletProvider>) {
        this.publicClient = createPublicClient({
            chain: sonicChain,
            transport: http("https://rpc.soniclabs.com")
        });
    }

    private async getOptimalRoute(fromToken: Address, toToken: Address): Promise<RouterRoute[]> {
        try {
            // Try both stable and volatile routes
            const [_amount, stable] = await this.publicClient.readContract({
                address: ROUTER_ADDRESS,
                abi: ROUTER_ABI,
                functionName: 'getAmountOut',
                args: [parseUnits("1", 18), fromToken, toToken]
            }) as [bigint, boolean];

            return [{
                from: fromToken,
                to: toToken,
                stable
            }];
        } catch (error) {
            console.error("Error getting optimal route:", error);
            // Default to volatile route if optimal route check fails
            return [{
                from: fromToken,
                to: toToken,
                stable: false
            }];
        }
    }

    private async checkPathExists(routes: RouterRoute[]): Promise<boolean> {
        try {
            // Use a larger test amount (0.01) to avoid underflow issues
            const testAmount = parseUnits("0.01", 18);
            await this.publicClient.readContract({
                address: ROUTER_ADDRESS,
                abi: ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [testAmount, routes]
            });
            console.log(`Path exists: ${routes.map(r => {
                const fromSymbol = Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.from)?.[0] || r.from;
                const toSymbol = Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.to)?.[0] || r.to;
                return `${fromSymbol} -> ${toSymbol} (${r.stable ? 'stable' : 'volatile'})`;
            }).join(" -> ")}`);
            return true;
        } catch (error) {
            // Log detailed error information
            console.error("Path check failed with error:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
                if ('cause' in error && error.cause instanceof Error) {
                    console.error("Cause:", error.cause.message);
                }
            }

            // Format a user-friendly error message
            const pathDescription = routes.map(r => {
                const fromSymbol = Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.from)?.[0] || r.from;
                const toSymbol = Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.to)?.[0] || r.to;
                return `${fromSymbol} -> ${toSymbol} (${r.stable ? 'stable' : 'volatile'})`;
            }).join(" -> ");
            console.error(`No liquidity found for path: ${pathDescription}`);
            return false;
        }
    }

    private async approveIfNeeded(
        tokenAddress: Address,
        amount: bigint,
        spender: Address
    ): Promise<void> {
        if (!this.walletProvider) throw new Error("Wallet not initialized");

        const walletClient = this.walletProvider.getWalletClient();
        console.log("Approving token spend");

        const approvalHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, amount],
            chain: sonicChain,
            account: this.walletProvider.getAccount()
        });

        console.log("Waiting for approval:", approvalHash);
        await this.publicClient.waitForTransactionReceipt({
            hash: approvalHash,
            timeout: 30000
        });
    }

    private async getAmountOut(amountIn: bigint, routes: RouterRoute[]): Promise<bigint> {
        console.log("Getting quote for swap:");
        console.log("Amount In:", formatUnits(amountIn, 18));
        console.log("Routes:", routes.map(r => `${r.from} -> ${r.to} (${r.stable ? 'stable' : 'volatile'})`).join(" -> "));

        try {
            const amounts = await this.publicClient.readContract({
                address: ROUTER_ADDRESS,
                abi: ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [amountIn, routes]
            }) as bigint[];

            console.log("Quote received. Amounts:", amounts.map(a => formatUnits(a, 18)));
            return amounts[amounts.length - 1];
        } catch (error) {
            console.error("Error in getAmountsOut:");
            console.error("- Amount In:", formatUnits(amountIn, 18));
            console.error("- Routes:", routes);
            if (error instanceof Error) {
                console.error("- Error:", error.message);
                console.error("- Stack:", error.stack);
            }
            throw new Error("Failed to get quote. The pool might not exist or have enough liquidity.");
        }
    }

    async swap(
        fromToken: TokenConfig,
        toToken: TokenConfig,
        amount: string,
        slippage = 0.5 // 0.5% default slippage
    ): Promise<{ hash: string }> {
        if (!this.walletProvider) throw new Error("Wallet not initialized");

        console.log("Initiating swap:");
        console.log("From Token:", fromToken.symbol);
        console.log("To Token:", toToken.symbol);
        console.log("Amount:", amount);
        console.log(`Slippage: ${slippage}%`);

        const walletClient = this.walletProvider.getWalletClient();
        const fromAddress = this.walletProvider.getAddress() as `0x${string}`;

        // Parse amount with correct decimals
        const amountIn = parseUnits(amount, fromToken.decimals);
        console.log("Amount In (wei):", amountIn.toString());

        // Get WS token for routing
        const ws = TOKENS.WS;
        if (!isERC20Token(ws)) throw new Error("WS token not configured correctly");
        const wsAddress = ws.address;

        let routes: RouterRoute[];
        let functionName: SwapFunctionName;
        let value = 0n;

        // Try direct path first
        if (fromToken.type === 'native' && isERC20Token(toToken)) {
            // Try both stable and volatile paths for S -> USDC
            console.log("Trying both stable and volatile paths for native swap");

            // First try stable path
            routes = [{
                from: wsAddress,
                to: toToken.address,
                stable: true
            }];

            const hasStablePath = await this.checkPathExists(routes);
            if (!hasStablePath) {
                console.log("No stable path found, trying volatile path");
                // Try volatile path
                routes = [{
                    from: wsAddress,
                    to: toToken.address,
                    stable: false
                }];

                const hasVolatilePath = await this.checkPathExists(routes);
                if (!hasVolatilePath) {
                    // If neither path works, try routing through WETH
                    console.log("No direct paths found, trying route through WETH");
                    const weth = TOKENS.WETH;
                    if (!isERC20Token(weth)) throw new Error("WETH token not configured correctly");

                    routes = [
                        {
                            from: wsAddress,
                            to: weth.address,
                            stable: false
                        },
                        {
                            from: weth.address,
                            to: toToken.address,
                            stable: false
                        }
                    ];

                    const hasWethPath = await this.checkPathExists(routes);
                    if (!hasWethPath) {
                        throw new Error(`No viable path found for ${fromToken.symbol} to ${toToken.symbol}. Please try Beethoven X or Shadow V3 for this swap.`);
                    }
                }
            }

            functionName = 'swapExactNativeForTokensSupportingFeeOnTransferTokens';
            value = amountIn;
        } else if (isERC20Token(fromToken) && toToken.type === 'native') {
            // ERC20 -> WS -> S
            routes = [{
                from: fromToken.address,
                to: wsAddress,
                stable: false // WS to Native is always volatile
            }];
            functionName = 'swapExactTokensForNativeSupportingFeeOnTransferTokens';
        } else if (isERC20Token(fromToken) && isERC20Token(toToken)) {
            // Try direct path first
            const directRoutes = await this.getOptimalRoute(fromToken.address, toToken.address);
            const hasDirectPath = await this.checkPathExists(directRoutes);

            if (hasDirectPath) {
                routes = directRoutes;
            } else {
                // If no direct path, try routing through WS
                console.log("No direct path found, trying route through WS");
                const route1 = await this.getOptimalRoute(fromToken.address, wsAddress);
                const route2 = await this.getOptimalRoute(wsAddress, toToken.address);
                routes = [...route1, ...route2];
                const hasWSPath = await this.checkPathExists(routes);

                if (!hasWSPath) {
                    throw new Error(`No viable path found for ${fromToken.symbol} to ${toToken.symbol}. Please ensure there is sufficient liquidity in the pools.`);
                }
            }
            functionName = 'swapExactTokensForTokensSupportingFeeOnTransferTokens';
        } else {
            throw new Error("Unsupported token combination for swap");
        }

        // Verify the path exists and has liquidity
        const pathExists = await this.checkPathExists(routes);
        if (!pathExists) {
            throw new Error(`No liquidity found for path: ${routes.map(r =>
                `${Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.from)?.[0] || r.from} -> ${Object.entries(TOKENS).find(([_, t]) => isERC20Token(t) && t.address === r.to)?.[0] || r.to} (${r.stable ? 'stable' : 'volatile'})`
            ).join(" -> ")}`);
        }

        console.log("Using routes:", routes.map(r => `${r.from} -> ${r.to} (${r.stable ? 'stable' : 'volatile'})`).join(" -> "));
        console.log("Function:", functionName);
        console.log("Value:", value.toString());

        try {
            // Get expected output amount
            const expectedOut = await this.getAmountOut(amountIn, routes);
            const minOut = expectedOut * BigInt(Math.floor((100 - slippage) * 100)) / 10000n;

            console.log("Expected Out:", formatUnits(expectedOut, toToken.decimals));
            console.log("Min Out:", formatUnits(minOut, toToken.decimals));

            // Set deadline to 20 minutes from now
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

            // If input token is not native S, approve first
            if (isERC20Token(fromToken)) {
                await this.approveIfNeeded(fromToken.address, amountIn, ROUTER_ADDRESS);
            }

            // Execute swap
            const hash = await walletClient.writeContract({
                address: ROUTER_ADDRESS,
                abi: ROUTER_ABI,
                functionName,
                args: functionName === 'swapExactNativeForTokensSupportingFeeOnTransferTokens'
                    ? [minOut, routes, fromAddress, deadline]
                    : [amountIn, minOut, routes, fromAddress, deadline],
                chain: sonicChain,
                value,
                account: this.walletProvider.getAccount()
            });

            console.log("Swap transaction submitted:", hash);
            console.log("Waiting for confirmation...");

            await this.publicClient.waitForTransactionReceipt({
                hash,
                timeout: 60000
            });

            return { hash };
        } catch (error) {
            console.error("Swap failed:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
                console.error("Stack trace:", error.stack);
            }
            throw error;
        }
    }
}

export const swap: Action = {
    name: "SWAP_TOKENS",
    description: "Swap tokens on Shadow Exchange (Uniswap V2 compatible)",
    examples: [
        [
            {
                user: "user1",
                content: {
                    text: "Swap 0.1 S for USDC",
                    entities: {
                        fromAmount: "0.1",
                        fromToken: "S",
                        toToken: "USDC"
                    }
                }
            },
            {
                user: "assistant",
                content: {
                    text: "Initiating swap of 0.1 S for USDC...",
                }
            }
        ]
    ],
    handler: async (runtime, message: Memory, _state, _options, callback) => {
        try {
            // Initialize wallet provider
            const provider = initWalletProvider(runtime);
            if (!provider) {
                callback?.({
                    text: "EVM wallet not configured. Please set EVM_PRIVATE_KEY in your environment variables.",
                });
                return false;
            }

            // Parse message content
            const content = message.content?.text?.match(
                /Swap ([\d.]+) ([A-Za-z]+) for ([A-Za-z]+)/i
            );

            if (!content) {
                callback?.({
                    text: "Could not parse swap details. Please use format: Swap <amount> <fromToken> for <toToken>",
                });
                return false;
            }

            const [, amount, fromSymbol, toSymbol] = content;

            // Get token configs
            const fromToken = getTokenBySymbol(fromSymbol.toUpperCase() as TokenSymbol);
            const toToken = getTokenBySymbol(toSymbol.toUpperCase() as TokenSymbol);

            if (!fromToken || !toToken) {
                const supportedTokens = Object.keys(TOKENS).join(", ");
                callback?.({
                    text: `Invalid token symbol. Supported tokens: ${supportedTokens}`,
                });
                return false;
            }

            // Send initial confirmation
            callback?.({
                text: `Initiating swap of ${amount} ${fromToken.symbol} for ${toToken.symbol}...`,
            });

            // Create swap action instance
            const swapAction = new SwapAction(provider);

            // Execute swap
            const { hash } = await swapAction.swap(fromToken, toToken, amount);

            callback?.({
                text: `Swap completed!\nTransaction Hash: ${hash}\nView on Explorer: https://sonicscan.org/tx/${hash}`,
                content: { hash },
            });

            return true;
        } catch (error) {
            console.error("Swap failed:", error);
            callback?.({
                text: `Swap failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
            return false;
        }
    },
    validate: async () => true,
    similes: [
        "like exchanging one token for another on Sonic",
        "like trading tokens through Shadow Exchange",
        "like swapping digital assets on Sonic"
    ],
};

