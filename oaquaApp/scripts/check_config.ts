import { ethers } from "hardhat";

async function main() {
    const SENDER_ADDRESS = "0xF72bfcF655A4F5C10AE94426201f4974b7E61F9e";
    console.log(`Checking Sender: ${SENDER_ADDRESS}`);

    const sender = await ethers.getContractAt("OAquaSender", SENDER_ADDRESS);
    const executor = await sender.DESTINATION_EXECUTOR();
    console.log(`DESTINATION_EXECUTOR: ${executor}`);

    const EXPECTED = "0x28d621d606760813a6FF4b07D3838Ffdb6cCD93b";
    if (executor.toLowerCase() === EXPECTED.toLowerCase()) {
        console.log("✅ Matches new Non-Blocking Executor");
    } else {
        console.log("❌ MISMATCH! Points to WRONG Executor");
        if (executor.toLowerCase() === "0x93e93a0D6048Ba7A7cb9F7DCba9466b20BbB5F08".toLowerCase()) {
            console.log("   Points to OLD Blocking Executor");
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

