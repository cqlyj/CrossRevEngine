import { ethers } from 'hardhat'
import assert from 'assert'

/**
 * Dock (withdraw) a strategy from Aqua
 * Returns all liquidity to the Executor, then can be rescued
 *
 * Usage:
 *   STRATEGY_HASH=0x... npx hardhat run scripts/dock_strategy.ts --network base-mainnet
 *
 * Environment:
 *   STRATEGY_HASH - Required: The strategy hash to dock
 */
async function main() {
    const [signer] = await ethers.getSigners()

    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS_BASE || process.env.OAQUA_EXECUTOR_ADDRESS
    const aquaAddress = process.env.BASE_AQUA_ADDRESS
    const routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER
    const usdcAddress = process.env.USDC_ADDRESS_BASE
    const usdtAddress = process.env.USDT_ADDRESS_BASE
    const strategyHash = process.env.STRATEGY_HASH

    assert(executorAddress, 'Missing executor address')
    assert(aquaAddress, 'Missing BASE_AQUA_ADDRESS')
    assert(routerAddress, 'Missing BASE_AQUA_SWAPVM_ROUTER')
    assert(usdcAddress, 'Missing USDC_ADDRESS_BASE')
    assert(usdtAddress, 'Missing USDT_ADDRESS_BASE')
    assert(strategyHash, 'Missing STRATEGY_HASH env var')

    console.log('[Dock] Strategy Hash:', strategyHash)
    console.log('[Dock] Executor:', executorAddress)

    const aquaAbi = ['function safeBalances(address,address,bytes32,address,address) view returns (uint256,uint256)']
    const aqua = new ethers.Contract(aquaAddress, aquaAbi, signer)
    const executor = await ethers.getContractAt('OAquaExecutor', executorAddress, signer)

    const [usdcBefore, usdtBefore] = await aqua.safeBalances(
        executorAddress,
        routerAddress,
        strategyHash,
        usdcAddress,
        usdtAddress
    )
    console.log('[Dock] USDC before:', ethers.utils.formatUnits(usdcBefore, 6))
    console.log('[Dock] USDT before:', ethers.utils.formatUnits(usdtBefore, 6))

    if (usdcBefore.eq(0) && usdtBefore.eq(0)) {
        console.log('[Dock] No liquidity. Already docked?')
        return
    }

    console.log('[Dock] Executing...')
    const tx = await executor.dock(strategyHash)
    console.log('[Dock] TX:', tx.hash)
    const receipt = await tx.wait()
    console.log('[Dock] Confirmed in block', receipt.blockNumber)

    const [usdcAfter, usdtAfter] = await aqua.safeBalances(
        executorAddress,
        routerAddress,
        strategyHash,
        usdcAddress,
        usdtAddress
    )
    console.log('[Dock] USDC after:', ethers.utils.formatUnits(usdcAfter, 6))
    console.log('[Dock] USDT after:', ethers.utils.formatUnits(usdtAfter, 6))

    const usdc = await ethers.getContractAt('IERC20', usdcAddress)
    const usdt = await ethers.getContractAt('IERC20', usdtAddress)
    const executorUsdc = await usdc.balanceOf(executorAddress)
    const executorUsdt = await usdt.balanceOf(executorAddress)

    console.log('[Dock] Executor USDC:', ethers.utils.formatUnits(executorUsdc, 6))
    console.log('[Dock] Executor USDT:', ethers.utils.formatUnits(executorUsdt, 6))

    if (executorUsdc.gt(0) || executorUsdt.gt(0)) {
        console.log('[Dock] Done. Run: make rescue')
    } else {
        console.log('[Dock] No tokens in Executor')
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
