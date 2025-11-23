import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

// Reload .env to get latest deployed addresses
require('dotenv').config({ path: '.env', override: true })

async function main() {
    const executorAddress = process.env.OAQUA_EXECUTOR_ADDRESS || process.env.OAQUA_EXECUTOR_ADDRESS_BASE
    const aquaAddress = process.env.BASE_AQUA_ADDRESS
    const routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER
    const usdcAddress = process.env.USDC_ADDRESS_BASE
    const usdtAddress = process.env.USDT_ADDRESS_BASE

    if (!executorAddress || !aquaAddress || !routerAddress || !usdcAddress || !usdtAddress) {
        console.log('[Check] Error: Missing environment variables')
        process.exit(1)
    }

    // Try to load strategy info from last_strategy.json
    const dataPath = path.join(__dirname, '../data/last_strategy.json')
    let strategyHash: string | undefined
    let program = '0x1100'
    let makerAddress = executorAddress

    if (fs.existsSync(dataPath)) {
        const strategyInfo = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
        program = strategyInfo.program || '0x1100'
        makerAddress = strategyInfo.maker || executorAddress
        console.log('[Check] Loaded strategy from data/last_strategy.json')
        console.log('[Check] Using maker from JSON:', makerAddress)
    }

    // Compute strategy hash
    const order = {
        maker: makerAddress,
        traits: 0,
        data: program,
    }
    const strategyData = ethers.utils.defaultAbiCoder.encode(
        ['tuple(address maker, uint256 traits, bytes data)'],
        [order]
    )
    strategyHash = ethers.utils.keccak256(strategyData)

    console.log('[Check] Maker:', makerAddress)
    console.log('[Check] Aqua:', aquaAddress)
    console.log('[Check] Router:', routerAddress)
    console.log('[Check] Strategy Hash:', strategyHash)

    // Check Aqua balances
    const aquaAbi = [
        'function rawBalances(address maker, address app, bytes32 strategyHash, address token) external view returns (uint248 balance, uint8 tokensCount)',
    ]
    const aqua = await ethers.getContractAt(aquaAbi, aquaAddress)

    const [usdcBalance, usdcTokenCount] = await aqua.rawBalances(makerAddress, routerAddress, strategyHash, usdcAddress)
    const [usdtBalance, usdtTokenCount] = await aqua.rawBalances(makerAddress, routerAddress, strategyHash, usdtAddress)

    console.log('[Check] USDC:', ethers.utils.formatUnits(usdcBalance, 6), 'tokens:', usdcTokenCount.toString())
    console.log('[Check] USDT:', ethers.utils.formatUnits(usdtBalance, 6), 'tokens:', usdtTokenCount.toString())

    if (usdcBalance.gt(0)) {
        console.log('[Check] Status: ACTIVE')
    } else if (usdtBalance.gt(0)) {
        console.log('[Check] Status: PARTIAL (USDT only)')
    } else {
        console.log('[Check] Status: INACTIVE')
    }
}

main().catch((error) => {
    console.error('[Check] Error:', error.message)
    process.exitCode = 1
})
