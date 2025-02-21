import type { Action, Memory } from "@elizaos/core";
import {
    parseUnits,
    createPublicClient,
    http,
    type Address,
    encodeFunctionData,
    parseEther,
    formatEther,
    type Account,
} from "viem";
import { sonicChain, arbitrumChain } from "../../config/chains";
import { initWalletProvider } from "../../providers/wallet";
import { TOKENS, getTokenBySymbol, isERC20Token, type TokenSymbol, type ERC20TokenConfig } from "../../config/tokens";

// deBridge contract addresses
const DEBRIDGE_CONTRACTS = {
    // Main bridge contracts
    SONIC: {
        DeBridgeGate: "0x43de2d77bf8027e25dbd179b491e8d64f38398aa" as const,
        DeBridgeToken: "0xc1656b63d9eeba6d114f6be19565177893e5bcbf" as const,
        CallProxy: "0x8a0c79f5532f3b2a16ad1e4282a5daf81928a824" as const,
    },
    ARBITRUM: {
        DeBridgeGate: "0x43dE2d77BF8027e25dBD179B491e8d64f38398aA" as const,
        DeBridgeToken: "0xf8A2902c0a5f817F5e22C82f453538d3f0734C2b" as const,
        CallProxy: "0x8a0C79F5532f3b2a16AD1E4282A5DAF81928a824" as const,
    }
} as const;

// Chain IDs for deBridge
const CHAIN_IDS = {
    SONIC: 1234, // Replace with actual Sonic chain ID
    ARBITRUM: 42161,
} as const;

