import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'

const contractName = 'OAquaExecutor'

const deploy: DeployFunction = async (hre) => {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    const aquaAddress = process.env.BASE_AQUA_ADDRESS
    const routerAddress = process.env.BASE_AQUA_SWAPVM_ROUTER
    const stargatePool = process.env.BASE_STARGATE_POOL
    const tokenIn = process.env.USDC_ADDRESS_BASE
    const tokenOut = process.env.USDT_ADDRESS_BASE

    assert(aquaAddress, 'Missing BASE_AQUA_ADDRESS in env')
    assert(routerAddress, 'Missing BASE_AQUA_SWAPVM_ROUTER in env')
    assert(stargatePool, 'Missing BASE_STARGATE_POOL in env')
    assert(tokenIn, 'Missing USDC_ADDRESS_BASE in env')
    assert(tokenOut, 'Missing USDT_ADDRESS_BASE in env')

    const endpointDeployment = await deployments.get('EndpointV2')

    console.log(`Network: ${network.name}`)
    console.log(`Deployer: ${deployer}`)
    console.log(`EndpointV2: ${endpointDeployment.address}`)

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [endpointDeployment.address, deployer, aquaAddress, routerAddress, stargatePool, tokenIn, tokenOut],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed ${contractName} on ${network.name}: ${address}`)
}

deploy.tags = [contractName]

export default deploy
