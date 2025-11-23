import { ethers } from 'hardhat'
import assert from 'assert'

async function main() {
    const [signer] = await ethers.getSigners()

    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS || process.env.OAQUA_EXECUTOR_ADDRESS_BASE
    const usdcAddress = process.env.USDC_ADDRESS_BASE
    const usdtAddress = process.env.USDT_ADDRESS_BASE

    assert(executorAddress, 'Missing OAQUA_EXECUTOR_ADDRESS')
    assert(usdcAddress, 'Missing USDC_ADDRESS_BASE')
    assert(usdtAddress, 'Missing USDT_ADDRESS_BASE')

    console.log('[Rescue] Executor:', executorAddress)
    console.log('[Rescue] Rescuing to:', signer.address)

    const executor = await ethers.getContractAt('OAquaExecutor', executorAddress, signer)
    
    // Check and rescue USDC
    const usdc = await ethers.getContractAt('IERC20', usdcAddress, signer)
    const usdcBalance = await usdc.balanceOf(executorAddress)
    console.log('[Rescue] Executor USDC:', ethers.utils.formatUnits(usdcBalance, 6))

    if (usdcBalance.gt(0)) {
        console.log('[Rescue] Rescuing USDC...')
        const tx = await executor.rescueToken(usdcAddress, signer.address, usdcBalance)
        console.log('[Rescue] TX:', tx.hash)
        await tx.wait()
        console.log('[Rescue] USDC rescued')
    }

    // Check and rescue USDT
    const usdt = await ethers.getContractAt('IERC20', usdtAddress, signer)
    const usdtBalance = await usdt.balanceOf(executorAddress)
    console.log('[Rescue] Executor USDT:', ethers.utils.formatUnits(usdtBalance, 6))

    if (usdtBalance.gt(0)) {
        console.log('[Rescue] Rescuing USDT...')
        const tx = await executor.rescueToken(usdtAddress, signer.address, usdtBalance)
        console.log('[Rescue] TX:', tx.hash)
        await tx.wait()
        console.log('[Rescue] USDT rescued')
    }

    if (usdcBalance.eq(0) && usdtBalance.eq(0)) {
        console.log('[Rescue] No tokens to rescue')
    } else {
        console.log('[Rescue] Done')
    }
}

main().catch((error) => {
    console.error('[Rescue] Error:', error.message)
    process.exitCode = 1
})
