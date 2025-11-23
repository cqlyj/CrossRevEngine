# CrossRevEngine

> **Teleporting Market-Making Strategies Across Chains**

CrossRevEngine is an autonomous system that creates **Just-In-Time Liquidity**—ephemeral AMM pools that materialize precisely when and where opportunities exist, then vanish.

Instead of leaving capital idle in static pools, we bridge both the assets _and_ the trading logic, deploying temporary "Ghost AMMs" that exist only long enough to capture profit.

---

## 🎯 The Core Innovation

**Traditional DeFi**: Liquidity sits passively in monolithic pools, waiting for traders.

**CrossRevEngine**: AI detects a market event → compiles a custom strategy into bytecode → teleports the capital + code cross-chain → spawns a temporary AMM → captures profit → dissolves.

### The Breakthrough

We don't just bridge tokens. **We bridge entire market-making strategies.**

A single cross-chain message carries:

- ✅ The capital (USDC via Stargate V2)
- ✅ The logic (SwapVM bytecode)
- ✅ The execution context (encoded in LayerZero `composeMsg`)

Upon arrival, a smart contract instantly deploys a programmable liquidity pool tailored for _that specific moment_—a peg recovery, an arbitrage window, a black swan event.

When the job is done, the strategy "docks" and the liquidity returns home.

---

## 🏗️ Architecture: Brain, Body, Ghost

```
┌───────────────────────────────────────────────────────────────┐
│  🧠 THE BRAIN: Chainlink CRE                                  │
│     • Monitors: Crisis feeds, social sentiment, on-chain data │
│     • Analyzes: AI agent evaluates opportunity confidence     │
│     • Compiles: Generates SwapVM bytecode for optimal curve   │
│     • Signs: Cryptographically signs execution payload        │
└────────────────────────┬──────────────────────────────────────┘
                         │ Signed Report
                         ▼
┌───────────────────────────────────────────────────────────────┐
│  🚀 THE BODY: LayerZero V2 + Stargate V2                      │
│     • Stargate: Bridges assets (USDC) cross-chain             │
│     • Payload: SwapVM bytecode travels in composeMsg          │
│     • Compose: Triggers strategy deployment on arrival        │
└────────────────────────┬──────────────────────────────────────┘
                         │ Assets + Code
                         ▼
┌───────────────────────────────────────────────────────────────┐
│  👻 THE GHOST: 1inch Aqua + SwapVM                            │
│     • Receives: Funds + bytecode on destination chain         │
│     • Ships: Registers strategy with Aqua (virtual balances)  │
│     • Executes: Creates ephemeral AMM with programmable curve │
│     • Docks: Dissolves strategy after opportunity is captured │
└───────────────────────────────────────────────────────────────┘
```

---

## 🔬 How It Works

### 1. **Crisis Detection** (Every 30 seconds)

Chainlink CRE workflow wakes up and fetches aggregated intelligence:

- 🔗 **On-chain**: Exploit detection, drained amounts, affected pools
- 🐦 **Social**: Twitter alerts, panic levels, sentiment analysis
- 📈 **Market**: Arbitrage spreads, volatility, gas conditions

### 2. **AI Strategy Generation**

The `GhostLiquidityAgent` analyzes the crisis and compiles a response:

- **Stable Peg Recovery?** → Constant Sum curve (limit order behavior)
- **High Volatility?** → Constant Product curve (AMM behavior)
- **Depeg Arbitrage?** → Custom XYC pool with optimal pricing

Output: SwapVM bytecode + risk assessment + execution parameters

### 3. **Cross-Chain Teleportation**

The system calls `sendSwap` on the source chain:

```solidity
// Stargate bridges USDC + SwapVM bytecode
oaquaSender.sendSwap{value: fee}(
    payload,      // Contains: strategy bytecode, tokens, curve params
    extraOptions, // LayerZero compose options
    minAmountLD   // Slippage protection
);
```

### 4. **Ghost Pool Deployment**

On the destination chain, `OAquaExecutor` receives the message:

