.PHONY: help compile deploy-executor deploy-sender deploy-swap-executor deploy-all send-swap send-swap-redeploy swap check-strategy dock rescue fund-executor clean sync-addresses

# Default values
NETWORK_ARBITRUM ?= arbitrum-mainnet
NETWORK_BASE ?= base-mainnet
AMOUNT ?= 10000
SWAP_AMOUNT ?= 1
RECIPIENT ?= 0x120C1fc5B7f357c0254cDC8027970DDD6405e115
SALT ?= $(shell date +%s)
PROGRAM ?= 0x1100
TOKEN_OUT ?= 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
STRATEGY_HASH ?= 

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)OAqua Cross-Chain LP Provisioning$(NC)"
	@echo "$(BLUE)====================================$(NC)"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(NC)"
	@echo "  NETWORK_ARBITRUM     Arbitrum network (default: arbitrum-mainnet)"
	@echo "  NETWORK_BASE         Base network (default: base-mainnet)"
	@echo "  AMOUNT               Amount to send (default: 10000)"
	@echo "  RECIPIENT            Recipient address"
	@echo "  SALT                 Strategy salt (default: timestamp)"
	@echo "  PROGRAM              SwapVM program (default: 0x1100)"
	@echo "  TOKEN_OUT            Output token address (default: USDT)"
	@echo "  STRATEGY_HASH        Strategy hash for docking"
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make send-swap AMOUNT=10000        # Ship with 0.01 USDC (10000 units)"
	@echo "  make swap SWAP_AMOUNT=1            # Swap 0.000001 USDC (1 unit)"
	@echo "  make check-strategy                # Check strategy status"
	@echo "  make dock STRATEGY_HASH=0x...      # Withdraw liquidity"
	@echo "  make rescue                        # Rescue tokens from executor"

compile: ## Compile contracts
	@echo "$(BLUE)Compiling contracts...$(NC)"
	@npx hardhat compile

sync-addresses: ## Sync deployed contract addresses to .env
	@echo "$(BLUE)Syncing addresses...$(NC)"
	@npx ts-node scripts/sync_addresses.ts
	@echo "$(GREEN)Addresses synced$(NC)"

deploy-executor: compile ## Deploy OAquaExecutor to Base
	@echo "$(BLUE)Deploying OAquaExecutor to $(NETWORK_BASE)...$(NC)"
	@npx hardhat deploy --network $(NETWORK_BASE) --tags OAquaExecutor --reset
	@npx ts-node scripts/sync_addresses.ts
	@echo "$(GREEN)Executor deployed and .env updated$(NC)"

deploy-sender: compile ## Deploy OAquaSender to Arbitrum
	@echo "$(BLUE)Deploying OAquaSender to $(NETWORK_ARBITRUM)...$(NC)"
	@npx hardhat deploy --network $(NETWORK_ARBITRUM) --tags OAquaSender --reset
	@npx ts-node scripts/sync_addresses.ts
	@echo "$(GREEN)Sender deployed and .env updated$(NC)"

deploy-swap-executor: compile ## Deploy OAquaSwapExecutor to Base
	@echo "$(BLUE)Deploying OAquaSwapExecutor to $(NETWORK_BASE)...$(NC)"
	@npx hardhat deploy --network $(NETWORK_BASE) --tags OAquaSwapExecutor --reset
	@npx ts-node scripts/sync_addresses.ts
	@echo "$(GREEN)SwapExecutor deployed and .env updated$(NC)"

deploy-all: deploy-executor deploy-sender deploy-swap-executor ## Deploy all contracts
	@echo "$(GREEN)All contracts deployed$(NC)"

send-swap: compile sync-addresses ## Deploy contracts and ship quantum strategies
	@echo "$(BLUE)Deploying contracts and shipping quantum strategies...$(NC)"
	@npx ts-node scripts/ship_quantum_strategies.ts --amount $(AMOUNT) --recipient $(RECIPIENT)
	@echo "$(GREEN)✓ Strategies shipped! Now run: make swap$(NC)"

send-swap-redeploy: compile ## Redeploy everything and ship strategies
	@echo "$(BLUE)Redeploying all contracts and shipping quantum strategies...$(NC)"
	@npx ts-node scripts/ship_quantum_strategies.ts --redeploy --amount $(AMOUNT) --recipient $(RECIPIENT)
	@echo "$(GREEN)✓ All redeployed and strategies shipped! Now run: make swap$(NC)"

swap: ## Execute a swap against the shipped strategy
	@echo "$(BLUE)Executing swap...$(NC)"
	SWAP_AMOUNT=$(SWAP_AMOUNT) npx hardhat run scripts/execute_swap.ts --network $(NETWORK_BASE)
	@echo "$(GREEN)✓ Swap completed$(NC)"

check-strategy: ## Check Aqua strategy status on Base
	@echo "$(BLUE)Checking Aqua strategy status...$(NC)"
	npx hardhat run scripts/check_aqua_strategy.ts --network $(NETWORK_BASE)

dock: ## Withdraw liquidity from Aqua strategy
	@if [ -z "$(STRATEGY_HASH)" ]; then \
		echo "$(RED)Error: STRATEGY_HASH is required$(NC)"; \
		echo "Usage: make dock STRATEGY_HASH=0x..."; \
		exit 1; \
	fi
	@echo "$(BLUE)Docking strategy...$(NC)"
	STRATEGY_HASH=$(STRATEGY_HASH) npx hardhat run scripts/dock_strategy.ts --network $(NETWORK_BASE)
	@echo "$(GREEN)✓ Strategy docked! Run 'make rescue' to get tokens back$(NC)"

rescue: ## Rescue tokens from Executor back to wallet
	@echo "$(BLUE)Rescuing tokens from Executor...$(NC)"
	npx hardhat run scripts/rescue_base.ts --network $(NETWORK_BASE)
	@echo "$(GREEN)✓ Tokens rescued$(NC)"

fund-executor: ## Manually fund executor with USDT
	@echo "$(BLUE)Funding executor with USDT...$(NC)"
	AMOUNT=$(AMOUNT) npx hardhat run scripts/fund_executor_usdt.ts --network $(NETWORK_BASE)
	@echo "$(GREEN)✓ Executor funded$(NC)"

clean: ## Clean build artifacts
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	@rm -rf artifacts cache typechain-types out
	@echo "$(GREEN)Cleaned$(NC)"

quickstart: ## Show quick start guide
	@echo "$(BLUE)OAqua Quantum Liquidity Quick Start$(NC)"
	@echo ""
	@echo "$(GREEN)1. Deploy & Ship Strategy:$(NC)"
	@echo "   make send-swap AMOUNT=10000    # 0.01 USDC"
	@echo ""
	@echo "$(GREEN)2. Execute Swaps:$(NC)"
	@echo "   make swap SWAP_AMOUNT=1        # Tiny test swap"
	@echo ""
	@echo "$(GREEN)3. Check Status:$(NC)"
	@echo "   make check-strategy"
	@echo ""
	@echo "$(GREEN)4. Withdraw Liquidity:$(NC)"
	@echo "   make dock STRATEGY_HASH=0x..."
	@echo "   make rescue"

