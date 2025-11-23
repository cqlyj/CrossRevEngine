import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { updateEnvFile } from '../scripts/lib/envUpdater'

const deployOAquaSwapExecutor: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    console.log('[Deploy] Deploying OAquaSwapExecutor on', network.name)
    console.log('[Deploy] Deployer:', deployer)

    let aquaAddress: string
    let routerAddress: string

    if (network.name === 'base' || network.name === 'base-mainnet' || network.name === 'baseSepolia') {
        aquaAddress = process.env.BASE_AQUA_ADDRESS!
        routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER!
    } else {
        throw new Error(`Network ${network.name} not supported for OAquaSwapExecutor`)
    }

    if (!aquaAddress || !routerAddress) {
        throw new Error('Missing required environment variables for OAquaSwapExecutor deployment')
    }

    console.log('[Deploy] Aqua:', aquaAddress)
    console.log('[Deploy] Router:', routerAddress)
    console.log('[Deploy] Owner:', deployer)

    const swapExecutor = await deploy('OAquaSwapExecutor', {
        from: deployer,
        args: [aquaAddress, routerAddress, deployer],
        log: true,
        waitConfirmations: 1,
    })

    console.log('[Deploy] OAquaSwapExecutor deployed to:', swapExecutor.address)

    // Update .env file with the deployed address
    if (network.name === 'base') {
        updateEnvFile('OAQUA_SWAP_EXECUTOR_ADDRESS_BASE', swapExecutor.address)
        updateEnvFile('OAQUA_SWAP_EXECUTOR_ADDRESS', swapExecutor.address)
    }

    console.log('[Deploy] Deployment complete!')
}

export default deployOAquaSwapExecutor
deployOAquaSwapExecutor.tags = ['OAquaSwapExecutor', 'base']