// DeBridgeGate ABI (minimal required functions)
const DEBRIDGE_GATE_ABI = [{
    inputs: [
        { name: "tokenAddress", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "chainIdTo", type: "uint256" },
        { name: "receiver", type: "bytes" },
        { name: "permit", type: "bytes" },
        { name: "useAssetFee", type: "bool" },
        { name: "referralCode", type: "uint32" },
        { name: "autoParams", type: "bytes" }
    ],
    name: "send",
    outputs: [{ name: "debridgeId", type: "bytes32" }],
    stateMutability: "payable",
    type: "function"
}, {
    inputs: [
        { name: "tokenAddress", type: "address" },
        { name: "chainIdTo", type: "uint256" }
    ],
    name: "getDebridgeId",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function"
}, {
    inputs: [
        { name: "debridgeId", type: "bytes32" },
        { name: "amount", type: "uint256" },
        { name: "chainIdTo", type: "uint256" }
    ],
    name: "getSubmissionFee",
    outputs: [
        { name: "nativeFee", type: "uint256" },
        { name: "executionFee", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
}] as const;

// ERC20 ABI for approvals and balance checks
const ERC20_ABI = [{
    inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
}, {
    inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
}, {
    inputs: [
        { name: "account", type: "address" }
    ],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
}] as const;

// Supported destination chains
const SUPPORTED_CHAINS = ["arbitrum"] as const;
type SupportedChain = typeof SUPPORTED_CHAINS[number];

export const bridge: Action = {
    name: "BRIDGE_TOKENS",
    description: "Bridge tokens from Sonic to other chains using deBridge",
    examples: [
        [
            {
                user: "user1",
                content: {
                    text: "Bridge 0.1 S to Arbitrum",
                    entities: {
                        amount: "0.1",
                        token: "S",
                        toChain: "arbitrum"
                    }
                }
            },
            {
                user: "assistant",
                content: {
                    text: "Initiating bridge transaction of 0.1 S to Arbitrum...",
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
                    text: "Wallet not configured. Please set EVM_PRIVATE_KEY in your environment variables.",
                });
                return false;
            }

            // Parse message content
            const content = message.content?.text?.match(
                /Bridge ([\d.]+) ([A-Za-z]+) to ([A-Za-z]+)/i
            );

            if (!content) {
                callback?.({
                    text: "Could not parse bridge request. Please use format: Bridge <amount> <token> to <chain>",
                });
                return false;
            }

            const [, amount, tokenSymbol, toChain] = content;
            const token = getTokenBySymbol(tokenSymbol.toUpperCase() as TokenSymbol);
            const destinationChain = toChain.toLowerCase() as SupportedChain;

            // Validate token and chain
            if (!token) {
                callback?.({
                    text: "Invalid token symbol. Please check supported tokens.",
                });
                return false;
            }

            if (!SUPPORTED_CHAINS.includes(destinationChain)) {
                callback?.({
                    text: `Unsupported destination chain. Supported chains: ${SUPPORTED_CHAINS.join(", ")}`,
                });
                return false;
            }

            // Send initial confirmation
            callback?.({
                text: `Initiating bridge transaction of ${amount} ${token.symbol} to ${destinationChain}...`,
            });

            // Initialize clients with chain configuration
            const walletClient = provider.getWalletClient();
            const publicClient = createPublicClient({
                chain: sonicChain,
                transport: http()
            });

            // Parse amount with correct decimals
            const amountInWei = parseUnits(amount, token.decimals);

            // Get the receiver address (same as sender address on destination chain)
            const receiver = provider.getAddress();

            // Calculate bridge fees
            const debridgeId = await publicClient.readContract({
                address: DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address,
                abi: DEBRIDGE_GATE_ABI,
                functionName: 'getDebridgeId',
                args: [
                    token.type === 'native' ? TOKENS.WS.address : (token as ERC20TokenConfig).address,
                    BigInt(CHAIN_IDS.ARBITRUM)
                ]
            });

            const [nativeFee, executionFee] = await publicClient.readContract({
                address: DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address,
                abi: DEBRIDGE_GATE_ABI,
                functionName: 'getSubmissionFee',
                args: [debridgeId, amountInWei, BigInt(CHAIN_IDS.ARBITRUM)]
            });

            const totalFee = nativeFee + executionFee;

            // Handle native token (S)
            if (token.type === 'native') {
                // Check if user has enough balance including fees
                const balance = await publicClient.getBalance({
                    address: receiver as Address
                });

                if (balance < amountInWei + totalFee) {
                    callback?.({
                        text: `Insufficient balance. You need ${amount} ${token.symbol} plus ${formatEther(totalFee)} S for fees.`,
                    });
                    return false;
                }

                // Execute bridge transaction
                const hash = await walletClient.writeContract({
                    address: DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address,
                    abi: DEBRIDGE_GATE_ABI,
                    functionName: 'send',
                    args: [
                        TOKENS.WS.address,
                        amountInWei,
                        BigInt(CHAIN_IDS.ARBITRUM),
                        `0x${receiver.slice(2)}`,
                        "0x" as `0x${string}`,
                        false,
                        0,
                        "0x" as `0x${string}`,
                    ],
                    account: walletClient.account as Account,
                    value: amountInWei + totalFee,
                });

                callback?.({
                    text: `Successfully initiated bridge transaction!\nAmount: ${amount} ${token.symbol}\nTo: ${destinationChain}\nTransaction Hash: ${hash}\nView on Explorer: https://sonicscan.org/tx/${hash}`,
                    content: { hash },
                });

                return true;
            }

            // Handle ERC20 tokens
            if (isERC20Token(token)) {
                // Check token balance
                const balance = await publicClient.readContract({
                    address: token.address,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [receiver as Address]
                });

                if (balance < amountInWei) {
                    callback?.({
                        text: `Insufficient ${token.symbol} balance. You need at least ${amount} ${token.symbol}.`,
                    });
                    return false;
                }

                // Check native balance for fees
                const nativeBalance = await publicClient.getBalance({
                    address: receiver as Address
                });

                if (nativeBalance < totalFee) {
                    callback?.({
                        text: `Insufficient S balance for fees. You need ${formatEther(totalFee)} S for transaction fees.`,
                    });
                    return false;
                }

                // Check and handle token approval
                const allowance = await publicClient.readContract({
                    address: token.address,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [receiver as Address, DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address]
                });

                if (allowance < amountInWei) {
                    console.log(`Approving ${token.symbol} for bridge...`);
                    const approveHash = await walletClient.writeContract({
                        address: token.address,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address, amountInWei],
                        account: walletClient.account as Account
                    });

                    await publicClient.waitForTransactionReceipt({
                        hash: approveHash,
                        timeout: 60000
                    });
                }

                // Execute bridge transaction
                const hash = await walletClient.writeContract({
                    address: DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate as Address,
                    abi: DEBRIDGE_GATE_ABI,
                    functionName: 'send',
                    args: [
                        token.address,
                        amountInWei,
                        BigInt(CHAIN_IDS.ARBITRUM),
                        `0x${receiver.slice(2)}`,
                        "0x" as `0x${string}`,
                        false,
                        0,
                        "0x" as `0x${string}`,
                    ],
                    account: walletClient.account as Account,
                    value: totalFee,
                });

                callback?.({
                    text: `Successfully initiated bridge transaction!\nAmount: ${amount} ${token.symbol}\nTo: ${destinationChain}\nTransaction Hash: ${hash}\nView on Explorer: https://sonicscan.org/tx/${hash}`,
                    content: { hash },
                });

                return true;
            }

            callback?.({
                text: "Unsupported token type.",
            });
            return false;
        } catch (error) {
            console.error("Bridge failed:", error);
            callback?.({
                text: `Bridge operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
            return false;
        }
    },
    validate: async () => true,
    similes: [
        "like sending tokens across different blockchains",
        "like moving assets between Sonic and other networks",
        "like using a blockchain bridge to transfer tokens"
    ],
};
