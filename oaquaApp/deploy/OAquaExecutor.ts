import assert from 'assert'
import { type DeployFunction } from 'hardhat-deploy/types'
import { updateEnvFile } from '../scripts/lib/envUpdater'

const contractName = 'OAquaExecutor'

const deploy: DeployFunction = async (hre) => {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    const aquaAddress = process.env.BASE_AQUA_ADDRESS
    const routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER
    const stargatePool = process.env.BASE_STARGATE_POOL

    assert(aquaAddress, 'Missing BASE_AQUA_ADDRESS in env')
    assert(routerAddress, 'Missing BASE_AQUA_SWAPVM_ROUTER in env')
    assert(stargatePool, 'Missing BASE_STARGATE_POOL in env')

    const endpointDeployment = await deployments.get('EndpointV2')

    console.log(`[Executor] Deploying to ${network.name}`)
    console.log(`[Executor] Deployer: ${deployer}`)

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [endpointDeployment.address, deployer, aquaAddress, routerAddress, stargatePool],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`[Executor] Deployed at: ${address}`)

    // Update .env file with new executor address
    updateEnvFile('OAQUA_EXECUTOR_ADDRESS', address)
    updateEnvFile('OAQUA_EXECUTOR_ADDRESS_BASE', address)
    console.log(`[Executor] Updated .env with address`)
}

deploy.tags = [contractName]

export default deploy
