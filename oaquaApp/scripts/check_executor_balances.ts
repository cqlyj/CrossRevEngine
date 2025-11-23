/**
 * Check Executor contract token balances
 */
import { ethers } from 'hardhat'

async function main() {
    // Reload .env to get latest deployed addresses
    delete require.cache[require.resolve('dotenv')]
    require('dotenv').config()
    
    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS
    const usdcAddress = process.env.USDC_ADDRESS_BASE
    const usdtAddress = process.env.USDT_ADDRESS_BASE

    if (!executorAddress || !usdcAddress || !usdtAddress) {
        throw new Error('Missing env vars')
    }

    const usdc = await ethers.getContractAt('IERC20', usdcAddress)
    const usdt = await ethers.getContractAt('IERC20', usdtAddress)

    const usdcBalance = await usdc.balanceOf(executorAddress)
    const usdtBalance = await usdt.balanceOf(executorAddress)

    console.log('[Balance] Executor:', executorAddress)
    console.log('[Balance] USDC:', ethers.utils.formatUnits(usdcBalance, 6))
    console.log('[Balance] USDT:', ethers.utils.formatUnits(usdtBalance, 6))
}

main().catch((error) => {
    console.error('[Balance] Error:', error.message)
    process.exitCode = 1
})

