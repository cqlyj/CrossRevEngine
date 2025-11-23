import { ethers } from 'hardhat'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config()

/**
 * Execute a swap against a shipped strategy
 * Usage: npx hardhat run scripts/execute_swap.ts --network base-mainnet
 */
async function main() {
    console.log('[Swap] Executing swap against strategy...')

    // Reload .env to get latest deployed addresses
    delete require.cache[require.resolve('dotenv')]
    require('dotenv').config()

    const [signer] = await ethers.getSigners()
    console.log('[Swap] Signer:', signer.address)

    const routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER
    const aquaAddress = process.env.BASE_AQUA_ADDRESS

    if (!routerAddress || !aquaAddress) {
        throw new Error('Missing BASE_AQUA_SWAPVM_ROUTER or BASE_AQUA_ADDRESS')
    }

    console.log('[Swap] Router:', routerAddress)
    console.log('[Swap] Aqua:', aquaAddress)

    // Load strategy from last_strategy.json
    const dataPath = path.join(__dirname, '../data/last_strategy.json')
    if (!fs.existsSync(dataPath)) {
        throw new Error('No strategy found. Run: make send-swap first')
    }

    const strategyInfo = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

    // Parse the encoded order (as shown in SDK docs line 95-96)
    const {
        Order: SDKOrder,
        HexString: SDKHexString,
        MakerTraits,
        Address: SDKAddress,
        SwapVMContract,
        TakerTraits,
    } = require('@1inch/swap-vm-sdk')
    const encodedOrderHex = new SDKHexString(strategyInfo.encodedOrder)
    const order = SDKOrder.decode(encodedOrderHex)

    const tokenIn = strategyInfo.tokenIn // What we provide
    const tokenOut = strategyInfo.tokenOut // What we receive

    console.log('[Swap] Loaded strategy from data/last_strategy.json')
    console.log('[Swap] Strategy: You provide', tokenIn, '→ receive', tokenOut)
    console.log('[Swap] Order maker:', order.maker.toString())
    console.log('[Swap] Order traits:', order.traits.toString())
    console.log('[Swap] Order program:', order.program.toString())

    // Get swap amount from args or use default
    const amountIn = process.env.SWAP_AMOUNT
        ? ethers.BigNumber.from(process.env.SWAP_AMOUNT)
        : ethers.BigNumber.from('1000') // Default 1000 units = 0.001 token

    const tokenInSymbol = tokenIn === process.env.USDC_ADDRESS_BASE ? 'USDC' : 'USDT'
    const tokenOutSymbol = tokenOut === process.env.USDC_ADDRESS_BASE ? 'USDC' : 'USDT'
    console.log(`[Swap] Amount in: ${ethers.utils.formatUnits(amountIn, 6)} ${tokenInSymbol}`)

    // Get contracts
    const swapVM = new SwapVMContract(routerAddress)
    const tokenInContract = await ethers.getContractAt('IERC20', tokenIn)

    // Check balance
    const balance = await tokenInContract.balanceOf(signer.address)
    console.log(`[Swap] ${tokenInSymbol} balance:`, ethers.utils.formatUnits(balance, 6))

    if (balance.lt(amountIn)) {
        throw new Error(
            `Insufficient ${tokenInSymbol} balance. Need ${ethers.utils.formatUnits(amountIn, 6)}, have ${ethers.utils.formatUnits(balance, 6)}`
        )
    }

    // Get quote using SDK
    console.log('[Swap] Getting quote...')
    // For Aqua orders: use Aqua address as "signature" for balance verification
    const takerTraits = TakerTraits.default()
    takerTraits.signature = new (require('@1inch/swap-vm-sdk').HexString)(aquaAddress)

    const swapParams = {
        order,
        tokenIn: new SDKAddress(tokenIn),
        tokenOut: new SDKAddress(tokenOut),
        amount: amountIn.toBigInt(),
        takerTraits,
    }

    try {
        const quoteTx = swapVM.quote(swapParams)
        const result = await signer.call({ to: quoteTx.to, data: quoteTx.data })
        const decoded = ethers.utils.defaultAbiCoder.decode(['uint256', 'uint256'], result)
        const amountOut = decoded[1]
        console.log(`[Swap] Expected output: ${ethers.utils.formatUnits(amountOut, 6)} ${tokenOutSymbol}`)
    } catch (error: any) {
        console.log('[Swap] Quote failed:', error.message)
        console.log('[Swap] Strategy might be expired or invalid')
        return
    }

    // Approve tokenIn to Aqua (not router!)
    const allowance = await tokenInContract.allowance(signer.address, aquaAddress)
    if (allowance.lt(amountIn)) {
        console.log(`[Swap] Approving ${tokenInSymbol} to Aqua...`)
        const approveTx = await tokenInContract.approve(aquaAddress, ethers.constants.MaxUint256)
        await approveTx.wait()
        console.log('[Swap] Approved')
    }

    // Execute swap using SDK
    console.log('[Swap] Executing swap via router...')
    const swapTx = swapVM.swap(swapParams)
    const tx = await signer.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: swapTx.value,
        gasLimit: 500000,
    })

    console.log('[Swap] Transaction:', tx.hash)
    const receipt = await tx.wait()
    console.log('[Swap] Success! Gas used:', receipt.gasUsed.toString())

    console.log('[Swap] Done!')
}

main().catch((error) => {
    console.error('[Swap] Error:', error.message)
    process.exitCode = 1
})
