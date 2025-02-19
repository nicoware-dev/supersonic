import type { Plugin } from "@elizaos/core";
import { coinGeckoProvider } from "./providers/coingecko";
import { defiLlamaProvider } from "./providers/defillama";
import { walletProvider } from "./providers/wallet";
import { transfer } from "./actions/transfer";
import { erc20Transfer } from "./actions/erc20Transfer";
import { portfolio } from "./actions/portfolio";
/* import { swap } from "./actions/beets-dex/swap";
 */import { swapv2 } from "./actions/beets-dex/swapv2";
import { deposit } from "./actions/silo-lending/deposit";
import { withdraw } from "./actions/silo-lending/withdraw";
import { borrow } from "./actions/silo-lending/borrow";
import { repay } from "./actions/silo-lending/repay";
import { stake } from "./actions/beets-lst/stake";
import { unstake } from "./actions/beets-lst/unstake";
import { withdraw as withdrawBeetsLst } from "./actions/beets-lst/withdraw";

export const supersonicPlugin: Plugin = {
    name: "supersonic",
    description: "Supersonic Plugin for Eliza - Sonic DeFi Agent Swarm",
    actions: [
        transfer,
        erc20Transfer,
        portfolio,
        swapv2,
        deposit,
        withdraw,
        borrow,
        repay,
        stake,
        unstake,
        withdrawBeetsLst
    ],
    evaluators: [],
    providers: [
        coinGeckoProvider,
        defiLlamaProvider,
        walletProvider
    ]
};

export default supersonicPlugin;

