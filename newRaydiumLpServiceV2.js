const { Connection, PublicKey } = require('@solana/web3.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const connection = new Connection(process.env.SOLANA_WS_URL, 'confirmed');
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey(process.env.RAYDIUM_AMM_PROGRAM_ID);

let db;  // To store the database instance

// Function to connect to MongoDB
async function connectToDatabase() {
    const mongoUri = process.env.MONGO_URI;
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        db = client.db('bot');  // Change 'bot' to your preferred database name
        console.log("Connected to MongoDB successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);  // Exit if MongoDB connection fails
    }
}

// Function to save data to MongoDB
async function saveToMongo(tokenData) {
    try {
        if (!db) {
            throw new Error('Database connection is not initialized');
        }

        const collection = db.collection('raydium_lp_transactions');  // Change collection name as needed
        const result = await collection.insertOne(tokenData);

        if (result.acknowledged) {
            console.log('Token data saved to MongoDB:', result.insertedId);
        } else {
            console.error('Failed to save token data to MongoDB.');
        }
    } catch (error) {
        console.error('Error saving token data to MongoDB:', error.message);
    }
}

// Function to process Raydium LP transaction
async function processRaydiumLpTransaction(connection, signature) {
    try {
        // Fetch the transaction details
        const transactionDetails = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (transactionDetails) {
            const accounts = transactionDetails.transaction.message.staticAccountKeys.map(key => key.toString());

            console.log("Transaction Details:", transactionDetails.transaction.message);
            console.log("Accounts:", accounts);

            // Get instructions from compiledInstructions instead of instructions
            const instructions = transactionDetails.transaction.message.compiledInstructions;

            // Iterate over the instructions to find the LP creation instruction
            for (const ix of instructions) {
                const programId = accounts[ix.programIdIndex];

                // Check if this instruction is from the Raydium AMM program
                if (programId === RAYDIUM_AMM_PROGRAM_ID.toString() && ix.data.length > 0) {
                    try {
                        // Get accounts following Raydium SDK order
                        const tokenProgramId = accounts[ix.accounts[0]];
                        const ammId = accounts[ix.accounts[1]];
                        const ammAuthority = accounts[ix.accounts[2]];
                        const ammOpenOrders = accounts[ix.accounts[3]];
                        const lpMint = accounts[ix.accounts[4]];
                        const coinMint = accounts[ix.accounts[5]];
                        const pcMint = accounts[ix.accounts[6]];
                        const coinVault = accounts[ix.accounts[7]];
                        const pcVault = accounts[ix.accounts[8]];
                        const ammTargetOrders = accounts[ix.accounts[9]];
                        const marketId = accounts[ix.accounts[10]];
                        const userCoinVault = accounts[ix.accounts[11]];
                        const userPcVault = accounts[ix.accounts[12]];
                        const userLpVault = accounts[ix.accounts[13]];

                        // Get liquidity amount
                        const liquidityAmount = await connection.getBalance(new PublicKey(coinMint)) / 1e9;
                        console.log(`Liquidity Pool Amount (In SOL): ${liquidityAmount}`);

                        // Prepare token data for MongoDB following SDK structure
                        const tokenData = {
                            programId,
                            tokenProgramId: new PublicKey(tokenProgramId).toString(),
                            ammId: new PublicKey(ammId).toString(),
                            ammAuthority: new PublicKey(ammAuthority).toString(),
                            ammOpenOrders: new PublicKey(ammOpenOrders).toString(),
                            lpMint: new PublicKey(lpMint).toString(),
                            coinMint: new PublicKey(coinMint).toString(),
                            pcMint: new PublicKey(pcMint).toString(),
                            coinVault: new PublicKey(coinVault).toString(),
                            pcVault: new PublicKey(pcVault).toString(),
                            ammTargetOrders: new PublicKey(ammTargetOrders).toString(),
                            marketId: new PublicKey(marketId).toString(),
                            userCoinVault: new PublicKey(userCoinVault).toString(),
                            userPcVault: new PublicKey(userPcVault).toString(),
                            userLpVault: new PublicKey(userLpVault).toString(),
                            liquidityAmount,
                            timestamp: new Date()
                        };

                        // Save token data to MongoDB
                        await saveToMongo(tokenData);

                        return tokenData;
                    } catch (error) {
                        console.error('Error processing instruction accounts:', error);
                        console.log('Account indices:', ix.accounts);
                        console.log('Available accounts:', accounts);
                        continue;
                    }
                }
            }
        } else {
            console.error('No transaction details found for signature:', signature);
        }
    } catch (error) {
        console.error('Error fetching/processing transaction:', error.message);
    }
}

module.exports = {
    connectToDatabase,
    processRaydiumLpTransaction
};
