import { task, types } from 'hardhat/config'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

task('oaqua:dock', 'Withdraws liquidity from an Aqua strategy')
    .addParam('strategyHash', 'The strategy hash to dock', undefined, types.string)
    .addOptionalParam('executor', 'OAquaExecutor address', undefined, types.string)
    .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners()
        
        let executorAddress = args.executor
        if (!executorAddress) {
            const deployment = await hre.deployments.get('OAquaExecutor')
            executorAddress = deployment.address
        }
        
        console.log(`Docking strategy ${args.strategyHash} from Executor ${executorAddress}`)
        
        const executor = await hre.ethers.getContractAt('OAquaExecutor', executorAddress, signer)
        
        // Define the tokens to withdraw
        const USDC_ADDRESS = process.env.USDC_ADDRESS_BASE || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        const USDT_ADDRESS = process.env.USDT_ADDRESS_BASE || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
        const tokens = [USDC_ADDRESS, USDT_ADDRESS]
        
        console.log(`Withdrawing tokens: ${tokens.join(', ')}`)
        
        const tx = await executor.dock(args.strategyHash, tokens)
        console.log(`Transaction sent: ${tx.hash}`)
        
        const receipt = await tx.wait()
        console.log(`✅ Strategy docked! Gas used: ${receipt.gasUsed.toString()}`)
        
        // Check balances
        const usdc = await hre.ethers.getContractAt('IERC20', USDC_ADDRESS)
        const usdt = await hre.ethers.getContractAt('IERC20', USDT_ADDRESS)
        
        const usdcBalance = await usdc.balanceOf(executorAddress)
        const usdtBalance = await usdt.balanceOf(executorAddress)
        
        console.log(`\nExecutor balances after docking:`)
        console.log(`  USDC: ${hre.ethers.utils.formatUnits(usdcBalance, 6)}`)
        console.log(`  USDT: ${hre.ethers.utils.formatUnits(usdtBalance, 6)}`)
        
        console.log(`\nTo rescue tokens back to your wallet, run:`)
        console.log(`  npx hardhat oaqua:rescue --network base-mainnet`)
    })