```solidity
function lzCompose(...) external {
    // Decode strategy from composeMsg
    SwapPayload memory payload = abi.decode(composeMsg, (SwapPayload));

    // Ship ephemeral strategy to 1inch Aqua
    aqua.ship(payload.program, payload.encodedOrder);
    // ↑ A new AMM pool just spawned
}
```

### 5. **Profit Capture**

- 1inch Solvers detect the new liquidity source
- They execute swaps against the Ghost AMM
- The strategy captures the arbitrage/trade
- Funds accumulate in the executor contract

### 6. **Teardown**

```solidity
aqua.dock(strategyHash);  // Dissolve the temporary pool
// Liquidity is freed, can be bridged back or redeployed
```

---

## 🎯 Why This Matters

### Capital Efficiency

Traditional AMMs fragment liquidity across dozens of pools. With **1inch Aqua's virtual balances**, multiple Ghost strategies can share the same underlying capital.

### Programmable Markets

Each Ghost AMM is a **custom trading curve** compiled for a specific event:

- Depeg recovery → Aggressive buy orders at discount
- Exploit aftermath → Schrödinger liquidity (simultaneous multi-asset orders)
- Volatility surge → Dynamic fee curves

### Autonomous Execution

No human intervention. The system:

- ✅ Detects opportunities in real-time
- ✅ Compiles optimal strategies via AI
- ✅ Deploys capital cross-chain
- ✅ Executes trades
- ✅ Reports results

---

## 📦 Current Implementation: OAqua

**Live Demo**: Arbitrum/Sepolia → Base

| Component         | Network       | Address         | Role                                 |
| ----------------- | ------------- | --------------- | ------------------------------------ |
| **OAquaBridge**   | Sepolia       | `0x7C9d...3892` | Receives CRE reports, triggers swaps |
| **OAquaSender**   | Sepolia       | `0x1805...7435` | Bridges via Stargate + LZ compose    |
| **OAquaExecutor** | Base          | `0x471e...762A` | Deploys Ghost strategies on Aqua     |
| **CRE Workflow**  | Chainlink DON | -               | AI agent + cron trigger (30s)        |

### Strategy Type: XYC Pool

Current implementation uses a **Constant Product** curve \(x \cdot y = k\):

- **Token In**: USDC (bridged from Sepolia)
- **Token Out**: USDT (pre-funded on Base)
- **Curve**: Programmable via SwapVM opcodes

****---

## 🚀 Quick Start

### Prerequisites

```bash
# Chainlink CRE workflows
bun install  # In chainlink-cre/ghost-liquidity/

# Smart contracts
pnpm install  # In oaquaApp/
```

### Simulate a Crisis Response

```bash
cd chainlink-cre/ghost-liquidity

# Run dry-run simulation
cre workflow simulate ghost-liquidity --target staging-settings

# Deploy to Chainlink DON
cre workflow deploy ghost-liquidity --target staging-settings
```

### Deploy a Ghost Strategy

```bash
cd oaquaApp

# Ship strategy: bridges 0.01 USDC + deploys AMM on Base
make send-swap AMOUNT=10000

# Check if strategy is active
make check-strategy

# Execute a swap against the Ghost pool
make swap SWAP_AMOUNT=1000

# Dissolve the strategy
make dock
```

---

## 🧪 Key Technologies

### Chainlink CRE (Runtime Environment)

- **Role**: Autonomous compute + AI agent orchestration
- **Features**: Cron triggers, HTTP requests, cryptographic signing
- **Innovation**: Compiles natural language → SwapVM bytecode

### LayerZero V2 + Stargate V2

- **Role**: Unified cross-chain transport
- **Features**: OFT token bridging + `lzCompose` for complex logic
- **Innovation**: Strategy bytecode travels inside `composeMsg`

### 1inch Aqua + SwapVM

- **Role**: Ephemeral liquidity execution layer
- **Features**: Virtual balances, programmable curves, gas-optimized routing
- **Innovation**: `ship()` → deploy, `dock()` → dissolve strategies on-demand

---

## 🔐 Security Model

### Chainlink CRE

