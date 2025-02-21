import type { Action, Memory } from "@elizaos/core";
import {
    createPublicClient,
    createWalletClient,
    http,
    type Address,
    type Account,
    type Log,
} from "viem";
import { arbitrum } from "viem/chains";
import { initWalletProvider } from "../../providers/wallet";
import { evm } from "@debridge-finance/desdk";
import { sonicChain } from "../../config/chains";
import { StaticJsonRpcProvider, FallbackProvider, JsonRpcProvider } from "@ethersproject/providers";

// Simple retry function
async function retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 2000
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            if (i < retries - 1) { // Don't wait on last attempt
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// deBridge contract addresses
const DEBRIDGE_CONTRACTS = {
    SONIC: {
        DeBridgeGate: "0x43de2d77bf8027e25dbd179b491e8d64f38398aa" as const,
    },
    ARBITRUM: {
        DeBridgeGate: "0x43dE2d77BF8027e25dBD179B491e8d64f38398aA" as const,
        ConfirmationContract: "0x949b3b3c098348b879c9e4f15cecc8046d9c8a8c" as const,
    }
} as const;

// Chain configurations with multiple RPC endpoints
const CHAIN_CONFIG = {
    SONIC: {
        chainId: 146,
        name: 'Sonic',
        rpcUrls: [
            'https://sonic.rpc.thirdweb.com',
            'https://sonic.drpc.org'
        ]
    },
    ARBITRUM: {
        chainId: 42161,
        name: 'Arbitrum One',
        rpcUrls: [
            'https://arb1.arbitrum.io/rpc',
            'https://arbitrum-one.publicnode.com'
        ]
    }
} as const;

// Create provider with retries and timeouts
const createProviderWithRetry = (chainConfig: typeof CHAIN_CONFIG.SONIC | typeof CHAIN_CONFIG.ARBITRUM) => {
    // Create providers for each RPC URL
    const providers = chainConfig.rpcUrls.map(url => 
        new StaticJsonRpcProvider({
            url,
            timeout: 10000, // 10 second timeout
            throttleLimit: 1
        }, {
            chainId: chainConfig.chainId,
            name: chainConfig.name,
            ensAddress: undefined
        })
    );

    // Create a FallbackProvider that will try each provider in sequence
    return new FallbackProvider(providers.map((provider, i) => ({
        provider,
        priority: i,
        stallTimeout: 2000,
        weight: 1
    })), 1); // Only need 1 provider to respond
};

export const claim: Action = {
    name: "CLAIM_BRIDGED_TOKENS",
    description: "Claim bridged tokens on Arbitrum from a previous bridge transaction",
    examples: [
        [
            {
                user: "user1",
                content: {
                    text: "Claim 0x711b9d0fa67c42ba8ef118e83b1bdd65bfda972dff5da71adbffacd8b1f9920a",
                    entities: {
                        txHash: "0x711b9d0fa67c42ba8ef118e83b1bdd65bfda972dff5da71adbffacd8b1f9920a"
                    }
                }
            },
            {
                user: "assistant",
                content: {
                    text: "Initiating claim transaction on Arbitrum...",
                }
            }
        ]
    ],
    handler: async (runtime, message: Memory, _state, _options, callback) => {
        try {
            // Initialize provider
            const provider = initWalletProvider(runtime);
            if (!provider) {
                callback?.({
                    text: "Wallet not configured. Please set EVM_PRIVATE_KEY in your environment variables.",
                });
                return false;
            }

            // Parse message content
            const content = message.content?.text?.match(
                /Claim (0x[a-fA-F0-9]{64})/i
            );

            if (!content) {
                callback?.({
                    text: "Could not parse claim request. Please use format: Claim <transaction_hash>",
                });
                return false;
            }

            const [, txHash] = content;

            // Send initial confirmation
            callback?.({
                text: `Checking submission status for transaction ${txHash}...`,
            });

            // Create providers with retry logic
            const sonicProvider = createProviderWithRetry(CHAIN_CONFIG.SONIC);
            const arbitrumProvider = createProviderWithRetry(CHAIN_CONFIG.ARBITRUM);

            // Create contexts for both chains
            const evmOriginContext: evm.Context = {
                provider: sonicProvider,
                deBridgeGateAddress: DEBRIDGE_CONTRACTS.SONIC.DeBridgeGate,
            };

            const evmDestinationContext: evm.Context = {
                provider: arbitrumProvider,
                deBridgeGateAddress: DEBRIDGE_CONTRACTS.ARBITRUM.DeBridgeGate,
            };

            // Find all submissions in the transaction with retry
            let submissions;
            try {
                submissions = await retryOperation(
                    async () => evm.Submission.findAll(txHash, evmOriginContext),
                    3,
                    5000 // Increased delay between retries
                );
            } catch (error) {
                console.error("Failed to find submissions:", error);
                callback?.({
                    text: "Failed to retrieve submission information. Please wait a few minutes for the transaction to be confirmed on Sonic and try again.",
                });
                return false;
            }
            
            if (!submissions || submissions.length === 0) {
                callback?.({
                    text: "No bridge submissions found in this transaction. Please verify the transaction hash and try again in a few minutes.",
                });
                return false;
            }

            // Take the first submission
            const [submission] = submissions;
            console.log("Submission found:", submission);

            callback?.({
                text: "Found bridge submission. Checking confirmation status...",
            });

            // Check if submission is confirmed with retry
            let isConfirmed;
            try {
                isConfirmed = await retryOperation(
                    async () => submission.hasRequiredBlockConfirmations(),
                    3,
                    5000
                );
                console.log("Is confirmed:", isConfirmed);
            } catch (error) {
                console.error("Failed to check confirmation:", error);
                callback?.({
                    text: "Failed to check confirmation status. Please wait a few more minutes for block confirmations and try again.",
                });
                return false;
            }
            
            if (!isConfirmed) {
                callback?.({
                    text: "Bridge transaction needs more confirmations. Please wait 10-15 minutes and try again.",
                });
                return false;
            }

            callback?.({
                text: "Transaction confirmed. Checking validator signatures...",
            });

            // Get claim data with retry
            let claim;
            try {
                claim = await retryOperation(
                    async () => submission.toEVMClaim(evmDestinationContext),
                    3,
                    5000
                );
                console.log("Claim data:", claim);
            } catch (error) {
                console.error("Failed to get claim data:", error);
                callback?.({
                    text: "Failed to retrieve claim data. Please wait a few more minutes for validator signatures and try again.",
                });
                return false;
            }

            // Check if signed by enough validators with retry
            let isSigned;
            try {
                isSigned = await retryOperation(
                    async () => claim.isSigned(),
                    3,
                    5000
                );
            } catch (error) {
                console.error("Failed to check signatures:", error);
                callback?.({
                    text: "Failed to check validator signatures. Please wait a few more minutes and try again.",
                });
                return false;
            }

            if (!isSigned) {
                callback?.({
                    text: "Waiting for validator signatures. This usually takes 10-15 minutes. Please try again in a few minutes.",
                });
                return false;
            }

            callback?.({
                text: "Validator signatures verified. Checking if claim was already executed...",
            });

            // Check if already executed with retry
            let isExecuted;
            try {
                isExecuted = await retryOperation(
                    async () => claim.isExecuted(),
                    3,
                    5000
                );
            } catch (error) {
                console.error("Failed to check execution status:", error);
                callback?.({
                    text: "Failed to check if claim was already executed. Please try again in a few minutes.",
                });
                return false;
            }

            if (isExecuted) {
                callback?.({
                    text: "This claim has already been executed. The tokens should be in your wallet. If you don't see them, you may need to add the token contract to your wallet manually.",
                });
                return false;
            }

            callback?.({
                text: "Preparing claim transaction...",
            });

            // Get encoded claim args with retry
            let claimArgs;
            try {
                claimArgs = await retryOperation(
                    async () => claim.getEncodedArgs(),
                    3,
                    5000
                );
                console.log("Claim args:", claimArgs);
            } catch (error) {
                console.error("Failed to get claim arguments:", error);
                callback?.({
                    text: "Failed to prepare claim transaction. Please try again in a few minutes.",
                });
                return false;
            }

            // Create public client for checking confirmations
            const publicClient = createPublicClient({
                chain: arbitrum,
                transport: http()
            });

            // Create wallet client specifically for Arbitrum with a more reliable RPC
            const arbitrumWalletClient = createWalletClient({
                account: provider.getAccount(),
                chain: arbitrum,
                transport: http('https://arb1.arbitrum.io/rpc')
            });

            const claimAbi = [{
                inputs: [
                    { name: "debridgeId", type: "bytes32" },
                    { name: "amount", type: "uint256" },
                    { name: "chainIdFrom", type: "uint256" },
                    { name: "receiver", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "signatures", type: "bytes" },
                    { name: "autoParams", type: "bytes" }
                ],
                name: "claim",
                outputs: [],
                stateMutability: "nonpayable",
                type: "function"
            }] as const;

            // Prepare transaction data for gas estimation
            const txRequest = {
                account: provider.getAccount() as Account,
                address: DEBRIDGE_CONTRACTS.ARBITRUM.DeBridgeGate,
                abi: claimAbi,
                functionName: 'claim' as const,
                args: [
                    submission.debridgeId as `0x${string}`,
                    BigInt(submission.amount),
                    BigInt(submission.originChainId),
                    submission.receiver as `0x${string}`,
                    BigInt(submission.nonce),
                    claimArgs[5] as `0x${string}`,
                    "0x" as `0x${string}`,
                ] as const,
            };

            // Get current fee data with safe minimums
            const feeData = await publicClient.estimateFeesPerGas();
            
            // Ensure we have reasonable gas prices for Arbitrum
            const baseFee = feeData?.maxFeePerGas || 25000000n; // 0.025 gwei default
            const maxFeePerGas = baseFee * 2n; // Double the base fee to ensure acceptance
            const maxPriorityFeePerGas = baseFee / 2n; // Half of base fee for priority

            // Use a fixed gas limit that we know works for claim transactions
            const gasLimit = 1000000n; // 1M gas limit which should be sufficient

            console.log("Using gas prices:", {
                baseFee: baseFee.toString(),
                maxFeePerGas: maxFeePerGas.toString(),
                maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
                gasLimit: gasLimit.toString()
            });

            // Execute claim transaction with fixed gas limit
            const hash = await arbitrumWalletClient.writeContract({
                ...txRequest,
                gas: gasLimit,
                maxFeePerGas,
                maxPriorityFeePerGas,
                type: 'eip1559' as const,
            });

            callback?.({
                text: `Successfully initiated claim transaction on Arbitrum!
Transaction Hash: ${hash}
View on Arbiscan: https://arbiscan.io/tx/${hash}

Bridged Amount: ${submission.amount}
Receiver: ${submission.receiver}

Note: The token will be automatically added to your wallet during the claim transaction.`,
                content: { hash },
            });

            return true;
        } catch (error) {
            console.error("Claim failed:", error);
            
            // Check for specific error signatures
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            if (errorMessage.includes("0x76b77bf2")) {
                callback?.({
                    text: "This claim has already been executed on Arbitrum. The tokens should already be in your wallet.",
                });
                return false;
            }

            callback?.({
                text: `Claim operation failed: ${errorMessage}. Please wait a few minutes and try again.`,
            });
            return false;
        }
    },
    validate: async () => true,
    similes: [
        "like claiming your bridged tokens on Arbitrum",
        "like completing the second step of a bridge transaction",
        "like receiving your tokens on the destination chain"
    ],
};