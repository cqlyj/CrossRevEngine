import { ethers } from 'hardhat'

async function main() {
    const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS || "0x493C826e17D466e9Cc1157C7eBed95980A47BF58"
    const AQUA_ADDRESS = process.env.BASE_AQUA_ADDRESS || "0x499943e74fb0ce105688beee8ef2abec5d936d31"
    const ROUTER_ADDRESS = process.env.BASE_AQUA_SWAPVM_ROUTER || "0x8fdd04dbf6111437b44bbca99c28882434e0958f"
    const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // Base USDC
    const USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" // Base USDT
    
    // The strategy salt from your transaction
    const STRATEGY_SALT = process.env.STRATEGY_SALT || "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678aa"
    
    console.log(`\n=== Checking Aqua Strategy Status ===`)
    console.log(`Executor: ${EXECUTOR_ADDRESS}`)
    console.log(`Aqua: ${AQUA_ADDRESS}`)
    console.log(`Router: ${ROUTER_ADDRESS}`)
    console.log(`Strategy Salt: ${STRATEGY_SALT}\n`)
    
    // Get USDC balance of executor (should be 0 if strategy was shipped)
    const usdc = await ethers.getContractAt('IERC20', USDC_ADDRESS)
    const executorBalance = await usdc.balanceOf(EXECUTOR_ADDRESS)
    console.log(`Executor USDC Balance: ${ethers.utils.formatUnits(executorBalance, 6)} USDC`)
    
    if (executorBalance.gt(0)) {
        console.log(`⚠️  Executor still has USDC - strategy may not have been shipped yet`)
    } else {
        console.log(`✅ Executor has no USDC - tokens were either shipped to Aqua or not received yet`)
    }
    
    // Compute the strategy hash
    // Strategy = abi.encode(Order) where Order = {maker: executor, traits: 0, data: program}
    const order = {
        maker: EXECUTOR_ADDRESS,
        traits: 0,
        data: "0x1100" // The SwapVM program
    }
    const strategyData = ethers.utils.defaultAbiCoder.encode(
        ['tuple(address maker, uint256 traits, bytes data)'],
        [order]
    )
    const strategyHash = ethers.utils.keccak256(strategyData)
    console.log(`\nComputed Strategy Hash: ${strategyHash}`)
    
    // Check Aqua balances for this strategy
    const aquaAbi = [
        'function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1) external view returns (uint256 balance0, uint256 balance1)'
    ]
    const aqua = await ethers.getContractAt(aquaAbi, AQUA_ADDRESS)
    
    try {
        const [usdcBalance, usdtBalance] = await aqua.safeBalances(
            EXECUTOR_ADDRESS,
            ROUTER_ADDRESS,
            strategyHash,
            USDC_ADDRESS,
            USDT_ADDRESS
        )
        
        console.log(`\n=== Aqua Strategy Balances ===`)
        console.log(`USDC Balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC`)
        console.log(`USDT Balance: ${ethers.utils.formatUnits(usdtBalance, 6)} USDT`)
        
        if (usdcBalance.gt(0)) {
            console.log(`\n🎉 SUCCESS! Strategy was shipped with ${ethers.utils.formatUnits(usdcBalance, 6)} USDC!`)
            console.log(`\nYou are now an LP providing liquidity for USDC/USDT swaps on Base!`)
            console.log(`Traders can swap against your liquidity via the SwapVM Router.`)
            console.log(`\nTo withdraw: npx hardhat dock --network base-mainnet --strategy-hash ${strategyHash}`)
        } else {
            console.log(`\n❌ No balances found for this strategy. Possible reasons:`)
            console.log(`   1. Transaction hasn't been delivered to Base yet (check LayerZero Scan)`)
            console.log(`   2. Strategy hash calculation is incorrect`)
            console.log(`   3. The ship() call failed`)
        }
    } catch (error) {
        console.log(`\n❌ Error querying Aqua balances: ${error.message}`)
        console.log(`This might mean the strategy doesn't exist yet.`)
    }
    
    // Also check for Shipped events
    console.log(`\n=== Checking for Shipped Events ===`)
    const shippedEventAbi = [
        'event Shipped(address indexed maker, address indexed app, bytes32 indexed strategyHash, bytes strategy)'
    ]
    const aquaWithEvents = new ethers.Contract(AQUA_ADDRESS, shippedEventAbi, ethers.provider)
    
    // Query last 1000 blocks for Shipped events
    const currentBlock = await ethers.provider.getBlockNumber()
    const fromBlock = currentBlock - 1000
    
    const filter = aquaWithEvents.filters.Shipped(EXECUTOR_ADDRESS, ROUTER_ADDRESS, strategyHash)
    const events = await aquaWithEvents.queryFilter(filter, fromBlock, currentBlock)
    
    if (events.length > 0) {
        console.log(`✅ Found ${events.length} Shipped event(s) for this strategy!`)
        events.forEach((event, i) => {
            console.log(`   Event ${i + 1}: Block ${event.blockNumber}, Tx ${event.transactionHash}`)
        })
    } else {
        console.log(`❌ No Shipped events found in last 1000 blocks`)
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

