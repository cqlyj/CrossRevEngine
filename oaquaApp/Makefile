.PHONY: help compile deploy-executor deploy-sender send-swap send-only check-strategy dock rescue clean sync-addresses

# Default values
NETWORK_ARBITRUM ?= arbitrum-mainnet
NETWORK_BASE ?= base-mainnet
AMOUNT ?= 10000
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
	@echo "  make send-swap AMOUNT=50000        # Deploy & send 50000 USDC"
	@echo "  make send-only AMOUNT=50000        # Send without redeploying"
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

deploy-all: deploy-executor deploy-sender ## Deploy both Executor and Sender
	@echo "$(GREEN)All contracts deployed$(NC)"

send-swap: compile ## Deploy contracts and send swap in one command
	@echo "$(BLUE)Deploying contracts and sending swap...$(NC)"
	@npx ts-node scripts/deploy_and_send.ts --redeploy --amount $(AMOUNT) --token-out $(TOKEN_OUT) --recipient $(RECIPIENT) --program $(PROGRAM)
	@echo "$(GREEN)Done. Check: make check-strategy$(NC)"

send-only: ## Send swap without redeploying
	@echo "$(BLUE)Sending swap...$(NC)"
	@npx ts-node scripts/deploy_and_send.ts --amount $(AMOUNT) --token-out $(TOKEN_OUT) --recipient $(RECIPIENT) --program $(PROGRAM)
	@echo "$(GREEN)Done. Check: make check-strategy$(NC)"

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

clean: ## Clean build artifacts
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	@rm -rf artifacts cache typechain-types out
	@echo "$(GREEN)Cleaned$(NC)"

quickstart: ## Show quick start guide
	@echo "$(BLUE)OAqua Quick Start$(NC)"
	@echo ""
	@echo "$(GREEN)1. Deploy & Ship Strategy:$(NC)"
	@echo "   make send-swap AMOUNT=100000"
	@echo ""
	@echo "$(GREEN)2. Check Status:$(NC)"
	@echo "   make check-strategy"
	@echo ""
	@echo "$(GREEN)3. Withdraw Liquidity:$(NC)"
	@echo "   make dock STRATEGY_HASH=0x..."
	@echo "   make rescue"