- ✅ Reports are **signed by DON nodes** (multi-signature validation)
- ✅ Only `KeystoneForwarder` can trigger `OAquaBridge.onReport()`
- ✅ No EOA private keys involved in automated execution

### LayerZero

- ✅ Endpoint validation via `setPeer()`
- ✅ Compose-only execution (no arbitrary external calls)
- ✅ Emergency `rescueToken()` function with ownership control

### 1inch Aqua

- ✅ SwapVM bytecode sandboxing (no arbitrary calls)
- ✅ Strategy immutability (strategies cannot be modified after shipping)
- ✅ Virtual accounting prevents direct token theft

---

## 📊 Performance Metrics

| Metric                     | Value                               |
| -------------------------- | ----------------------------------- |
| **Detection Latency**      | 30 seconds (cron interval)          |
| **Strategy Compilation**   | ~2 seconds (AI + encoding)          |
| **Cross-Chain Settlement** | 30-60 seconds (LayerZero finality)  |
| **Cost per Execution**     | ~$0.05 (Sepolia gas + LZ fees)      |
| **Throughput**             | 120 strategies/hour (30s intervals) |

---

## 🎯 Use Cases

### 1. Crisis Arbitrage

**Scenario**: A stablecoin depegs to $0.95.

**Response**:

- Chainlink CRE detects the depeg via price feeds + social sentiment
- AI compiles a limit-order-like strategy (Constant Sum curve) to buy at $0.96
- Strategy teleports to the affected chain
- Ghost AMM captures the recovery trade as the peg restores

### 2. Exploit Response

**Scenario**: A DeFi protocol is hacked, draining $10M.

**Response**:

- On-chain intelligence detects unusual fund movements
- AI identifies undervalued governance tokens due to panic selling
- Deploys Schrödinger liquidity (simultaneous buy orders across multiple assets)
- First fill triggers cancellation of others (capital efficiency)

### 3. Cross-Chain MEV

**Scenario**: An arbitrage opportunity exists between Arbitrum and Base.

**Response**:

- Market intelligence detects the spread
- Strategy compiles with optimal slippage parameters
- Bridges + deploys in a single transaction
- Captures the arbitrage before static bots react

---

## 🛠️ Development Roadmap

- [x] **Phase 1**: Core architecture (Chainlink CRE + LayerZero + Aqua)
- [x] **Phase 2**: OAqua testnet deployment (Sepolia + Base)
- [x] **Phase 3**: AI agent integration (GhostLiquidityAgent)
- [ ] **Phase 4**: Multi-chain expansion (Arbitrum, Optimism, Polygon)
- [ ] **Phase 5**: Advanced curve types (Curve StableSwap, Balancer weighted pools)
- [ ] **Phase 6**: Mainnet production deployment

---

## 🤝 Contributing

This project is **experimental**. If you want to extend it:

```bash
# 1. Fork the repository
git clone <your-fork>

# 2. Create a feature branch
git checkout -b feature/advanced-curves

# 3. Make changes and test
cd chainlink-cre/ghost-liquidity
cre workflow simulate ghost-liquidity --target staging-settings

# 4. Submit PR
```

---

## 📚 Resources

- [Chainlink CRE Documentation](https://docs.chain.link/chainlink-runtime-environment)
- [LayerZero V2 Developer Docs](https://docs.layerzero.network/)
- [1inch Aqua Protocol Guide](https://docs.1inch.io/docs/aqua/introduction)
- [SwapVM SDK Reference](https://www.npmjs.com/package/@1inch/swap-vm-sdk)
- [Stargate V2 Integration](https://stargateprotocol.gitbook.io/)

---

## 📄 License

MIT License - See LICENSE file for details

---

## 💡 The Vision

DeFi liquidity shouldn't be static. It should be **intelligent, mobile, and ephemeral**.

CrossRevEngine treats market-making strategies as **portable programs** that can be compiled, transported, and executed anywhere, anytime.

The future of DeFi is not bigger pools—it's smarter, just-in-time liquidity that appears exactly when and where it's needed.

**Ghost liquidity. Everywhere and nowhere.**

---

**Built with 💙 by the CrossRevEngine Team**
