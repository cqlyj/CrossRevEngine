/**
 * Send USDT to Executor for XYC pool
 */
import { ethers } from 'hardhat'

async function main() {
    // Reload .env to get latest deployed addresses
    delete require.cache[require.resolve('dotenv')]
    require('dotenv').config()
    
    const [signer] = await ethers.getSigners()
    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS
    const usdtAddress = process.env.USDT_ADDRESS_BASE

    if (!executorAddress || !usdtAddress) {
        throw new Error('Missing env vars')
    }

    // Amount in env or default 0.01 USDT (10000 units)
    const amount = process.env.AMOUNT || process.env.USDT_AMOUNT || '10000'

    const usdt = await ethers.getContractAt('IERC20', usdtAddress)
    const amountBN = ethers.BigNumber.from(amount)

    console.log('[Fund] Checking executor USDT balance...')
    const executorBalance = await usdt.balanceOf(executorAddress)
    console.log('[Fund] Executor has:', ethers.utils.formatUnits(executorBalance, 6), 'USDT')
    console.log('[Fund] Target amount:', ethers.utils.formatUnits(amountBN, 6), 'USDT')

    if (executorBalance.gte(amountBN)) {
        console.log('[Fund] ✓ Executor already has sufficient USDT. Skipping funding.')
        return
    }

    const needed = amountBN.sub(executorBalance)
    console.log('[Fund] Need to send:', ethers.utils.formatUnits(needed, 6), 'USDT')

    const balance = await usdt.balanceOf(signer.address)
    console.log('[Fund] Your USDT balance:', ethers.utils.formatUnits(balance, 6))

    if (balance.lt(needed)) {
        console.log('[Fund] Warning: Insufficient USDT to fund executor')
        console.log('[Fund] ✓ Continuing anyway (executor has', ethers.utils.formatUnits(executorBalance, 6), 'USDT)')
        return
    }

    console.log('[Fund] Sending USDT to executor...')
    const tx = await usdt.transfer(executorAddress, needed)
    console.log('[Fund] TX:', tx.hash)
    await tx.wait()

    const newBalance = await usdt.balanceOf(executorAddress)
    console.log('[Fund] New executor balance:', ethers.utils.formatUnits(newBalance, 6), 'USDT')
    console.log('[Fund] ✓ Done')
}

main().catch((error) => {
    console.error('[Fund] Error:', error.message)
    process.exitCode = 1
})

