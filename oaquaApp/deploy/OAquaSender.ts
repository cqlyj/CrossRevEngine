import assert from 'assert'
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { type DeployFunction } from 'hardhat-deploy/types'
import { updateEnvFile } from '../scripts/lib/envUpdater'

const contractName = 'OAquaSender'

async function resolveExecutorAddress(hre: Parameters<DeployFunction>[0]): Promise<string | undefined> {
    if (process.env.OAQUA_EXECUTOR_ADDRESS && process.env.OAQUA_EXECUTOR_ADDRESS !== '') {
        return process.env.OAQUA_EXECUTOR_ADDRESS
    }

    if (process.env.OAQUA_EXECUTOR_ADDRESS_BASE && process.env.OAQUA_EXECUTOR_ADDRESS_BASE !== '') {
        return process.env.OAQUA_EXECUTOR_ADDRESS_BASE
    }

    if (hre.companionNetworks?.base) {
        try {
            const baseDeployment = await hre.companionNetworks.base.deployments.get('OAquaExecutor')
            return baseDeployment.address
        } catch (error) {
            console.warn('Could not resolve OAquaExecutor from base-mainnet deployments.')
        }
    }

    return undefined
}

const deploy: DeployFunction = async (hre) => {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    const tokenIn = process.env.USDC_ADDRESS_ARBITRUM
    const stargatePool = process.env.ARBITRUM_STARGATE_POOL
    let destinationExecutor = await resolveExecutorAddress(hre)
    const destinationEid = EndpointId.BASE_V2_MAINNET
    const destinationTokenIn = process.env.USDC_ADDRESS_BASE
    const destinationTokenOut = process.env.USDT_ADDRESS_BASE

    assert(tokenIn, 'Missing USDC_ADDRESS_ARBITRUM in env')
    assert(stargatePool, 'Missing ARBITRUM_STARGATE_POOL in env')
    assert(destinationExecutor, 'Missing OAQUA_EXECUTOR_ADDRESS in .env. Deploy OAquaExecutor on Base first.')
    assert(destinationTokenIn, 'Missing USDC_ADDRESS_BASE in env')
    assert(destinationTokenOut, 'Missing USDT_ADDRESS_BASE in env')

    const endpointDeployment = await deployments.get('EndpointV2')

    console.log(`[Sender] Deploying to ${network.name}`)
    console.log(`[Sender] Deployer: ${deployer}`)
    console.log(`[Sender] Target Executor: ${destinationExecutor}`)

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [
            endpointDeployment.address,
            deployer,
            tokenIn,
            stargatePool,
            destinationExecutor,
            destinationEid,
            destinationTokenIn,
            destinationTokenOut,
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`[Sender] Deployed at: ${address}`)

    // Update .env file with new sender address
    updateEnvFile('OAQUA_SENDER_ADDRESS', address)
    updateEnvFile('OAQUA_SENDER_ADDRESS_ARBITRUM', address)
    console.log(`[Sender] Updated .env with address`)
}

deploy.tags = [contractName]

export default deploy
