import {
  cre,
  Runner,
  type Runtime,
  type CronPayload,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
  getNetwork,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
  TxStatus,
  bytesToHex,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  keccak256,
  toHex,
} from "viem";
import { GhostLiquidityAgent } from "./agent";
import {
  configSchema,
  type Config,
  type AggregatedFeed,
  type SchrodingerStrategy,
  type SwapPayload,
} from "./types";
import oaquaSenderAbi from "./contracts/OAquaSender.abi.json";

const fetchAggregatedFeed = (
  sendRequester: HTTPSendRequester,
  url: string
): AggregatedFeed => {
  const response = sendRequester
    .sendRequest({
      method: "GET",
      url: url,
      headers: {
        "Content-Type": "application/json",
      },
      timeoutMs: 10000,
    })
    .result();

  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to fetch aggregated feed: HTTP ${response.statusCode}`
    );
  }

  const bodyText = Buffer.from(response.body).toString("utf-8");
  return JSON.parse(bodyText) as AggregatedFeed;
};

const executeCrisisResponse = (runtime: Runtime<Config>): string => {
  runtime.log("[Ghost] System Activated");

  runtime.log("[Ghost] Step 1: Fetching market intelligence feed...");
  const httpClient = new cre.capabilities.HTTPClient();

  const feed = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        fetchAggregatedFeed(sendRequester, runtime.config.aggregatedFeedUrl),
      consensusIdenticalAggregation<AggregatedFeed>()
    )()
    .result();

  runtime.log(`[Ghost] Feed status: ${feed.status || "unknown"}`);
  runtime.log(`[Ghost] Incident: ${feed.incident_id}`);
  runtime.log(`[Ghost] Severity: ${feed.severity}`);

  // Check if we should take action
  if (feed.status === "idle") {
    runtime.log("[Ghost] Status: IDLE - No action needed. Market is stable.");
    return JSON.stringify({
      status: "idle",
      timestamp: feed.aggregation_timestamp,
      message: "No crisis detected, system standing by",
    });
  }

  runtime.log(
    "[Ghost] Status: CHANCE - Crisis detected! Activating AI agent..."
  );
  runtime.log(`Event: ${feed.executive_summary.event}`);
  runtime.log(`Impact: ${feed.executive_summary.impact}`);

  runtime.log("\nSocial Intelligence:");
  runtime.log(
    `- Aggregate Sentiment: ${feed.social_intelligence.aggregate_sentiment}`
  );
  runtime.log(`- Panic Level: ${feed.social_intelligence.panic_level * 100}%`);
  runtime.log(
    `- Alerts: ${feed.social_intelligence.twitter_alerts.length} tweets from verified accounts`
  );

  feed.social_intelligence.twitter_alerts.slice(0, 2).forEach((alert) => {
    runtime.log(`  - ${alert.account}: "${alert.message.substring(0, 80)}..."`);
  });

  runtime.log("\nOn-Chain Intelligence:");
  runtime.log(
    `- Total Drained: $${feed.onchain_intelligence.exploit_summary.total_drained_usd.toLocaleString()}`
  );
  runtime.log(
    `- Affected Pools: ${feed.onchain_intelligence.exploit_summary.affected_pools.join(
      ", "
    )}`
  );
  runtime.log(
    `- Attack Pattern: ${feed.onchain_intelligence.exploit_summary.attack_pattern}`
  );
  runtime.log(
    `- Confidence: ${
      feed.onchain_intelligence.exploit_summary.exploit_confidence * 100
    }%`
  );

  runtime.log("\nArbitrage Opportunities:");
  feed.market_intelligence.arbitrage_opportunities
    .slice(0, 3)
    .forEach((opp) => {
      const spreadInfo = opp.spread_percentage
        ? `${opp.spread_percentage}% spread`
        : `${opp.depeg_percentage}% depeg`;
      runtime.log(
        `- ${opp.asset}: ${spreadInfo} | Risk: ${opp.risk_level} | Action: ${opp.recommended_action}`
      );
    });

  runtime.log("\nMarket Conditions:");
  runtime.log(`- Volatility: ${feed.market_intelligence.volatility.level}`);
  runtime.log(
    `- Panic Selling: ${feed.market_intelligence.volatility.panic_selling}`
  );
  runtime.log(
    `- Liquidity Crisis: ${feed.market_intelligence.volatility.liquidity_crisis}`
  );
  runtime.log(
    `- Gas Price: ${feed.market_intelligence.gas_conditions.current_gwei} gwei`
  );

  runtime.log("\nStep 2: Querying AI Agent for crisis strategy...");

  const strategy = GhostLiquidityAgent.queryStrategy(feed);

  runtime.log(`\nAI Strategy: ${strategy.strategy_type}`);
  runtime.log(`Approach: ${strategy.ai_decision.approach}`);

  runtime.log("\nAI Reasoning:");
  strategy.ai_decision.reasoning.forEach((reason, idx) => {
    runtime.log(`${idx + 1}. ${reason}`);
  });

  runtime.log(`\nRisk Assessment: ${strategy.ai_decision.risk_assessment}`);

  runtime.log("\nGenerated SwapVM Strategies:");
  strategy.swapvm_strategies.forEach((strat, idx) => {
    runtime.log(
      `${idx + 1}. [Priority ${strat.priority}] ${strat.action} ${strat.asset}`
    );
    runtime.log(`   - Entry Price: $${strat.entry_price}`);
    runtime.log(`   - Curve Type: ${strat.curve_type}`);
    runtime.log(`   - Allocation: ${strat.allocation_percent}%`);
    runtime.log(`   - Bytecode: ${strat.bytecode.substring(0, 80)}...`);
  });

  runtime.log("\nExecution Plan:");
  runtime.log(`- Trigger: ${strategy.execution_plan.trigger}`);
  runtime.log(`- Cancel Others: ${strategy.execution_plan.cancel_others}`);
  runtime.log(
    `- Time Limit: ${strategy.execution_plan.time_limit_hours} hours`
  );
  runtime.log(`- Confidence: ${(strategy.confidence * 100).toFixed(1)}%`);

  runtime.log("\n[Ghost] Step 3: Deploying strategy via OAquaBridge...");

  // Get the first (highest priority) strategy
  const topStrategy = strategy.swapvm_strategies[0];
  if (!topStrategy.oaqua_params) {
    runtime.log("[Ghost] Error: Strategy missing oaqua_params");
    return JSON.stringify({ status: "error", message: "Missing oaqua_params" });
  }

  const { amount, tokenOut, strategyBuffer } = topStrategy.oaqua_params;

  // Prepare swap payload
  const payload = {
    maker: runtime.config.oappExecutorAddress,
    tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    tokenOut: tokenOut,
    recipient: runtime.config.recipientAddress,
    amountLD: amount,
    minAmountOutLD: "0",
    makerTraits: "0",
    program: topStrategy.bytecode,
    takerTraitsAndData: "0x",
    strategySalt: `0x${Math.floor(Date.now() / 1000)
      .toString(16)
      .padStart(64, "0")}`,
    strategyTokens: [tokenOut, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
    strategyBalances: [strategyBuffer, amount],
    metadata: "0x",
  };

  // LayerZero options (compose with 2M gas)
  const extraOptions = "0x0003010011000000000000000000000000001e8480";
  const minAmountLD = Math.floor(parseInt(amount) * 0.995).toString(); // 0.5% slippage

  runtime.log(`[Ghost] Preparing swap for OAquaBridge.onReport()...`);
  runtime.log(`  - Bridge: ${runtime.config.oaquaBridgeAddress}`);
  runtime.log(`  - Sender: ${runtime.config.oappSenderAddress}`);
  runtime.log(`  - Maker: ${payload.maker}`);
  runtime.log(`  - Amount: ${amount} (${parseInt(amount) / 1e6} USDC)`);
  runtime.log(`  - Program: ${topStrategy.bytecode.substring(0, 66)}...`);

  // Call OAquaSender (handles both real and dry-run execution)
  const txHash = callOAquaSender(runtime, payload, extraOptions, minAmountLD);

  runtime.log(
    `\nWorkflow finished successfully! incident: ${feed.incident_id}, strategy: ${strategy.strategy_type}, txHash: ${txHash}`
  );

  // Return clean, focused result like the tutorial example
  return JSON.stringify(
    {
      timestamp: feed.aggregation_timestamp,
      incident: feed.incident_id,
      strategy: strategy.strategy_type,
      action: `${topStrategy.action} ${topStrategy.asset}`,
      amount: amount,
      txHash: txHash,
    },
    null,
    2
  );
};

/**
 * Calls OAquaSender.sendSwap() to bridge USDC and ship strategy
 * This makes a direct contract call like oaquaApp's make send-swap
 */
function callOAquaSender(
  runtime: Runtime<Config>,
  payload: SwapPayload,
  extraOptions: string,
  minAmountLD: string
): string {
  // Detect if chain is testnet based on chain name
  const isTestnet =
    runtime.config.baseChain.includes("testnet") ||
    runtime.config.baseChain.includes("sepolia") ||
    runtime.config.baseChain.includes("goerli");

  runtime.log(
    `[Ghost] Initializing EVM client for ${runtime.config.baseChain}...`
  );

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.baseChain,
    isTestnet: isTestnet,
  });

  if (!network) {
    throw new Error(`Unknown chain: ${runtime.config.baseChain}`);
  }

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector
  );

  // Step 1: Quote LayerZero fee
  runtime.log("[Ghost] Querying LayerZero fee...");

  const quoteCallData = encodeFunctionData({
    abi: oaquaSenderAbi,
    functionName: "quoteSendSwap",
    args: [
      {
        maker: payload.maker,
        tokenIn: payload.tokenIn,
        tokenOut: payload.tokenOut,
        recipient: payload.recipient,
        amountLD: payload.amountLD,
        minAmountOutLD: payload.minAmountOutLD,
        makerTraits: payload.makerTraits,
        program: payload.program,
        takerTraitsAndData: payload.takerTraitsAndData,
        strategySalt: payload.strategySalt,
        strategyTokens: payload.strategyTokens,
        strategyBalances: payload.strategyBalances,
        metadata: payload.metadata,
      },
      extraOptions as `0x${string}`,
      BigInt(minAmountLD),
    ],
  });

  const quoteResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.oappSenderAddress as `0x${string}`,
        data: quoteCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();

  const feeData = toHex(quoteResult.data);
  runtime.log(`[Ghost] LayerZero fee quoted`);

  // Step 2: Encode swap payload for report
  runtime.log("[Ghost] Encoding swap payload for report...");

  // Encode the swap payload struct for the report
  // This matches OAquaBridge.onReport: (SwapPayload, bytes, uint256)
  const swapPayloadEncoded = encodeAbiParameters(
    parseAbiParameters(
      "(address maker, address tokenIn, address tokenOut, address recipient, uint256 amountLD, uint256 minAmountOutLD, uint256 makerTraits, bytes program, bytes takerTraitsAndData, bytes32 strategySalt, address[] strategyTokens, uint256[] strategyBalances, bytes metadata) payload, bytes extraOptions, uint256 minAmountLD"
    ),
    [
      {
        maker: payload.maker as `0x${string}`,
        tokenIn: payload.tokenIn as `0x${string}`,
        tokenOut: payload.tokenOut as `0x${string}`,
        recipient: payload.recipient as `0x${string}`,
        amountLD: BigInt(payload.amountLD),
        minAmountOutLD: BigInt(payload.minAmountOutLD),
        makerTraits: BigInt(payload.makerTraits),
        program: payload.program as `0x${string}`,
        takerTraitsAndData: payload.takerTraitsAndData as `0x${string}`,
        strategySalt: payload.strategySalt as `0x${string}`,
        strategyTokens: payload.strategyTokens as `0x${string}`[],
        strategyBalances: payload.strategyBalances.map((b) => BigInt(b)),
        metadata: payload.metadata as `0x${string}`,
      },
      extraOptions as `0x${string}`,
      BigInt(minAmountLD),
    ]
  );

  runtime.log("[Ghost] Generating signed report...");

  const reportResponse = runtime
    .report({
      encodedPayload: Buffer.from(swapPayloadEncoded.slice(2), "hex").toString(
        "base64"
      ),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  runtime.log("[Ghost] Writing report to consumer contract...");

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.oaquaBridgeAddress as `0x${string}`,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  runtime.log("[Ghost] Waiting for write report response");

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    runtime.log(`[Ghost] Write report transaction succeeded: ${txHash}`);
    runtime.log(
      `[Ghost] View transaction at https://sepolia.etherscan.io/tx/${txHash}`
    );
    return txHash;
  } else {
    throw new Error(`Write report failed with status: ${writeResult.txStatus}`);
  }
}

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  runtime.log(`Cron Trigger Fired at: ${new Date().toISOString()}`);
  return executeCrisisResponse(runtime);
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({
    configSchema: configSchema,
  });
  await runner.run(initWorkflow);
}

main();
